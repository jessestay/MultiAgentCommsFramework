/**
 * Agent Tool Execution Layer (Oct 9, 2026; #724 layer Oct 12, 2026)
 *
 * Root cause of MACF delivery failure: agents are pure LLM text generators.
 * handleDelegation() explicitly reports "no tool execution" — agents cannot
 * build artifacts, check URLs, write files, or produce anything clickable.
 * Jesse's demo standard requires clickable artifacts. This was impossible by design.
 *
 * This module gives agents a safe, bounded set of tools they can invoke
 * during delegation. Every tool call is logged, bounded, and reversible.
 *
 * #724 (docs/code-enforced-tool-use-design.md, Pillars 1 + 4) adds two
 * guarantees at this single choke point:
 *   1. Every execution issues a structured receipt (engine/receipts.js) —
 *      success, tool failure, validation failure, and unknown tool alike.
 *      There are no early returns before the receipt/audit tail.
 *   2. Arguments are validated against a per-tool argsSchema BEFORE the
 *      tool function runs. Violations return a structured, machine-readable
 *      correction { expected, received, missing, unknown } with
 *      errorClass 'invalid_input' — the tool function is never invoked.
 * The tool implementations below are byte-for-byte the pre-#724 behavior;
 * only the registry/dispatch layer changed.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Workspace sandbox — agents can only write here
const SANDBOX = path.join(process.env.HOME || '/home/hatch', 'workspace', 'agent-sandbox');

// Per-tool timeouts (ms)
const TIMEOUTS = {
  urlCheck: 15000,
  fileWrite: 5000,
  fileRead: 5000,
};

/**
 * Check if a URL is reachable and return status.
 * Used for validating artifact links before demoing them.
 */
function urlCheck(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Invalid URL — must start with http:// or https://' };
  }
  try {
    // Use curl with strict timeout, no redirects beyond 3, fail on HTTP errors
    const out = execFileSync('curl', [
      '-s', '-o', '/dev/null',
      '-w', '%{http_code}:%{time_total}',
      '--max-time', '10',
      '--max-redirs', '3',
      '-L',
      url,
    ], { encoding: 'utf8', timeout: TIMEOUTS.urlCheck }).trim();
    const [code, time] = out.split(':');
    const httpCode = parseInt(code, 10);
    return {
      ok: httpCode >= 200 && httpCode < 400,
      httpCode,
      responseTime: parseFloat(time),
      url,
    };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200), url };
  }
}

/**
 * Write a file to the agent sandbox. Returns the sandbox-relative path.
 * Agents use this to create demo artifacts (drafts, reports, HTML previews).
 */
function fileWrite(relativePath, content) {
  // Security: reject any path traversal attempts outright
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('..')) {
    return { ok: false, error: 'Path traversal blocked' };
  }

  const safe = path.normalize(relativePath);
  const fullPath = path.join(SANDBOX, safe);
  try {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return {
      ok: true,
      path: fullPath,
      sandboxPath: safe,
      size: Buffer.byteLength(content, 'utf8'),
    };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

/**
 * Read a file from the agent sandbox.
 */
function fileRead(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('..')) {
    return { ok: false, error: 'Path traversal blocked' };
  }
  const safe = path.normalize(relativePath);
  const fullPath = path.join(SANDBOX, safe);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    return { ok: true, content: content.slice(0, 50000), size: content.length };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

/**
 * List files in the agent sandbox.
 */
function fileList(relativePath = '') {
  if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
    return { ok: false, error: 'Path traversal blocked' };
  }
  const safe = path.normalize(relativePath || '.');
  const fullPath = path.join(SANDBOX, safe);
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return {
      ok: true,
      entries: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
      })),
    };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

/**
 * Desktop channel (Oct 12, 2026 — Jesse's order: "Extend the CTO's grants
 * to the desktop channels", Vikunja #738). Runs PowerShell on Jesse's
 * desktop (DESKTOP-4U63DES) through the desktop agent client — the same
 * channel the CEO uses (~/workspace/desktop-agent/bin/desktop-run). The
 * client talks to the agent at 100.92.127.117:8099 via the tunnel proxy
 * and authenticates with DESKTOP_AGENT_TOKEN (slack-agents/.env, loaded
 * by dotenv at engine boot). Role-gated at the executeTool choke point:
 * only the roles listed on the registry entries below may call these.
 *
 * Commands must stay SMALL and BOUNDED (the desktop agent is
 * single-threaded; one long command blocks all others): cap the output,
 * cap the scope, never run unbounded recursive scans.
 */
