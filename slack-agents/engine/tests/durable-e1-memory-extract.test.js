// durable-e1-memory-extract.test.js — Phase E, US-E1 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from US-E1's acceptance criteria
// BEFORE the implementation exists. Contract under test:
//
//   * NEW MODULE utils/agentMemory.js exporting:
//       createMemoryAdapter()  -> async KV adapter { get, set, delete, keys, _map }
//                                 (same adapter shape as Phase A checkpoints)
//       createFileAdapter(filePath?) -> same shape, persisted to a JSON
//                                 file under the durable state dir
//                                 (MACF_STATE_DIR or module-relative .state),
//                                 default file agent-memory.json
//       createMemoryStore(adapter, opts?) -> store
//       embedText(text) -> number[] (deterministic local embedding vector)
//       validateMemoryRecord(record) -> { valid, errors[] }
//     Store API (all async):
//       remember({ agentId, subject, fact, source, confidence?, slot?,
//                  supersedes?, at? }) -> stored record
//         record: { id, agentId, subject, fact, source, sources[], embedding,
//                   slot, confidence, status: 'active'|'superseded',
//                   supersedes, supersededBy, createdAt, updatedAt }
//         - `source` is the first provenance ref; `sources` accumulates
//           every provenance ref (US-E1.2).
//         - `at` (ms epoch) overrides the clock for testability.
//       extractAndStore({ agentId, subject?, source, text, extractor, at? })
//         -> { stored[], merged[], superseded[] }
//         - extractor is an INJECTED async fn (the team's LLM path in
//           production; a stub here — no live network in unit tests). It
//           receives { agentId, subject, source, text, existing } where
//           `existing` is the scope's active records, and returns candidate
//           facts: [{ fact, subject?, confidence?, slot?, supersedes? }].
//         - a candidate duplicating an ACTIVE record in the same scope
//           (same normalized fact text) is NOT stored again: the existing
//           record's sources gain the new source ref (US-E1.2).
//         - a candidate naming `supersedes` (a record id), or carrying a
//           `slot` that an active record in the same scope already holds,
//           SUPERSEDES that record: the old record stays readable with
//           status 'superseded' + supersededBy set; the new record's
//           `supersedes` points back. Nothing is silently overwritten.
//       getRecord(id) -> record | null   (superseded records included)
//       listRecords({ agentId?, subject?, includeSuperseded? }) -> records
//     Safety (CEO-pinned mechanics):
//       - the writer whitelists schema fields: extra keys on the input
//         (permissions, route, toolAccess, ...) NEVER reach storage, and
//         validateMemoryRecord rejects a record carrying them.
//       - fact text passes a PII minimization hook before storage
//         (opts.redact; default scrubber redacts emails / phone numbers /
//         SSN-shaped digit runs; opts.redact === null disables it).

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-e1-'));
process.env.MACF_STATE_DIR = TMP;

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

// Guarded loader: in the red phase the module does not exist. Turning that
// into a thrown error inside each test keeps the failure a TEST failure
// (file still collects) and names exactly what is missing.
function impl(rel) {
  try { return require(rel); } catch (e) {
    throw new Error(`RED PHASE (TDD): implementation module not built yet: ${rel} — ${e.code || e.message}`);
  }
}

function newStore(opts) {
  const mod = impl('../../utils/agentMemory');
  return { mod, store: mod.createMemoryStore(mod.createMemoryAdapter(), opts) };
}

// A stub extractor: the production extractor is the team's LLM; here it is
// a deterministic fake returning canned candidates and recording its input.
function stubExtractor(candidates, seen) {
  return async (input) => {
    if (seen) seen.push(JSON.parse(JSON.stringify({
      agentId: input.agentId, subject: input.subject, source: input.source,
      existingFacts: (input.existing || []).map(r => r.fact),
    })));
    return candidates;
  };
}

// ─── TDD unit: module surface, embedding, schema validation ─────────────────

