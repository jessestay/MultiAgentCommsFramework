// utils/historyCompaction.js — Phase A, US-A4 (Vikunja #789).
//
// Long conversation histories are compacted before they are checkpointed
// (and before a step retry re-sends them): old tool results shrink to stubs
// so checkpoints stay small and smaller payloads survive the gateway's
// empty-response streaks more often (Oct 15 diagnosis).
//
// Rules (mirroring the semantics the Oct 15 step-retry compaction
// established in generateWithTools):
//   - a 'tool' message that is NOT the most recent tool message and whose
//     content exceeds thresholdChars (default 600) is replaced by a stub:
//     its first stubChars characters (default 200) plus a compaction marker;
//   - the most recent tool result is always preserved in full — it is the
//     step the agent is actively reasoning about;
//   - non-tool messages are never altered;
//   - the input array is never mutated; stubbed messages are new objects
//     that keep every other field (role, tool_call_id, ...) intact, so a
//     compacted history still passes validateHistory.

const STUB_MARKER = '…[compacted: tool result already executed and receipted]';

function compactHistory(messages, { thresholdChars = 600, stubChars = 200 } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  let lastToolIdx = -1;
  list.forEach((m, i) => { if (m && m.role === 'tool') lastToolIdx = i; });
  let stubbedCount = 0;
  const out = list.map((m, i) => {
    if (
      m && m.role === 'tool' && i !== lastToolIdx &&
      typeof m.content === 'string' && m.content.length > thresholdChars
    ) {
      stubbedCount++;
      return { ...m, content: `${m.content.slice(0, stubChars)}${STUB_MARKER}` };
    }
    return m;
  });
  return { messages: out, compacted: stubbedCount > 0, stubbedCount };
}

module.exports = { compactHistory };
