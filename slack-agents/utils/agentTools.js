/**
 * Agent Tool Execution Layer (Oct 9, 2026)
 *
 * Root cause of MACF delivery failure: agents are pure LLM text generators.
 * handleDelegation() explicitly reports "no tool execution" — agents cannot
 * build artifacts, check URLs, write files, or produce anything clickable.
 * Jesse's demo standard requires clickable artifacts. This was impossible by design.
 *
 * This module gives agents a safe, bounded set of tools they can invoke
 * during delegation. Every tool call is logged, bounded, and reversible.
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

// Tool registry — what agents are allowed to call
const TOOLS = {
  urlCheck: {
    fn: urlCheck,
    description: 'Check if a URL is reachable. Input: {url}. Returns HTTP status and response time.',
  },
  fileWrite: {
    fn: fileWrite,
    description: 'Write a file to the agent sandbox. Input: {path, content}. Path must be RELATIVE (e.g. "reports/status.txt", NOT "/home/sandbox/..."). Returns sandbox path.',
  },
  fileRead: {
    fn: fileRead,
    description: 'Read a file from the agent sandbox. Input: {path}. Path must be RELATIVE (e.g. "reports/status.txt"). Returns content.',
  },
  fileList: {
    fn: fileList,
    description: 'List files in the agent sandbox. Input: {path?}. Path must be RELATIVE or empty for root. Returns entries.',
  },
};

/**
 * Execute a tool by name with arguments. All calls are logged.
 */
function executeTool(toolName, args = {}) {
  const tool = TOOLS[toolName];
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }

  const start = Date.now();
  let result;
  try {
    switch (toolName) {
      case 'urlCheck':
        result = tool.fn(args.url);
        break;
      case 'fileWrite':
        result = tool.fn(args.path, args.content);
        break;
      case 'fileRead':
        result = tool.fn(args.path);
        break;
      case 'fileList':
        result = tool.fn(args.path);
        break;
      default:
        result = { ok: false, error: 'Not implemented' };
    }
  } catch (e) {
    result = { ok: false, error: e.message.slice(0, 200) };
  }

  result.tool = toolName;
  result.durationMs = Date.now() - start;

  // Log every tool call
  console.log(`[agentTools] ${toolName}(${JSON.stringify(args).slice(0, 100)}) → ${result.ok ? 'ok' : 'fail'} (${result.durationMs}ms)`);

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
  TOOLS,
  SANDBOX,
};