describe('agentMemory — module surface (TDD)', () => {
  test('exports the store factory, both adapters, the embedder, and the validator', () => {
    const mod = impl('../../utils/agentMemory');
    expect(typeof mod.createMemoryStore).toBe('function');
    expect(typeof mod.createMemoryAdapter).toBe('function');
    expect(typeof mod.createFileAdapter).toBe('function');
    expect(typeof mod.embedText).toBe('function');
    expect(typeof mod.validateMemoryRecord).toBe('function');
  });

  test('embedText is deterministic, numeric, and distinguishes different texts', () => {
    const { mod } = newStore();
    const a = mod.embedText('Acme prefers email contact');
    const b = mod.embedText('Acme prefers email contact');
    const c = mod.embedText('Globex billing is quarterly');
    expect(Array.isArray(a)).toBe(true);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every(n => typeof n === 'number' && Number.isFinite(n))).toBe(true);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test('validateMemoryRecord accepts a stored record and rejects malformed or smuggled ones', async () => {
    const { mod, store } = newStore();
    const saved = await store.remember({
      agentId: 'cmo', subject: 'acme', fact: 'Acme prefers email contact.',
      source: 'task:1001', at: 1000,
    });
    expect(mod.validateMemoryRecord(saved).valid).toBe(true);
    const bad = [
      null, undefined, {}, 'a fact',
      { ...saved, agentId: '' },
      { ...saved, subject: 42 },
      { ...saved, fact: '' },
      { ...saved, confidence: 1.5 },
      { ...saved, confidence: -0.1 },
      { ...saved, status: 'deleted' },
      { ...saved, sources: 'task:1001' },
      { ...saved, permissions: ['*'] },
      { ...saved, route: 'cto' },
    ];
    for (const rec of bad) {
      const v = mod.validateMemoryRecord(rec);
      expect(v.valid).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
    }
  });
});

// ─── BDD: US-E1.1 — facts extracted and stored with provenance ──────────────

describe('US-E1.1 — extraction stores facts with embedding, source task ID, timestamp', () => {
  test('a completed task\'s candidate facts are written to the store, fully shaped', async () => {
    const { store } = newStore();
    const extractor = stubExtractor([
      { fact: 'Acme Corp prefers email over phone for all vendor contact.', confidence: 0.9 },
      { fact: 'Acme Corp billing cycle is quarterly, in arrears.' },
    ]);
    const res = await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:1001',
      text: 'Finished the Acme onboarding call. They said email only, and billing is quarterly in arrears.',
      extractor, at: 5000,
    });
    expect(res.stored).toHaveLength(2);
    expect(res.merged).toHaveLength(0);
    for (const rec of res.stored) {
      expect(typeof rec.id).toBe('string');
      expect(rec.id.length).toBeGreaterThan(0);
      expect(rec.agentId).toBe('cmo');
      expect(rec.subject).toBe('acme');
      expect(rec.source).toBe('task:1001');
      expect(rec.sources).toEqual(['task:1001']);
      expect(Array.isArray(rec.embedding)).toBe(true);
      expect(rec.embedding.length).toBeGreaterThan(0);
      expect(rec.createdAt).toBe(5000);
      expect(rec.updatedAt).toBe(5000);
      expect(rec.status).toBe('active');
      expect(rec.supersedes).toBeNull();
      expect(rec.supersededBy).toBeNull();
      expect(typeof rec.confidence).toBe('number');
      expect(rec.confidence).toBeGreaterThanOrEqual(0);
      expect(rec.confidence).toBeLessThanOrEqual(1);
    }
    expect(res.stored[0].confidence).toBe(0.9);
    // Round-trip: what was returned is what the store holds.
    const loaded = await store.getRecord(res.stored[0].id);
    expect(loaded.fact).toContain('prefers email');
    expect(loaded.embedding).toEqual(res.stored[0].embedding);
  });

  test('the extractor sees the scope\'s existing active facts (mem0-style decision loop)', async () => {
    const { store } = newStore();
    await store.remember({ agentId: 'cmo', subject: 'acme', fact: 'Existing fact one.', source: 'task:1', at: 100 });
    await store.remember({ agentId: 'cto', subject: 'acme', fact: 'Other agent fact.', source: 'task:2', at: 100 });
    await store.remember({ agentId: 'cmo', subject: 'globex', fact: 'Other subject fact.', source: 'task:3', at: 100 });
    const seen = [];
    await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:9', text: 'more work',
      extractor: stubExtractor([], seen), at: 200,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].existingFacts).toEqual(['Existing fact one.']);
  });

  test('an extractor failure surfaces as a rejection — never a silent empty write', async () => {
    const { store } = newStore();
    await expect(store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:5', text: 'x',
      extractor: async () => { throw new Error('llm path down'); },
    })).rejects.toThrow(/llm path down/);
    expect(await store.listRecords({ agentId: 'cmo', subject: 'acme' })).toHaveLength(0);
  });

  test('an extraction with zero candidates stores nothing and is not an error', async () => {
    const { store } = newStore();
    const res = await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:6', text: 'nothing durable here',
      extractor: stubExtractor([]),
    });
    expect(res).toEqual({ stored: [], merged: [], superseded: [] });
  });

  test('records survive a store restart on the file adapter (durable, in-repo state)', async () => {
    const mod = impl('../../utils/agentMemory');
    const file = path.join(TMP, 'restart-memory.json');
    const s1 = mod.createMemoryStore(mod.createFileAdapter(file));
    const rec = await s1.remember({
      agentId: 'lawyer', subject: 'midland', fact: 'The hearing is in Department S45.',
      source: 'task:77', at: 1234,
    });
    // A brand-new store over a brand-new adapter on the same file: the
    // process "restarted" and the fact is still there.
    const s2 = mod.createMemoryStore(mod.createFileAdapter(file));
    const loaded = await s2.getRecord(rec.id);
    expect(loaded).not.toBeNull();
    expect(loaded.fact).toContain('Department S45');
    expect(loaded.createdAt).toBe(1234);
  });

  test('the default file adapter path lands inside MACF_STATE_DIR', async () => {
    const mod = impl('../../utils/agentMemory');
    const store = mod.createMemoryStore(mod.createFileAdapter());
    await store.remember({ agentId: 'cfo', subject: 'runway', fact: 'Runway note for path test.', source: 'task:8', at: 10 });
    expect(fs.existsSync(path.join(TMP, 'agent-memory.json'))).toBe(true);
  });

  test('mutating a returned record does not corrupt the store (serialized snapshots)', async () => {
    const { store } = newStore();
    const rec = await store.remember({ agentId: 'cmo', subject: 'acme', fact: 'Original fact.', source: 'task:1', at: 1 });
    rec.fact = 'MUTATED';
    rec.sources.push('task:forged');
    const loaded = await store.getRecord(rec.id);
    expect(loaded.fact).toBe('Original fact.');
    expect(loaded.sources).toEqual(['task:1']);
  });
});