const DESKTOP_RUN_CLIENT = '/home/hatch/workspace/desktop-agent/bin/desktop-run';

function desktopCall(argv, timeoutMs) {
  try {
    const out = execFileSync('python3', [DESKTOP_RUN_CLIENT, ...argv], {
      encoding: 'utf8',
      timeout: timeoutMs,
      env: { ...process.env, DESKTOP_RUN_TOKEN: process.env.DESKTOP_AGENT_TOKEN || '' },
    });
    return { ok: true, output: String(out).slice(0, 8000) };
  } catch (e) {
    const stdout = e.stdout ? String(e.stdout).slice(0, 2000) : '';
    const stderr = e.stderr ? String(e.stderr).slice(0, 500) : '';
    return { ok: false, error: (stderr || e.message).slice(0, 500), output: stdout };
  }
}

function desktopHealth() {
  return desktopCall(['health'], 30000);
}

function desktopRun(command, timeoutSec = 120) {
  const t = Math.max(5, Math.min(parseInt(timeoutSec, 10) || 120, 300));
  const r = desktopCall([command, String(t)], (t + 30) * 1000);
  if (!r.ok) return r;
  return { ok: true, output: r.output, timeoutSec: t };
}

/**
 * codeRead — #807 Phase 2 (US-P2.1, sandbox read alignment). The CTO's
 * #745 assessment claimed "workspace permissions block access" to the very
 * code and state the agents own, because fileRead only reaches the agent
 * sandbox. This tool gives leadership roles read access to the MACF tree
 * (source + state), read-only, with secret-bearing files denied by
 * construction. Paths are relative to the MACF repo root.
 */
const MACF_ROOT = path.resolve(__dirname, '..', '..');
const CODEREAD_DENY = /(^|\/)\.env($|\.)|(^|\/)credentials($|\.)|secret|\.pem$|\.key$|(^|\/)id_[a-z0-9]+$/i;
const CODEREAD_BINARY = /\.(png|jpe?g|gif|webp|pdf|zip|gz|db|sqlite|mp[34]|mov)$/i;

function codeRead(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return { ok: false, error: 'Path must be relative to the MACF root' };
  }
  const fullPath = path.resolve(MACF_ROOT, relativePath);
  if (fullPath !== MACF_ROOT && !fullPath.startsWith(MACF_ROOT + path.sep)) {
    return { ok: false, error: 'Path escapes the MACF tree — refused' };
  }
  const rel = path.relative(MACF_ROOT, fullPath);
  if (CODEREAD_DENY.test(rel)) {
    return { ok: false, error: 'Secret-bearing files are not readable through codeRead', errorClass: 'permission' };
  }
  if (CODEREAD_BINARY.test(rel)) {
    return { ok: false, error: 'Binary file — use a purpose-built reader (pdfRead for PDFs)' };
  }
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    return { ok: true, content: content.slice(0, 50000), size: content.length, path: rel };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

/**
 * pdfRead — #807 Phase 2 (US-P2.2). Text extraction from PDFs in the
 * agent sandbox via pdftotext (the #658 product-PDF class of work:
 * verdicts were claimed for PDFs the agents could not actually read).
 */
function pdfRead(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('..')) {
    return { ok: false, error: 'Path traversal blocked' };
  }
  if (!/\.pdf$/i.test(relativePath)) {
    return { ok: false, error: 'pdfRead only reads .pdf files' };
  }
  const fullPath = path.join(SANDBOX, path.normalize(relativePath));
  try {
    const out = execFileSync('pdftotext', ['-layout', fullPath, '-'], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, text: out.slice(0, 50000), chars: out.length };
  } catch (e) {
    return { ok: false, error: (e.stderr ? String(e.stderr) : e.message).slice(0, 200) };
  }
}

