/**
 * Deliverable Schemas (Oct 12, 2026 — Vikunja #724, Pillar 3)
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 3.
 *
 * Typed outputs for contracted tasks. A small hand-rolled validator over a
 * JSON-Schema subset (type, required, properties, items, enum) — no new
 * dependency. Validation produces field-level errors:
 *   { path: 'findings[0].url', expected: 'string', received: 'undefined' }
 * Nothing about a deliverable is ever inferred from prose: a value either
 * conforms to its schema or the attempt fails as invalid_deliverable.
 */

const SCHEMAS = {
  'research-report@v1': {
    type: 'object',
    required: ['status', 'summary', 'artifactRefs', 'findings'],
    properties: {
      status: { type: 'string', enum: ['produced', 'blocked'] },
      summary: { type: 'string' },
      artifactRefs: { type: 'array', items: { type: 'string' } },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          required: ['url', 'observation'],
          properties: { url: { type: 'string' }, observation: { type: 'string' } },
        },
      },
    },
  },
  'url-sweep@v1': {
    type: 'object',
    required: ['status', 'summary', 'results'],
    properties: {
      status: { type: 'string', enum: ['produced', 'blocked'] },
      summary: { type: 'string' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          required: ['url', 'httpCode'],
          properties: {
            url: { type: 'string' },
            httpCode: { type: 'number' },
            changed: { type: 'boolean' },
          },
        },
      },
    },
  },
  'file-report@v1': {
    type: 'object',
    required: ['status', 'summary', 'artifactRefs'],
    properties: {
      status: { type: 'string', enum: ['produced', 'blocked'] },
      summary: { type: 'string' },
      artifactRefs: { type: 'array', items: { type: 'string' } },
    },
  },
  'ticket-filing@v1': {
    type: 'object',
    required: ['status', 'summary', 'taskRef'],
    properties: {
      status: { type: 'string', enum: ['produced', 'blocked'] },
      summary: { type: 'string' },
      taskRef: { type: 'string' },
    },
  },
  'slack-post@v1': {
    type: 'object',
    required: ['status', 'summary', 'channel'],
    properties: {
      status: { type: 'string', enum: ['produced', 'blocked'] },
      summary: { type: 'string' },
      channel: { type: 'string' },
      messageTs: { type: 'string' },
    },
  },
  'generic@v1': {
    type: 'object',
    required: ['status', 'summary'],
    properties: {
      status: { type: 'string', enum: ['produced', 'blocked'] },
      summary: { type: 'string' },
      artifactRefs: { type: 'array', items: { type: 'string' } },
    },
  },
};

function getSchema(name) {
  return SCHEMAS[name];
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function checkValue(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      errors.push({ path, expected: `one of ${JSON.stringify(schema.enum)}`, received: JSON.stringify(value) });
    }
    return;
  }
  const t = schema.type;
  if (t) {
    const ok =
      (t === 'string' && typeof value === 'string') ||
      (t === 'number' && typeof value === 'number') ||
      (t === 'boolean' && typeof value === 'boolean') ||
      (t === 'array' && Array.isArray(value)) ||
      (t === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value));
    if (!ok) {
      errors.push({ path, expected: t, received: typeOf(value) });
      return;
    }
  }
  if (t === 'array' && schema.items) {
    value.forEach((item, i) => checkValue(schema.items, item, `${path}[${i}]`, errors));
  }
  if (t === 'object') {
    for (const req of schema.required || []) {
      if (value[req] === undefined) {
        errors.push({ path: path === '$' ? req : `${path}.${req}`, expected: 'present (required)', received: 'undefined' });
      }
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) {
        checkValue(sub, value[key], path === '$' ? key : `${path}.${key}`, errors);
      }
    }
  }
}

/**
 * validate(schemaOrName, value) → { valid, errors: [{path, expected, received}] }
 * Accepts a registered schema name or a schema object. Unknown names fail
 * closed. Root errors use path '$'; nested fields use dotted/indexed paths.
 */
function validate(schemaOrName, value) {
  const schema = typeof schemaOrName === 'string' ? SCHEMAS[schemaOrName] : schemaOrName;
  if (!schema) {
    return { valid: false, errors: [{ path: '$', expected: 'a registered deliverable schema', received: String(schemaOrName) }] };
  }
  const errors = [];
  checkValue(schema, value, '$', errors);
  return { valid: errors.length === 0, errors };
}

module.exports = { SCHEMAS, getSchema, validate };