// ─── BDD: US-E1.2 — duplicates merge provenance, never copy ─────────────────

describe('US-E1.2 — a duplicate fact is not stored twice; its source list grows', () => {
  test('the same fact extracted from a second task merges into the existing record', async () => {
    const { store } = newStore();
    const fact = 'Acme Corp prefers email over phone for all vendor contact.';
    const r1 = await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:1001', text: 'call notes',
      extractor: stubExtractor([{ fact }]), at: 1000,
    });
    const r2 = await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:1002', text: 'same conclusion again',
      extractor: stubExtractor([{ fact }]), at: 2000,
    });
    expect(r1.stored).toHaveLength(1);
    expect(r2.stored).toHaveLength(0);
    expect(r2.merged).toHaveLength(1);
    const all = await store.listRecords({ agentId: 'cmo', subject: 'acme', includeSuperseded: true });
    expect(all).toHaveLength(1);
    expect(all[0].sources).toEqual(['task:1001', 'task:1002']);
    expect(all[0].source).toBe('task:1001');
    expect(all[0].updatedAt).toBe(2000);
    expect(all[0].createdAt).toBe(1000);
  });

  test('duplication is judged on normalized text (case / punctuation / spacing)', async () => {
    const { store } = newStore();
    await store.remember({ agentId: 'cmo', subject: 'acme', fact: 'Acme prefers EMAIL contact.', source: 'task:1', at: 1 });
    const res = await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:2', text: 'again',
      extractor: stubExtractor([{ fact: '  acme   prefers email contact' }]), at: 2,
    });
    expect(res.stored).toHaveLength(0);
    expect(res.merged).toHaveLength(1);
  });

  test('a genuinely different fact in the same scope is stored separately (no false dedup)', async () => {
    const { store } = newStore();
    await store.remember({ agentId: 'cmo', subject: 'acme', fact: 'Acme prefers email contact.', source: 'task:1', at: 1 });
    const res = await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:2', text: 'billing call',
      extractor: stubExtractor([{ fact: 'Acme billing cycle is quarterly, in arrears.' }]), at: 2,
    });
    expect(res.stored).toHaveLength(1);
    expect(await store.listRecords({ agentId: 'cmo', subject: 'acme' })).toHaveLength(2);
  });

  test('the same fact text in a DIFFERENT scope is not a duplicate (scopes dedup independently)', async () => {
    const { store } = newStore();
    await store.remember({ agentId: 'cmo', subject: 'acme', fact: 'Kickoff is on Fridays.', source: 'task:1', at: 1 });
    const res = await store.extractAndStore({
      agentId: 'cmo', subject: 'globex', source: 'task:2', text: 'globex call',
      extractor: stubExtractor([{ fact: 'Kickoff is on Fridays.' }]), at: 2,
    });
    expect(res.stored).toHaveLength(1);
    expect(res.stored[0].subject).toBe('globex');
  });
});

