// tests/ics-schema.test.js — Investor Comms Service: submission schema validation
//
// Contract: ics/schema.js exports validateSubmission(p) -> {ok, errors[]}
// Schema v1: idempotency_key (uuid, required), engine_id (required, non-empty),
// type (immediate|approval|outcome), priority (int 1-3), subject (non-empty),
// body (non-empty), vikunja_task_id (number|null, optional), actions[] (array of
// {label, url}). Rejects: missing/empty body, bad type, priority out of range,
// malformed key.
'use strict';

const { validateSubmission } = require('../ics/schema');

const VALID_KEY = '123e4567-e89b-42d3-a456-426614174000';

function validSubmission(overrides = {}) {
  return {
    idempotency_key: VALID_KEY,
    engine_id: 'jarvis-jr',
    type: 'immediate',
    priority: 1,
    subject: 'Approval needed',
    body: 'Please approve the spend: https://example.com/invoice/1',
    vikunja_task_id: null,
    actions: [],
    ...overrides,
  };
}

describe('validateSubmission — happy path', () => {
  test('accepts a fully valid submission', () => {
    const res = validateSubmission(validSubmission());
    expect(res).toEqual({ ok: true, errors: [] });
  });

  test('accepts a valid submission with vikunja_task_id and actions', () => {
    const res = validateSubmission(validSubmission({
      vikunja_task_id: 42,
      actions: [{ label: 'Open invoice', url: 'https://example.com/invoice/1' }],
    }));
    expect(res.ok).toBe(true);
  });

  test('treats missing vikunja_task_id / actions as optional', () => {
    const p = validSubmission();
    delete p.vikunja_task_id;
    delete p.actions;
    expect(validateSubmission(p).ok).toBe(true);
  });

  test('ignores unknown extra fields (forward-compatible)', () => {
    const res = validateSubmission(validSubmission({ surfaces: ['slack-dm'], future: 1 }));
    expect(res.ok).toBe(true);
  });

  test('errors is always an array of strings', () => {
    const res = validateSubmission(validSubmission());
    expect(Array.isArray(res.errors)).toBe(true);
    expect(res.errors.every((e) => typeof e === 'string')).toBe(true);
  });
});

describe('validateSubmission — idempotency_key', () => {
  test.each([
    ['not-a-uuid'],
    ['123'],
    [''],
    [null],
    [undefined],
    [12345],
    ['123e4567-e89b-42d3-a456-42661417400'], // one hex char short
  ])('rejects malformed key %p', (key) => {
    const res = validateSubmission(validSubmission({ idempotency_key: key }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(' | ')).toMatch(/idempotency_key/i);
  });

  test('accepts any well-formed UUID (not just v4)', () => {
    expect(validateSubmission(validSubmission({
      idempotency_key: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
    })).ok).toBe(true);
  });
});

describe('validateSubmission — engine_id / type / priority', () => {
  test.each([[undefined], [null], [''], ['   ']])('rejects engine_id %p', (engine_id) => {
    const res = validateSubmission(validSubmission({ engine_id }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(' | ')).toMatch(/engine_id/i);
  });

  test.each([['urgent'], ['IMMEDIATE'], [''], [null], [undefined]])('rejects type %p', (type) => {
    const res = validateSubmission(validSubmission({ type }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(' | ')).toMatch(/type/i);
  });

  test.each([['immediate'], ['approval'], ['outcome']])('accepts type %p', (type) => {
    expect(validateSubmission(validSubmission({ type })).ok).toBe(true);
  });

  test.each([[1], [2], [3]])('accepts priority %p', (priority) => {
    expect(validateSubmission(validSubmission({ priority })).ok).toBe(true);
  });

  test.each([[0], [4], [-1], [1.5], ['2'], [null], [undefined], [NaN]])(
    'rejects priority %p',
    (priority) => {
      const res = validateSubmission(validSubmission({ priority }));
      expect(res.ok).toBe(false);
      expect(res.errors.join(' | ')).toMatch(/priority/i);
    },
  );
});

describe('validateSubmission — subject / body', () => {
  test.each([[undefined], [null], ['']])('rejects missing/empty body %p', (body) => {
    const res = validateSubmission(validSubmission({ body }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(' | ')).toMatch(/body/i);
  });

  test('rejects whitespace-only body', () => {
    const res = validateSubmission(validSubmission({ body: '   \n\t ' }));
    expect(res.ok).toBe(false);
  });

  test.each([[undefined], [null], [''], ['   ']])('rejects missing/empty subject %p', (subject) => {
    const res = validateSubmission(validSubmission({ subject }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(' | ')).toMatch(/subject/i);
  });
});

describe('validateSubmission — vikunja_task_id / actions', () => {
  test.each([['123'], [true], [{}]])('rejects non-number vikunja_task_id %p', (vikunja_task_id) => {
    const res = validateSubmission(validSubmission({ vikunja_task_id }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(' | ')).toMatch(/vikunja_task_id/i);
  });

  test('rejects non-array actions', () => {
    const res = validateSubmission(validSubmission({ actions: 'https://example.com' }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(' | ')).toMatch(/actions/i);
  });

  test.each([
    [{ label: 'Open' }], // missing url
    [{ url: 'https://example.com' }], // missing label
    [{ label: '', url: 'https://example.com' }], // empty label
    [{ label: 'Open', url: 'not-a-url' }], // non-url
    [{ label: 'Open', url: 'ftp://example.com/x' }], // non-http(s)
    ['just-a-string'],
  ])('rejects malformed action %p', (action) => {
    const res = validateSubmission(validSubmission({ actions: [action] }));
    expect(res.ok).toBe(false);
  });
});

describe('validateSubmission — non-object payloads', () => {
  test.each([[null], [undefined], ['a string'], [42], [[]]])('rejects payload %p', (p) => {
    const res = validateSubmission(p);
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
