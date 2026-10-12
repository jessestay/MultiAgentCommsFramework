/**
 * Deliverable schema validator tests (Phase 2, Vikunja #724) — US-105.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 3.
 * A small hand-rolled validator over a JSON-Schema subset (type, required,
 * properties, items, enum) — no new dependency. Validation failures carry
 * field-level validationErrors; nothing is inferred from prose.
 */
const { validate, getSchema, SCHEMAS } = require('../deliverableSchemas');

const GOOD_REPORT = {
  status: 'produced',
  summary: 'Checked 6 pricing pages; 2 changed since last scan.',
  artifactRefs: ['reports/pricing-scan.md'],
  findings: [{ url: 'https://example.com/pricing', observation: 'Price dropped to $49.' }],
};

describe('research-report@v1', () => {
  test('a conforming deliverable validates', () => {
    const r = validate('research-report@v1', GOOD_REPORT);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test('missing required field → field-level error', () => {
    const bad = { ...GOOD_REPORT };
    delete bad.summary;
    const r = validate('research-report@v1', bad);
    expect(r.valid).toBe(false);
    expect(r.errors.map(e => e.path)).toContain('summary');
  });

  test('wrong type → error naming expected and received', () => {
    const r = validate('research-report@v1', { ...GOOD_REPORT, artifactRefs: 'reports/x.md' });
    expect(r.valid).toBe(false);
    const e = r.errors.find(x => x.path === 'artifactRefs');
    expect(e).toBeDefined();
    expect(e.expected).toMatch(/array/);
  });

  test('enum violation: status must be produced|blocked, never "done"', () => {
    const r = validate('research-report@v1', { ...GOOD_REPORT, status: 'done' });
    expect(r.valid).toBe(false);
    expect(r.errors.map(e => e.path)).toContain('status');
  });

  test('array item field errors are located precisely', () => {
    const bad = { ...GOOD_REPORT, findings: [{ observation: 'no url here' }] };
    const r = validate('research-report@v1', bad);
    expect(r.valid).toBe(false);
    expect(r.errors.map(e => e.path)).toContain('findings[0].url');
  });

  test('non-object deliverable fails at the root', () => {
    const r = validate('research-report@v1', 'confident prose, definitely done');
    expect(r.valid).toBe(false);
    expect(r.errors[0].path).toBe('$');
  });
});

describe('registry behavior', () => {
  test('unknown schema name fails closed', () => {
    const r = validate('no-such-schema@v9', GOOD_REPORT);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
  });

  test('getSchema returns undefined for unknown names', () => {
    expect(getSchema('research-report@v1')).toBeDefined();
    expect(getSchema('nope@v1')).toBeUndefined();
  });

  test('validate accepts a schema object directly', () => {
    const schema = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };
    expect(validate(schema, { a: 'x' }).valid).toBe(true);
    expect(validate(schema, {}).valid).toBe(false);
  });

  test('all template schemas are registered', () => {
    for (const name of ['research-report@v1', 'url-sweep@v1', 'file-report@v1', 'ticket-filing@v1', 'slack-post@v1']) {
      expect(SCHEMAS[name]).toBeDefined();
    }
  });

  test('url-sweep@v1 shape: summary + per-URL results', () => {
    const good = {
      status: 'produced', summary: 'Swept 2 URLs.',
      results: [{ url: 'https://a.example', httpCode: 200, changed: false }],
    };
    expect(validate('url-sweep@v1', good).valid).toBe(true);
    expect(validate('url-sweep@v1', { status: 'produced', summary: 'x' }).valid).toBe(false);
  });
});