/**
 * WordPress REST — #807 Phase 2 (US-P2.3). The CMO failed the workshop
 * page three times because no write path to WordPress existed anywhere
 * in the registry (the audit found zero wordpress references in source).
 * wpRead/wpUpdate give granted roles the real actuator: app-password
 * Basic auth from env (WP_BASE_URL / WP_USER / WP_APP_PASSWORD), every
 * call receipted by the executeTool choke point.
 */
function wpConfig() {
  const user = process.env.WP_USER || '';
  const pass = process.env.WP_APP_PASSWORD || '';
  if (!user || !pass) return null;
  return { base: (process.env.WP_BASE_URL || 'https://staynalive.com').replace(/\/+$/, ''), user, pass };
}

function wpCurl(method, pathQ, jsonBody) {
  const cfg = wpConfig();
  if (!cfg) {
    return { ok: false, error: 'WordPress is not configured (WP_USER / WP_APP_PASSWORD missing) — the credential must be provisioned before this tool can act', errorClass: 'missing_credential' };
  }
  const auth = Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64');
  const args = ['-s', '--max-time', '20', '-X', method, '-H', `Authorization: Basic ${auth}`, '-H', 'Content-Type: application/json'];
  if (/localhost|127\.0\.0\.1/.test(cfg.base)) args.push('--noproxy', '*');
  if (jsonBody) args.push('--data', JSON.stringify(jsonBody));
  args.push('-w', '\n%{http_code}', `${cfg.base}${pathQ}`);
  try {
    const out = execFileSync('curl', args, { encoding: 'utf8', timeout: 25000 });
    const nl = out.lastIndexOf('\n');
    const code = parseInt(out.slice(nl + 1), 10);
    const parsed = JSON.parse(out.slice(0, nl) || '{}');
    if (code < 200 || code >= 300) {
      return { ok: false, error: `WordPress API ${code}: ${parsed.message || parsed.code || 'error'}`, httpCode: code };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

function wpShape(p) {
  return {
    ok: true,
    id: p.id,
    slug: p.slug,
    status: p.status,
    modified: p.modified,
    title: p.title && p.title.rendered,
    contentRendered: p.content && typeof p.content.rendered === 'string' ? p.content.rendered.slice(0, 50000) : '',
  };
}

function wpRead(args) {
  if (args.id) {
    const r = wpCurl('GET', `/wp-json/wp/v2/pages/${parseInt(args.id, 10)}`);
    return r.ok ? wpShape(r.data) : r;
  }
  const r = wpCurl('GET', `/wp-json/wp/v2/pages?slug=${encodeURIComponent(args.slug)}&status=any`);
  if (!r.ok) return r;
  if (!Array.isArray(r.data) || !r.data.length) return { ok: false, error: `No page found with slug '${args.slug}'` };
  return wpShape(r.data[0]);
}

function wpUpdate(args) {
  const body = {};
  if (typeof args.content === 'string') body.content = args.content;
  if (typeof args.title === 'string') body.title = args.title;
  if (typeof args.status === 'string') body.status = args.status;
  if (!Object.keys(body).length) return { ok: false, error: 'Nothing to update — provide content, title, or status' };
  const r = wpCurl('POST', `/wp-json/wp/v2/pages/${parseInt(args.id, 10)}`, body);
  return r.ok ? wpShape(r.data) : r;
}

/**
 * webFetch — #807 Phase 2 (US-P2.6). urlCheck only returns a status code,
 * so agents "verified" pages they never actually read (the audit-page
 * and workshop-page failures both passed through status-only checks).
 * webFetch returns the page's readable text: scripts/styles stripped,
 * tags removed, entities decoded, capped.
 */
function webFetch(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Invalid URL — must start with http:// or https://' };
  }
  try {
    const args = ['-s', '-L', '--max-redirs', '3', '--max-time', '20', '-A', 'Mozilla/5.0 (MACF agent webFetch)', '-w', '\n%{http_code}'];
    if (/localhost|127\.0\.0\.1/.test(url)) args.push('--noproxy', '*');
    args.push(url);
    const out = execFileSync('curl', args, { encoding: 'utf8', timeout: 25000, maxBuffer: 5 * 1024 * 1024 });
    const nl = out.lastIndexOf('\n');
    const code = parseInt(out.slice(nl + 1), 10);
    const html = out.slice(0, nl);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return { ok: code >= 200 && code < 400, httpCode: code, url, text: text.slice(0, 20000), chars: text.length };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200), url };
  }
}

