/**
 * Task contract tests (Phase 2, Vikunja #724) — Pillar 2 / US-103, US-104.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 2.
 * A contract lives in the Vikunja task description as a fenced JSON block
 * between MACF-CONTRACT markers. Parsing is deterministic (JSON.parse) —
 * missing or malformed blocks mean NO contract, never a throw.
 */
const { parseContract, renderContractBlock, stampContract, templates, normalizeContract } = require('../taskContract');

const CONTRACT = {
  version: 1,
  taskId: 702,
  executor: null,
  requiredTools: [{ tool: 'fileWrite', minSuccess: 1 }],
  postconditions: [{ type: 'file_exists', path: 'reports/pricing-scan.md', minBytes: 200 }],
  deliverable: { schema: 'research-report@v1' },
  maxAttempts: 3,
};

describe('parseContract', () => {
  test('extracts a contract from a description', () => {
    const desc = `Evaluate the pricing PDFs.\n\n${renderContractBlock(CONTRACT)}`;
    const parsed = parseContract(desc);
    expect(parsed).not.toBeNull();
    expect(parsed.taskId).toBe(702);
    expect(parsed.postconditions).toEqual(CONTRACT.postconditions);
    expect(parsed.requiredTools).toEqual(CONTRACT.requiredTools);
    expect(parsed.deliverable.schema).toBe('research-report@v1');
  });

  test('absent block → null (legacy path)', () => {
    expect(parseContract('Just a normal task description.')).toBeNull();
    expect(parseContract('')).toBeNull();
    expect(parseContract(null)).toBeNull();
    expect(parseContract(undefined)).toBeNull();
  });

  test('malformed JSON → null, never a throw', () => {
    const desc = 'Task.\n<!-- MACF-CONTRACT\n{not json at all\nMACF-CONTRACT -->';
    expect(() => parseContract(desc)).not.toThrow();
    expect(parseContract(desc)).toBeNull();
  });

  test('JSON that is not a contract object → null', () => {
    const desc = '<!-- MACF-CONTRACT\n"just a string"\nMACF-CONTRACT -->';
    expect(parseContract(desc)).toBeNull();
    const desc2 = '<!-- MACF-CONTRACT\n[1,2,3]\nMACF-CONTRACT -->';
    expect(parseContract(desc2)).toBeNull();
  });

  test('defaults are filled: maxAttempts 3, empty arrays', () => {
    const desc = renderContractBlock({ taskId: 9 });
    const parsed = parseContract(desc);
    expect(parsed.maxAttempts).toBe(3);
    expect(parsed.requiredTools).toEqual([]);
    expect(parsed.postconditions).toEqual([]);
    expect(parsed.version).toBe(1);
  });
});

describe('stampContract round-trip', () => {
  test('stamping then parsing returns the same contract', () => {
    const stamped = stampContract('Do the thing.', CONTRACT);
    expect(stamped).toContain('Do the thing.');
    expect(parseContract(stamped)).toEqual(normalizeContract(CONTRACT));
  });

  test('re-stamping replaces the block instead of duplicating it', () => {
    const once = stampContract('Do the thing.', CONTRACT);
    const updated = { ...CONTRACT, maxAttempts: 5 };
    const twice = stampContract(once, updated);
    expect((twice.match(/MACF-CONTRACT/g) || []).length).toBe(2); // open + close markers only
    expect(parseContract(twice).maxAttempts).toBe(5);
  });
});

describe('templates', () => {
  test('urlSweep: executor + one urlCheck success required per URL', () => {
    const c = templates.urlSweep({ taskId: 702, urls: ['https://a.example', 'https://b.example', 'https://c.example'] });
    expect(c.executor).toBe('url-sweep');
    expect(c.taskId).toBe(702);
    expect(c.requiredTools).toEqual([{ tool: 'urlCheck', minSuccess: 3 }]);
    expect(c.postconditions).toContainEqual({ type: 'receipt_count', tool: 'urlCheck', status: 'ok', min: 3 });
    expect(c.deliverable.schema).toBe('url-sweep@v1');
    // Round-trips through a description.
    expect(parseContract(stampContract('Sweep these URLs.', c))).toEqual(normalizeContract(c));
  });

  test('fileReport: fileWrite required + file_exists postcondition', () => {
    const c = templates.fileReport({ taskId: 702, path: 'reports/status.md', minBytes: 100 });
    expect(c.requiredTools).toEqual([{ tool: 'fileWrite', minSuccess: 1 }]);
    expect(c.postconditions).toContainEqual({ type: 'file_exists', path: 'reports/status.md', minBytes: 100 });
    expect(c.deliverable.schema).toBe('file-report@v1');
  });

  test('researchWithArtifact: artifact + research-report schema', () => {
    const c = templates.researchWithArtifact({ taskId: 702, path: 'reports/scan.md', minBytes: 200 });
    expect(c.deliverable.schema).toBe('research-report@v1');
    expect(c.postconditions).toContainEqual({ type: 'file_exists', path: 'reports/scan.md', minBytes: 200 });
    expect(c.requiredTools).toEqual([{ tool: 'fileWrite', minSuccess: 1 }]);
  });

  test('ticketFiling: vikunja_task_exists postcondition', () => {
    const c = templates.ticketFiling({ taskId: 702 });
    expect(c.postconditions).toContainEqual({ type: 'vikunja_task_exists', taskId: 702 });
    expect(c.deliverable.schema).toBe('ticket-filing@v1');
  });

  test('slackPost: artifact_posted slack_message postcondition', () => {
    const c = templates.slackPost({ taskId: 702 });
    expect(c.postconditions).toContainEqual({ type: 'artifact_posted', kind: 'slack_message' });
    expect(c.deliverable.schema).toBe('slack-post@v1');
  });
});
