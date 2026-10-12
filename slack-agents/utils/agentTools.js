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

// Tool registry — what agents are allowed to call. `fn` takes the args
// object (generic dispatch); `argsSchema` is the validation contract.
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
 * Get tool descriptions for inclusion in agent prompts.
 */
function getToolDescriptions() {
  return Object.entries(TOOLS)
    .map(([name, t]) => `- ${name}: ${t.description}`)
    .join('\n');
}

module.exports = {
  executeTool,
  getToolDescriptions,
  validateArgs,
  TOOLS,
  SANDBOX,
};
