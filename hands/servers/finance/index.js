#!/usr/bin/env node
// servers/finance/index.js — macf-finance MCP server (pilot)
//
// Capability-scoped MCP server: PayPal READ-ONLY tools for the CFO role.
// Part of the MACF Hands Gateway (~/workspace/macf/hands/ARCHITECTURE.md).
//
// Access control (fail closed):
//   MACF_ROLE must be "CFO" and MACF_ROLE_TOKEN must match the CFO entry in
//   the role-token file. Any other role -> the server refuses to start.
//   This is the server-side half of the per-role guardrail; client config
//   (which servers each role loads) is the other half.
//
// Credentials:
//   PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET from the environment (vault at
//   deploy time). The server errors clearly if unset — it never fabricates.
//
// Audit:
//   Every tool call is appended as JSON to logs/finance-audit.log.
//   This is the evidence behind "claim it only after it's done".
'use strict';

const fs = require('fs');
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const HANDS_ROOT = path.resolve(__dirname, '..', '..');
const ROLE_TOKENS_FILE = path.join(HANDS_ROOT, '.role-tokens');
const AUDIT_LOG = path.join(HANDS_ROOT, 'logs', 'finance-audit.log');

// ─── Role gate (fail closed) ─────────────────────────────────────────────────
function checkRole() {
  const role = process.env.MACF_ROLE;
  const token = process.env.MACF_ROLE_TOKEN;
  if (role !== 'CFO') {
    console.error('[macf-finance] REFUSED: MACF_ROLE must be CFO');
    process.exit(2);
  }
  // Token source: env var MACF_CFO_ROLE_TOKEN first (Railway/production),
  // then the 600-mode role-token file (local dev). Never commit the file.
  let expected = process.env[`MACF_${role}_ROLE_TOKEN`] || null;
  if (!expected) {
    try {
      const lines = fs.readFileSync(ROLE_TOKENS_FILE, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^CFO=(.+)$/);
        if (m) expected = m[1].trim();
      }
    } catch (e) { /* missing file -> refuse */ }
  }
  if (!expected || !token || token !== expected) {
    console.error('[macf-finance] REFUSED: invalid CFO role token');
    process.exit(2);
  }
  return role;
}

// ─── Audit log ───────────────────────────────────────────────────────────────
function audit(role, tool, args, ok, summary) {
  const entry = {
    ts: new Date().toISOString(),
    server: 'macf-finance',
    role,
    tool,
    args,
    ok,
    summary: String(summary).slice(0, 500),
  };
  try {
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('[macf-finance] audit log write failed:', e.message);
  }
}

// ─── PayPal REST client (client_credentials, read-only endpoints only) ───────
const PAYPAL_API = process.env.PAYPAL_ENVIRONMENT === 'SANDBOX'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

let cachedToken = null;
let tokenExpiry = 0;

async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('PayPal API credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET). Not fabricating data.');
  }
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en_US',
      'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal token request failed: HTTP ${res.status}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function paypalGet(path, params) {
  const token = await paypalToken();
  const url = new URL(`${PAYPAL_API}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
  }
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PayPal API ${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Tool implementations (READ-ONLY) ────────────────────────────────────────
async function transactionsRead({ start_date, end_date, limit }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const data = await paypalGet('/v1/reporting/transactions', {
    start_date: start_date || new Date(Date.now() - 30 * 864e5).toISOString(),
    end_date: end_date || new Date().toISOString(),
    page_size: lim,
    fields: 'transaction_info',
  });
  const txns = (data.transaction_details || []).map(d => {
    const t = d.transaction_info || {};
    return {
      id: t.transaction_id,
      date: t.transaction_initiation_date,
      status: t.transaction_status,
      amount: t.transaction_amount ? `${t.transaction_amount.value} ${t.transaction_amount.currency_code}` : null,
      payer: t.payer_info ? t.payer_info.payer_name : null,
      type: t.transaction_event_code,
    };
  });
  return {
    count: txns.length,
    total_pages: data.total_pages,
    transactions: txns,
    note: 'Read-only. No money moved.',
  };
}

async function balanceRead() {
  const data = await paypalGet('/v1/reporting/balances', {
    as_of_time: new Date().toISOString(),
  });
  const balances = (data.balances || []).map(b => ({
    currency: b.currency,
    total: b.total_balance ? b.total_balance.value : null,
    available: b.available_balance ? b.available_balance.value : null,
    withheld: b.withheld_balance ? b.withheld_balance.value : null,
  }));
  return { balances, note: 'Read-only. No money moved.' };
}

const TOOLS = [
  {
    name: 'finance_transactions_read',
    description: 'READ-ONLY: list PayPal transactions in a date window. Use for verified revenue ground truth. Never moves money.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO 8601 start (default: 30 days ago)' },
        end_date: { type: 'string', description: 'ISO 8601 end (default: now)' },
        limit: { type: 'integer', description: 'Max transactions (default 20, max 100)' },
      },
    },
  },
  {
    name: 'finance_balance_read',
    description: 'READ-ONLY: current PayPal balances by currency. Use for verified cash position. Never moves money.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Server ──────────────────────────────────────────────────────────────────
async function main() {
  const role = checkRole();

  const server = new Server(
    { name: 'macf-finance', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    audit(role, 'tools/list', {}, true, `${TOOLS.length} tools`);
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = args || {};
    try {
      let result;
      if (name === 'finance_transactions_read') {
        result = await transactionsRead(a);
      } else if (name === 'finance_balance_read') {
        result = await balanceRead();
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
      audit(role, name, a, true, `ok, count=${result.count ?? result.balances?.length ?? 0}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      audit(role, name, a, false, err.message);
      return {
        content: [{ type: 'text', text: `ERROR: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[macf-finance] serving ${TOOLS.length} read-only tools for role ${role}`);
}

main().catch((err) => {
  console.error('[macf-finance] fatal:', err.message);
  process.exit(1);
});
