// ics/schema.js — Investor Comms Service: submission schema validation.
//
// Schema v1: {idempotency_key, engine_id, type, priority, vikunja_task_id,
// subject, body, actions[]}. Extra fields are ignored (forward-compatible).
'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ['immediate', 'approval', 'outcome'];
const HTTP_URL_RE = /^https?:\/\//i;

function validateSubmission(p) {
  const errors = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return { ok: false, errors: ['payload must be an object'] };
  }
  if (typeof p.idempotency_key !== 'string' || !UUID_RE.test(p.idempotency_key)) {
    errors.push('idempotency_key must be a valid UUID');
  }
  if (typeof p.engine_id !== 'string' || p.engine_id.trim() === '') {
    errors.push('engine_id must be a non-empty string');
  }
  if (!TYPES.includes(p.type)) {
    errors.push(`type must be one of: ${TYPES.join(', ')}`);
  }
  if (!Number.isInteger(p.priority) || p.priority < 1 || p.priority > 3) {
    errors.push('priority must be an integer from 1 to 3');
  }
  if (typeof p.subject !== 'string' || p.subject.trim() === '') {
    errors.push('subject must be a non-empty string');
  }
  if (typeof p.body !== 'string' || p.body.trim() === '') {
    errors.push('body must be a non-empty string');
  }
  if (p.vikunja_task_id !== undefined && p.vikunja_task_id !== null
      && typeof p.vikunja_task_id !== 'number') {
    errors.push('vikunja_task_id must be a number or null');
  }
  if (p.actions !== undefined) {
    if (!Array.isArray(p.actions)) {
      errors.push('actions must be an array');
    } else {
      p.actions.forEach((a, i) => {
        const bad = !a || typeof a !== 'object'
          || typeof a.label !== 'string' || a.label.trim() === ''
          || typeof a.url !== 'string' || !HTTP_URL_RE.test(a.url);
        if (bad) errors.push(`actions[${i}] must be {label, url} with a non-empty label and an http(s) url`);
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { validateSubmission };