// Tool registry — what agents are allowed to call. `fn` takes the args
// object (generic dispatch); `argsSchema` is the validation contract.
// An entry may carry `roles: [...]` — executeTool then refuses the call
// (errorClass 'permission', still receipted) unless ctx.agentId is listed.
const TOOLS = {
  urlCheck: {
    fn: (args) => urlCheck(args.url),
    description: 'Check if a URL is reachable. Input: {url}. Returns HTTP status and response time.',
    argsSchema: {
      type: 'object',
      properties: { url: { type: 'string', format: 'url' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  fileWrite: {
    fn: (args) => fileWrite(args.path, args.content),
    description: 'Write a file to the agent sandbox. Input: {path, content}. Path must be RELATIVE (e.g. "reports/status.txt", NOT "/home/sandbox/..."). Returns sandbox path.',
    argsSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  fileRead: {
    fn: (args) => fileRead(args.path),
    description: 'Read a file from the agent sandbox. Input: {path}. Path must be RELATIVE (e.g. "reports/status.txt"). Returns content.',
    argsSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  fileList: {
    fn: (args) => fileList(args.path),
    description: 'List files in the agent sandbox. Input: {path?}. Path must be RELATIVE or empty for root. Returns entries.',
    argsSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
  },
  webFetch: {
    fn: (args) => webFetch(args.url),
    description: 'Fetch a web page and return its readable TEXT (scripts/styles stripped). Input: {url}. Use this to actually READ a page you are verifying — urlCheck only gives a status code. Returns httpCode and text.',
    argsSchema: {
      type: 'object',
      properties: { url: { type: 'string', format: 'url' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  codeRead: {
    fn: (args) => codeRead(args.path),
    roles: ['cto', 'ceo', 'execpm'],
    description: 'Read a file from the MACF tree you own (source code, engine, .state summaries). Input: {path} RELATIVE to the MACF root (e.g. "slack-agents/utils/litellm.js", "slack-agents/.state/circuit-breaker.json"). Read-only. Secret files (.env, credentials, keys) are denied. CTO/CEO/ExecPM only.',
    argsSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  pdfRead: {
    fn: (args) => pdfRead(args.path),
    description: 'Extract text from a PDF in the agent sandbox. Input: {path} RELATIVE to the sandbox (e.g. "research/product.pdf"). Returns the extracted text.',
    argsSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  wpRead: {
    fn: (args) => wpRead(args),
    roles: ['cmo', 'cto', 'ceo'],
    description: 'Read a staynalive.com WordPress page via the REST API. Input: {slug} or {id}. Returns id, slug, status, title, and the rendered content. CMO/CTO/CEO only.',
    argsSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, id: { type: 'number' } },
      required: [],
      additionalProperties: false,
    },
  },
  wpUpdate: {
    fn: (args) => wpUpdate(args),
    roles: ['cmo', 'cto', 'ceo'],
    description: 'Update a staynalive.com WordPress page via the REST API. Input: {id, content?, title?, status?}. Writes are receipted; use only with an approved change. CMO/CTO/CEO only.',
    argsSchema: {
      type: 'object',
      properties: { id: { type: 'number' }, content: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  desktopHealth: {
    fn: () => desktopHealth(),
    roles: ['cto', 'ceo'],
    description: 'Check the health of Jesse\'s desktop agent (DESKTOP-4U63DES). No input. Returns the agent health JSON. CTO/CEO only.',
    argsSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  desktopRun: {
    fn: (args) => desktopRun(args.command, args.timeoutSec),
    roles: ['cto', 'ceo'],
    description: 'Run a PowerShell command on Jesse\'s desktop (DESKTOP-4U63DES) via the desktop agent. Input: {command, timeoutSec? (5-300, default 120)}. Keep commands SMALL and BOUNDED — the desktop agent is single-threaded; never run unbounded recursive scans. Returns the command output. CTO/CEO only.',
    argsSchema: {
      type: 'object',
      properties: { command: { type: 'string' }, timeoutSec: { type: 'number' } },
      required: ['command'],
      additionalProperties: false,
    },
  },
};

// ─── Argument-schema validation (Pillar 4) ──────────────────────────────────
//
// Returns null when args are valid, or { error, correction } where the
// correction is the machine-readable object the generateWithTools loop
// branches on: { expected: {arg: 'type'}, received: [keys], missing: [keys],
// unknown: [keys], invalid?: [{key, expected, received}] }.

function validateArgs(toolName, args) {
  const tool = TOOLS[toolName];
  if (!tool || !tool.argsSchema) return null;
  const schema = tool.argsSchema;
  const props = schema.properties || {};
  const input = args && typeof args === 'object' ? args : {};
  const received = Object.keys(input);
  const missing = (schema.required || []).filter(k => input[k] === undefined);
  const unknown = schema.additionalProperties === false
    ? received.filter(k => !(k in props)) : [];
  const invalid = [];
  let formatError = null;
  for (const [key, spec] of Object.entries(props)) {
    const v = input[key];
    if (v === undefined) continue;
    if (spec.type === 'string' && typeof v !== 'string') invalid.push({ key, expected: 'string', received: typeof v });
    else if (spec.type === 'number' && typeof v !== 'number') invalid.push({ key, expected: 'number', received: typeof v });
    else if (spec.type === 'boolean' && typeof v !== 'boolean') invalid.push({ key, expected: 'boolean', received: typeof v });
    else if (spec.type === 'object' && (typeof v !== 'object' || v === null)) invalid.push({ key, expected: 'object', received: typeof v });
    if (spec.format === 'url' && typeof v === 'string' && !/^https?:\/\//i.test(v)) {
      formatError = { key, value: v };
    }
  }
  if (!missing.length && !unknown.length && !invalid.length && !formatError) return null;

  const expected = {};
  for (const [k, spec] of Object.entries(props)) {
    expected[k] = spec.format ? `${spec.type} (${spec.format})` : spec.type;
  }
  const correction = { expected, received, missing, unknown };
  if (invalid.length) correction.invalid = invalid;

  let error;
  if (formatError) {
    // Preserve the long-standing error contract: the message starts with
    // "Invalid URL" (pinned by pre-existing tests and the auditor's
    // invalid_input classification).
    error = `Invalid URL — ${JSON.stringify(formatError.value)} is not an http(s) URL for ${toolName}; expected {${formatError.key}: string (url)}, received keys: ${JSON.stringify(received)}`;
  } else {
    const parts = [];
    if (missing.length) parts.push(`missing required: ${missing.join(', ')}`);
    if (unknown.length) parts.push(`unknown args: ${unknown.join(', ')}`);
    if (invalid.length) parts.push(`wrong types: ${invalid.map(i => `${i.key} expected ${i.expected}, got ${i.received}`).join('; ')}`);
    error = `Invalid arguments for ${toolName}: ${parts.join('; ')} — expected ${JSON.stringify(expected)}, received keys: ${JSON.stringify(received)}`;
  }
  return { error, correction };
}

// ─── The choke point ────────────────────────────────────────────────────────
//
// executeTool(toolName, args, ctx) — ctx = { agentId, taskId } is optional
// and backward compatible. Dispatch is generic over the registry (no
// per-tool switch). Every exit path flows through finishExecution: log,
// auditor hook on failure, receipt — no exceptions.

function executeTool(toolName, args = {}, ctx = {}) {
  const tool = TOOLS[toolName];
  const start = Date.now();
  let result;
  if (!tool) {
    // NOTE: no early return — this result must flow through the logging +
    // auditor + receipt tail below, or hallucinated tool names would be
    // invisible (caught by tests Oct 12, 2026; #724 makes it structural).
    result = { ok: false, error: `Unknown tool: ${toolName}`, errorClass: 'unknown_tool' };
  } else if (tool.roles && !(ctx && tool.roles.includes(ctx.agentId))) {
    // Role gate (Oct 12, 2026 — #738): restricted tools (desktop channel)
    // fail closed unless the calling agent is on the entry's role list.
    // No early return — flows through the same receipt/audit tail.
    result = { ok: false, error: `Tool ${toolName} is not granted to agent '${(ctx && ctx.agentId) || 'unknown'}'`, errorClass: 'permission' };
  } else {
    const violation = validateArgs(toolName, args || {});
    if (violation) {
      result = { ok: false, error: violation.error, errorClass: 'invalid_input', correction: violation.correction };
    } else try {
      result = tool.fn(args || {});
    } catch (e) {
      result = { ok: false, error: e.message.slice(0, 200) };
    }
  }
  return finishExecution(toolName, args, ctx, result, start);
}

function finishExecution(toolName, args, ctx, result, start) {
  result = result || { ok: false, error: 'Tool returned no result' };
  result.tool = toolName;
  result.durationMs = Date.now() - start;

  // Log every tool call
  console.log(`[agentTools] ${toolName}(${JSON.stringify(args || {}).slice(0, 100)}) → ${result.ok ? 'ok' : 'fail'} (${result.durationMs}ms)`);

  // TOOL AUDITOR (Oct 12, 2026 — Vikunja #722): a failed tool call is
  // recorded, classified, and auto-fixed the second it happens. Lazy require
  // + try/catch: the auditor must never break tool execution.
  if (!result.ok) {
    try {
      require('../engine/toolUsageAuditor').recordToolEvent({
        tool: toolName, args, result,
        agentId: (ctx && ctx.agentId) || null, taskId: (ctx && ctx.taskId) || null,
      });
    } catch { /* fail-open */ }
  }

  // RECEIPT (Oct 12, 2026 — #724, Pillar 1): issued on every path. Fail-open
  // for the tool call; the ledger itself fails closed for readers.
  try {
    require('../engine/receipts').issueReceipt({
      agentId: (ctx && ctx.agentId) || null, taskId: (ctx && ctx.taskId) || null,
      tool: toolName, args: args || {}, result,
    });
  } catch { /* fail-open */ }

  return result;
}

/**
 * executeMcpTool — #807 Phase 2 (US-P2.5). Dispatch for MCP-backed tools
 * (namespaced mcp_<server>_<tool>, built by utils/mcpTools.js from
 * hands/grants.json). Async because MCP invocation is async; everything
 * else about the contract matches executeTool: the grant is re-checked
 * here at the choke point (defense in depth — the defs an agent sees
 * are already grant-filtered, but a hallucinated call must fail too),
 * and the result flows through the same finishExecution tail (log,
 * auditor, receipt).
 */
async function executeMcpTool(toolName, args = {}, ctx = {}, mcpSpec = null) {
  const start = Date.now();
  let result;
  if (!mcpSpec || !mcpSpec.server || !mcpSpec.tool) {
    result = { ok: false, error: `Unknown tool: ${toolName}`, errorClass: 'unknown_tool' };
  } else {
    let granted = false;
    try {
      granted = require('./mcpTools').grantedServers(ctx && ctx.agentId).includes(mcpSpec.server);
    } catch { granted = false; }
    if (!granted) {
      result = { ok: false, error: `MCP server '${mcpSpec.server}' is not granted to agent '${(ctx && ctx.agentId) || 'unknown'}'`, errorClass: 'permission' };
    } else {
      try {
        const mcpClient = require('../engine/mcpClient');
        const raw = await mcpClient.invokeTool(mcpSpec.server, mcpSpec.tool, args || {});
        const parts = (raw && Array.isArray(raw.content)) ? raw.content : [];
        const text = parts.filter(p => p && p.type === 'text').map(p => p.text).join('\n');
        const grants = require('./mcpTools').loadGrants();
        const cap = (grants.defaults && grants.defaults.max_tool_output_chars) || 8000;
        result = {
          ok: !(raw && raw.isError),
          output: (text || JSON.stringify(raw || {})).slice(0, cap),
          mcp: { server: mcpSpec.server, tool: mcpSpec.tool },
        };
        if (!result.ok) result.error = result.output.slice(0, 300) || 'MCP tool returned an error';
      } catch (e) {
        result = { ok: false, error: e.message.slice(0, 300), errorClass: 'mcp_error' };
      }
    }
  }
  return finishExecution(toolName, args, ctx, result, start);
}

/**
 * Get tool descriptions for inclusion in agent prompts.
 */
function getToolDescriptions() {
  return Object.entries(TOOLS)
    .map(([name, t]) => `- ${name}: ${t.description}`)
    .join('\n');
}

module.exports = {
  executeTool,
  executeMcpTool,
  getToolDescriptions,
  validateArgs,
  TOOLS,
  SANDBOX,
};