// ─── BDD: US-E1.3 — writes are scoped to agent + subject ────────────────────

describe('US-E1.3 — a stored memory is scoped to its agent and its subject', () => {
  test('stored records carry their scope and listRecords filters by it exactly', async () => {
    const { store } = newStore();
    await store.remember({ agentId: 'cmo', subject: 'acme', fact: 'CMO acme fact.', source: 'task:1', at: 1 });
    await store.remember({ agentId: 'cto', subject: 'acme', fact: 'CTO acme fact.', source: 'task:2', at: 1 });
    await store.remember({ agentId: 'cmo', subject: 'globex', fact: 'CMO globex fact.', source: 'task:3', at: 1 });
    const cmoAcme = await store.listRecords({ agentId: 'cmo', subject: 'acme' });
    expect(cmoAcme).toHaveLength(1);
    expect(cmoAcme[0].fact).toBe('CMO acme fact.');
    const cmoAll = await store.listRecords({ agentId: 'cmo' });
    expect(cmoAll.map(r => r.fact).sort()).toEqual(['CMO acme fact.', 'CMO globex fact.']);
  });
});

// ─── Supersession (write path; US-E2.3 depends on it) ───────────────────────

describe('supersession — a contradicting fact supersedes, never overwrites', () => {
  test('a candidate carrying the slot of an active record supersedes it, lineage both ways', async () => {
    const { store } = newStore();
    const old = await store.remember({
      agentId: 'cmo', subject: 'acme', fact: 'Acme primary contact is Dana.',
      source: 'task:1', slot: 'primary-contact', at: 100,
    });
    const res = await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:2', text: 'Dana left; Priya is the contact now.',
      extractor: stubExtractor([{ fact: 'Acme primary contact is Priya.', slot: 'primary-contact' }]), at: 200,
    });
    expect(res.stored).toHaveLength(1);
    expect(res.superseded).toHaveLength(1);
    const fresh = res.stored[0];
    expect(fresh.supersedes).toBe(old.id);
    expect(fresh.slot).toBe('primary-contact');
    // The old record is still readable, marked, with its lineage intact.
    const oldNow = await store.getRecord(old.id);
    expect(oldNow).not.toBeNull();
    expect(oldNow.status).toBe('superseded');
    expect(oldNow.supersededBy).toBe(fresh.id);
    expect(oldNow.fact).toBe('Acme primary contact is Dana.');
    // Default listings show only the active truth.
    const active = await store.listRecords({ agentId: 'cmo', subject: 'acme' });
    expect(active.map(r => r.id)).toEqual([fresh.id]);
    const everything = await store.listRecords({ agentId: 'cmo', subject: 'acme', includeSuperseded: true });
    expect(everything).toHaveLength(2);
  });

  test('a candidate may name the record it supersedes explicitly', async () => {
    const { store } = newStore();
    const old = await store.remember({
      agentId: 'cfo', subject: 'pricing', fact: 'The audit package costs $750.',
      source: 'task:1', at: 100,
    });
    const res = await store.extractAndStore({
      agentId: 'cfo', subject: 'pricing', source: 'task:2', text: 'price changed',
      extractor: stubExtractor([{ fact: 'The audit package costs $950.', supersedes: old.id }]), at: 200,
    });
    expect(res.stored[0].supersedes).toBe(old.id);
    expect((await store.getRecord(old.id)).status).toBe('superseded');
  });

  test('an identical fact is a merge, not a supersession, even when it carries the slot', async () => {
    const { store } = newStore();
    await store.remember({
      agentId: 'cmo', subject: 'acme', fact: 'Acme primary contact is Dana.',
      source: 'task:1', slot: 'primary-contact', at: 100,
    });
    const res = await store.extractAndStore({
      agentId: 'cmo', subject: 'acme', source: 'task:2', text: 'confirmed again',
      extractor: stubExtractor([{ fact: 'Acme primary contact is Dana.', slot: 'primary-contact' }]), at: 200,
    });
    expect(res.stored).toHaveLength(0);
    expect(res.merged).toHaveLength(1);
    expect(res.superseded).toHaveLength(0);
  });
});

