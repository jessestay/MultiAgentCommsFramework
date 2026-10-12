/**
 * Task Contracts (Oct 12, 2026 — Vikunja #724, Pillar 2)
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 2.
 *
 * A contract lives in the Vikunja task description as a fenced JSON block
 * between MACF-CONTRACT markers. Parsing is a deterministic JSON.parse of
 * that block — never prose inference. A task whose block is missing or
 * unparseable has NO contract and follows the legacy path until triaged.
 *
 * Contracts are authored from templates (below) by whoever creates the
 * task: ticket-triage, pm-breakdown, and CEO-created tasks stamp a contract
 * by naming a template plus parameters, without hand-writing JSON.
 */

const BLOCK_RE = /<!--\s*MACF-CONTRACT\s*([\s\S]*?)\s*MACF-CONTRACT\s*-->/;

function normalizeContract(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return {
    version: 1,
    taskId: raw.taskId != null ? raw.taskId : null,
    executor: raw.executor || null,
    requiredTools: Array.isArray(raw.requiredTools) ? raw.requiredTools : [],
    postconditions: Array.isArray(raw.postconditions) ? raw.postconditions : [],
    deliverable: raw.deliverable && typeof raw.deliverable === 'object'
      ? { schema: raw.deliverable.schema || 'generic@v1' }
      : { schema: 'generic@v1' },
    // Executor inputs (Phase 3): the data the executor's mechanical steps
    // need — URLs to sweep, input files, the ticket spec, the prepared
    // message. Data, authored with the contract, never model prose.
    params: raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params) ? raw.params : {},
    maxAttempts: Number.isInteger(raw.maxAttempts) && raw.maxAttempts > 0 ? raw.maxAttempts : 3,
  };
}

/** Extract the contract from a task description. Null when absent/invalid. Never throws. */
function parseContract(description) {
  try {
    if (!description || typeof description !== 'string') return null;
    const m = description.match(BLOCK_RE);
    if (!m) return null;
    return normalizeContract(JSON.parse(m[1]));
  } catch {
    return null;
  }
}

function renderContractBlock(contract) {
  const c = normalizeContract(contract) || contract;
  return `<!-- MACF-CONTRACT\n${JSON.stringify(c, null, 2)}\nMACF-CONTRACT -->`;
}

/** Append the contract block to a description, replacing any existing one. */
function stampContract(description, contract) {
  const base = String(description || '').replace(BLOCK_RE, '').trimEnd();
  return `${base}\n\n${renderContractBlock(contract)}\n`;
}

// ─── Templates ──────────────────────────────────────────────────────────────
// Each returns a normalized contract. Parameters are data the creator
// already knows (URLs to sweep, the artifact path a report must produce).

const templates = {
  urlSweep({ taskId, urls = [] } = {}) {
    return normalizeContract({
      taskId,
      executor: 'url-sweep',
      requiredTools: [{ tool: 'urlCheck', minSuccess: urls.length }],
      postconditions: [{ type: 'receipt_count', tool: 'urlCheck', status: 'ok', min: urls.length }],
      deliverable: { schema: 'url-sweep@v1' },
      params: { urls },
      maxAttempts: 3,
    });
  },

  fileReport({ taskId, path: reportPath, minBytes = 1, inputs = [] } = {}) {
    return normalizeContract({
      taskId,
      executor: 'file-report',
      requiredTools: [{ tool: 'fileWrite', minSuccess: 1 }],
      postconditions: [{ type: 'file_exists', path: reportPath, minBytes }],
      deliverable: { schema: 'file-report@v1' },
      params: { inputs, outputPath: reportPath },
      maxAttempts: 3,
    });
  },

  researchWithArtifact({ taskId, path: artifactPath, minBytes = 1 } = {}) {
    return normalizeContract({
      taskId,
      executor: null,
      requiredTools: [{ tool: 'fileWrite', minSuccess: 1 }],
      postconditions: [{ type: 'file_exists', path: artifactPath, minBytes }],
      deliverable: { schema: 'research-report@v1' },
      maxAttempts: 3,
    });
  },

  ticketFiling({ taskId, tickets = [] } = {}) {
    return normalizeContract({
      taskId,
      executor: 'ticket-filer',
      requiredTools: [],
      postconditions: [{ type: 'vikunja_task_exists', taskId }],
      deliverable: { schema: 'ticket-filing@v1' },
      params: { tickets },
      maxAttempts: 3,
    });
  },

  slackPost({ taskId, channel = null, text = null } = {}) {
    return normalizeContract({
      taskId,
      executor: 'slack-poster',
      requiredTools: [],
      postconditions: [{ type: 'artifact_posted', kind: 'slack_message' }],
      deliverable: { schema: 'slack-post@v1' },
      params: { channel, text },
      maxAttempts: 3,
    });
  },
};

module.exports = { parseContract, renderContractBlock, stampContract, normalizeContract, templates };
