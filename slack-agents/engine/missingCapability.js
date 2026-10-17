'use strict';
// engine/missingCapability.js — structured missing-capability escalation.
//
// Jesse's standing rule: when an agent lacks the tools/tech/code/architecture to
// complete a request, it must emit a structured signal
//   { agent, task, missing[], attempted[], timestamp }
// and the engine routes it PM → CEO instead of letting the task silently stall.
//
// API:
//   emitMissingCapability({agent, task, missing, attempted}, {queuePath}) -> signal
//   routeMissingCapability(signalId, {queuePath}) -> routed signal (route: ['execPM','CEO'])
//   pendingSignals({queuePath}) -> unrouted signals
//
// Default queue: engine/.missing-capabilities.json (sibling of .engine-gaps.json).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROUTE = ['execPM', 'CEO']; // PM first, CEO is the backstop. Never nudge the agent; fix the mechanism.

function defaultQueuePath() {
  return path.join(__dirname, '.missing-capabilities.json');
}

function readQueue(queuePath) {
  const p = queuePath || defaultQueuePath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeQueue(queuePath, arr) {
  const p = queuePath || defaultQueuePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(arr, null, 2));
}

function emitMissingCapability(input = {}, opts = {}) {
  const { agent, task, missing, attempted } = input;
  if (!agent || typeof agent !== 'string' || !agent.trim()) {
    throw new Error('missing-capability: "agent" is required');
  }
  if (!task || typeof task !== 'string' || !task.trim()) {
    throw new Error('missing-capability: "task" is required');
  }
  if (!Array.isArray(missing) || missing.length === 0 || !missing.every((m) => typeof m === 'string' && m.trim())) {
    throw new Error('missing-capability: "missing" must be a non-empty array of capability names');
  }
  const signal = {
    id: `mc-${crypto.randomBytes(6).toString('hex')}`,
    agent: agent.trim(),
    task: task.trim(),
    missing: missing.map((m) => m.trim()),
    attempted: Array.isArray(attempted) ? attempted.filter((a) => typeof a === 'string') : [],
    timestamp: new Date().toISOString(),
    status: 'pending',
    route: [...ROUTE],
    current_holder: null,
    escalation: [],
  };
  const q = readQueue(opts.queuePath);
  q.push(signal);
  writeQueue(opts.queuePath, q);
  return signal;
}

function routeMissingCapability(signalId, opts = {}) {
  const q = readQueue(opts.queuePath);
  const signal = q.find((s) => s.id === signalId);
  if (!signal) {
    // Fail closed: never silently drop a capability signal.
    throw new Error(`missing-capability: unknown signal id "${signalId}" — not routed, not dropped`);
  }
  if (signal.status === 'routed') return signal;
  const now = new Date().toISOString();
  signal.status = 'routed';
  signal.routed_at = now;
  signal.current_holder = ROUTE[0];
  signal.escalation = ROUTE.map((holder, i) => ({
    step: i + 1,
    holder,
    // The PM owns first response (get the tool from another member or install it).
    // The CEO is the backstop (install the tool / add the engine code).
    responsibility: holder === 'execPM'
      ? 'Get the missing capability from another team member, or escalate to CEO with what was tried.'
      : 'Install the tool or add the engine code so the agent can deliver. Fix the mechanism, never nudge the agent.',
    at: now,
  }));
  writeQueue(opts.queuePath, q);
  return signal;
}

function pendingSignals(opts = {}) {
  return readQueue(opts.queuePath).filter((s) => s.status === 'pending');
}

module.exports = { emitMissingCapability, routeMissingCapability, pendingSignals, ROUTE, defaultQueuePath };