// ─── Safety mechanics on the write path ─────────────────────────────────────

describe('safety — schema whitelist and the PII minimization hook', () => {
  test('non-schema fields on a write never reach storage (no permission/route smuggling)', async () => {
    const { mod, store } = newStore();
    const rec = await store.remember({
      agentId: 'cmo', subject: 'acme', fact: 'A plain fact.', source: 'task:1', at: 1,
      permissions: ['*'], route: 'cto', toolAccess: '*', priority: 99,
    });
    const allowed = ['id', 'agentId', 'subject', 'fact', 'source', 'sources', 'embedding',
      'slot', 'confidence', 'status', 'supersedes', 'supersededBy', 'createdAt', 'updatedAt'];
    expect(Object.keys(rec).sort()).toEqual(allowed.sort());
    const loaded = await store.getRecord(rec.id);
    expect(Object.keys(loaded).sort()).toEqual(allowed.sort());
    expect(mod.validateMemoryRecord(loaded).valid).toBe(true);
  });

  test('the default PII hook redacts emails and phone numbers before storage', async () => {
    const { store } = newStore();
    const rec = await store.remember({
      agentId: 'cmo', subject: 'acme',
      fact: 'Send the signed copy to jane.doe@example.com or call 801-555-0142.',
      source: 'task:1', at: 1,
    });
    expect(rec.fact).not.toContain('jane.doe@example.com');
    expect(rec.fact).not.toContain('801-555-0142');
    expect(rec.fact).toContain('[redacted]');
    const loaded = await store.getRecord(rec.id);
    expect(loaded.fact).toBe(rec.fact);
  });

  test('a custom redact hook replaces the default; redact: null disables minimization', async () => {
    const { mod } = newStore();
    const custom = mod.createMemoryStore(mod.createMemoryAdapter(), {
      redact: (s) => s.replace(/Acme/g, '[client]'),
    });
    const r1 = await custom.remember({ agentId: 'cmo', subject: 'x', fact: 'Acme renewed.', source: 'task:1', at: 1 });
    expect(r1.fact).toBe('[client] renewed.');
    const off = mod.createMemoryStore(mod.createMemoryAdapter(), { redact: null });
    const r2 = await off.remember({
      agentId: 'cmo', subject: 'x', fact: 'Reach jane.doe@example.com.', source: 'task:1', at: 1,
    });
    expect(r2.fact).toContain('jane.doe@example.com');
  });
});
