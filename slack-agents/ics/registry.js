// ics/registry.js — Investor Comms Service: CEO identity + surface plugin registry.
//
// Only the active CEO engine may submit to the bus. Surfaces (delivery
// plugins) register by name; re-registering a name replaces the adapter, so
// the Bacon Slice adapter (or any future surface) is install/uninstall-safe.
'use strict';

function getActiveCeoId(cfg) {
  if (cfg && cfg.ACTING_CEO_ID) return cfg.ACTING_CEO_ID;
  if (cfg && Array.isArray(cfg.CEO_SUCCESSION) && cfg.CEO_SUCCESSION[0]) {
    return cfg.CEO_SUCCESSION[0];
  }
  return undefined;
}

function isAuthorizedEngine(engineId, cfg) {
  const active = getActiveCeoId(cfg);
  return typeof engineId === 'string' && engineId !== '' && engineId === active;
}

// Adapter shape: {name, send(ctx, message) -> Promise<{status, detail?}>}
//   status in delivered|failed|stubbed|queued.
const surfaces = new Map();

function registerSurface(name, adapter) {
  if (typeof name !== 'string' || name === '') {
    throw new Error('registerSurface: name must be a non-empty string');
  }
  if (!adapter || typeof adapter.send !== 'function') {
    throw new Error(`registerSurface: adapter '${name}' must expose send(ctx, message)`);
  }
  surfaces.set(name, adapter);
}

function unregisterSurface(name) {
  surfaces.delete(name);
}

function listSurfaces() {
  return [...surfaces.keys()];
}

function getSurface(name) {
  return surfaces.get(name);
}

module.exports = {
  getActiveCeoId,
  isAuthorizedEngine,
  registerSurface,
  unregisterSurface,
  listSurfaces,
  getSurface,
};
