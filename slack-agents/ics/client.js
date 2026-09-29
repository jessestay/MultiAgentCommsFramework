// ics/client.js — Investor Comms Service: thin per-engine submit client.
//
// Builds a submission payload with a fresh idempotency key minted via
// crypto.randomUUID() on every call — even if the caller supplies one, the
// minted key wins (a caller-supplied key must be passed through the bus/MCP
// layer instead, where dedupe is intentional).
'use strict';

const crypto = require('crypto');

function createSubmit(fields) {
  const { idempotency_key, ...rest } = fields || {};
  return { ...rest, idempotency_key: crypto.randomUUID() };
}

module.exports = { createSubmit };
