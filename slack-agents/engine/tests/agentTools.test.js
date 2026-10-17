// Test isolation (Oct 12, 2026 — #724): since Phase 1, executeTool writes
// receipts to the state-dir ledger. Without isolation this suite (which
// predates receipts) appended test receipts to the PRODUCTION ledger and,
// running as root, left it root-owned — the macf engine's own receipt
// appends then failed EACCES silently and verification observed zero
// receipts for real work (acceptance task #725, attempt 1). Isolate.
const fs0 = require('fs');
const os0 = require('os');
const path0 = require('path');
const TMP_STATE = fs0.mkdtempSync(path0.join(os0.tmpdir(), 'agenttools-test-'));
process.env.MACF_STATE_DIR = TMP_STATE;
process.env.MACF_RECEIPTS_FILE = path0.join(TMP_STATE, '.receipts.jsonl');

const { executeTool, getToolDescriptions, SANDBOX } = require('../../utils/agentTools');
const fs = require('fs');
const path = require('path');

describe('agentTools — execution layer', () => {
  test('urlCheck validates a reachable URL', () => {
    const result = executeTool('urlCheck', { url: 'https://www.google.com' });
    expect(result.ok).toBe(true);
    expect(result.httpCode).toBeGreaterThanOrEqual(200);
    expect(result.httpCode).toBeLessThan(400);
  });

  test('urlCheck rejects invalid URLs', () => {
    const result = executeTool('urlCheck', { url: 'not-a-url' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  test('urlCheck handles unreachable URLs gracefully', () => {
    const result = executeTool('urlCheck', { url: 'https://this-domain-definitely-does-not-exist-12345.com' });
    expect(result.ok).toBe(false);
  });

  test('fileWrite and fileRead roundtrip', () => {
    const testPath = `test-${Date.now()}.txt`;
    const content = 'Hello from agent tools test';

    const write = executeTool('fileWrite', { path: testPath, content });
    expect(write.ok).toBe(true);
    expect(write.sandboxPath).toBe(testPath);

    const read = executeTool('fileRead', { path: testPath });
    expect(read.ok).toBe(true);
    expect(read.content).toBe(content);

    // Cleanup
    fs.unlinkSync(path.join(SANDBOX, testPath));
  });

  test('fileWrite blocks path traversal', () => {
    const result = executeTool('fileWrite', { path: '../../../etc/evil.txt', content: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('traversal');
  });

  test('fileList returns entries', () => {
    const result = executeTool('fileList', {});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.entries)).toBe(true);
  });

  test('unknown tool returns error', () => {
    const result = executeTool('nonExistentTool', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  test('getToolDescriptions returns usable prompt text', () => {
    const desc = getToolDescriptions();
    expect(desc).toContain('urlCheck');
    expect(desc).toContain('fileWrite');
    expect(desc).toContain('fileRead');
    expect(desc).toContain('fileList');
  });
});
