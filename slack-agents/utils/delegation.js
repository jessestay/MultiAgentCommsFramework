// utils/delegation.js — In-process delegation relay with loop prevention
// Agents call relay() after generating a response. If the response contains
// [from: X → Y] patterns, this module calls Y's handleDelegation directly —
// no Slack round-trip, no bot-message filtering issues.
// Every dispatch is also tracked as a Vikunja task owned by the receiving
// agent (utils/tasks.js) — silent no-op when Vikunja isn't configured.
//
// Loop prevention: tracks which agents have already been invoked in this chain.
// Each agent can appear at most once per chain (naturally caps at 11 hops for 11 agents).
// No arbitrary depth limit — it runs as long as the chain has new agents to visit.

const tasks = require('./tasks');

let _agentModules = {};
let _delegationTargets = {};

function init(agentModules, delegationTargets) {
  _agentModules = agentModules;
  _delegationTargets = delegationTargets;
}

/**
 * Scan a response for [from: X → Y] delegation patterns and execute them.
 * @param {string} responseText  - The full text of the agent's response
 * @param {string} fromAgentId   - The agent ID that produced this response
 * @param {Set}    visitedAgents - Agents already in this delegation chain (loop guard)
 * @param {string} channelId     - Originating Slack channel ID (propagated for routing)
 * @returns {Array} Array of {agentId, result} for each sub-delegation executed.
 *   Callers should include these in their return value so the poller (sole poster)
 *   can validate and post all responses. Sub-agents must NOT post directly.
 */
async function relay(responseText, fromAgentId, visitedAgents = new Set(), channelId = null) {
  if (!responseText) return [];

  // Build the new visited set for this level
  const newVisited = new Set([...visitedAgents, fromAgentId]);

  // Match all [from: X → Y] patterns in the response
  // Captures: group 1 = target name, group 2 = message body up to next [ or end
  const delegRegex = /\[from:\s*[^\]→]+→\s*([^\]]+)\]\s*([\s\S]*?)(?=\[from:|$)/gi;
  const dispatched = new Set(); // prevent duplicate A→B pairs in same response
  const subResults = []; // Collect sub-agent results for the poller to post
  let match;

  while ((match = delegRegex.exec(responseText)) !== null) {
    const toRaw = match[1].trim();
    const toKey = toRaw.toLowerCase().replace(/[\s\-]+/g, '');
    const toAgentId = _delegationTargets[toKey];

    if (!toAgentId) {
      console.log(`[delegation] Unknown target "${toRaw}" — skipping`);
      continue;
    }
    if (!_agentModules[toAgentId]?.handleDelegation) {
      console.log(`[delegation] ${toAgentId} has no handleDelegation — skipping`);
      continue;
    }

    // Loop guard: if this agent was already invoked in this chain, skip.
    // Exception: execPM is the hub and can always receive a completed-work
    // notification from any agent, even if it was earlier in the chain.
    // This allows: execPM → Job Coach → CCO → [from: CCO → Exec PM] (return)
    // without deadlocking. Exec PM is the final sink — its response posts to
    // #management (Jesse's channel) and naturally terminates.
    if (newVisited.has(toAgentId) && toAgentId !== 'execPM') {
      console.log(`[delegation] Loop prevented: ${toAgentId} already in chain [${[...newVisited].join(' → ')}]`);
      continue;
    }

    // Duplicate pair guard: don't invoke A→B twice from one response
    const pairKey = `${fromAgentId}→${toAgentId}`;
    if (dispatched.has(pairKey)) {
      console.log(`[delegation] Duplicate pair ${pairKey} in same response — skipping`);
      continue;
    }
    dispatched.add(pairKey);

    const msgBody = match[2].trim();
    const fullMsg = `[from: ${fromAgentId} → ${toRaw}] ${msgBody}`;

    console.log(`[delegation] Chain [${[...newVisited].join(' → ')}] → ${toAgentId}`);

    try {
      const result = await _agentModules[toAgentId]
        .handleDelegation(fullMsg, new Set(newVisited), channelId);
      // Capture the sub-agent's result so the poller (sole poster) can validate and post it.
      // Sub-agents must NOT post directly — the poller is the only poster.
      subResults.push({ agentId: toAgentId, result });
    } catch (err) {
      console.error(`[delegation] Error invoking ${toAgentId}:`, err);
      subResults.push({ agentId: toAgentId, result: null, error: err.message });
    }

    // Track the delegation as a Vikunja task owned by the receiving agent.
    // Silent no-op when Vikunja isn't configured; never breaks the chain.
    tasks.trackDelegation(fromAgentId, toAgentId, msgBody).catch(err =>
      console.error('[delegation] Task tracking failed:', err.message));
  }

  return subResults;
}

/**
 * Strip [from: X → Y] delegation lines from text before showing to end users.
 * Always call relay() BEFORE stripDelegations() — relay needs the full text.
 * @param {string} text
 * @returns {string}
 */
function stripDelegations(text) {
  if (!text) return '';
  let clean = text
    .split('\n')
    .filter(line => !/^\s*\[from:\s*[^→\]]+→[^\]]+\]/i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // FIX (Oct 2, 2026): Also strip tool-call artifacts here so all existing
  // callers get the sanitization automatically.
  clean = clean.replace(/<\|tool_call_start\|>.*?<\|tool_call_end\|>/gs, '');
  clean = clean.replace(/<\|.*?\|>/g, '');
  return clean.trim();
}

/**
 * Sanitize LLM output before posting to Slack. Removes tool-call artifacts,
 * system markers, and other non-user-facing content.
 * FIX (Oct 2, 2026): Prevents raw <|tool_call_start|> etc. from leaking into channels.
 * @param {string} text
 * @returns {string}
 */
function sanitizeForSlack(text) {
  if (!text) return '';
  let clean = stripDelegations(text);
  // Remove tool-call artifacts
  clean = clean.replace(/<\|tool_call_start\|>.*?<\|tool_call_end\|>/gs, '');
  clean = clean.replace(/<\|.*?\|>/g, '');
  // Remove common LLM artifacts
  clean = clean.replace(/^\s*(Assistant|AI|Bot):\s*/im, '');
  return clean.trim();
}

/**
 * Detect garbled/incoherent LLM output (Oct 9, 2026).
 * Returns true if the text appears to be a fragment, hallucination, or corrupted.
 * Signs of garbled output:
 * - Starts with lowercase conjunctions/fragments ("or similar.", "but the user...")
 * - Contains meta-commentary about responding ("Let me analyze this carefully. The user is asking me to respond as...")
 * - Very short with no substantive content
 * - Contains "as an AI" or similar self-references in wrong context
 */
function isGarbledOutput(text) {
  if (!text || text.trim().length < 20) return true;

  const t = text.trim();

  // Fragment starts: begins with lowercase "or", "but", "and", "so" followed by fragment
  if (/^(or|but|and|so|because)\s+[a-z]/i.test(t) && t.length < 100) return true;

  // Meta-commentary: LLM talking about itself responding
  if (/let me analyze this carefully\. the user is asking me to respond as/i.test(t)) return true;
  if (/i (should|will) (probably|maybe) just answer/i.test(t)) return true;

  // Self-reference in delegation context (agents shouldn't talk about being AI)
  if (/as an ai (language )?model/i.test(t)) return true;

  // Truncated sentence ending mid-thought with no punctuation
  if (/[^.!?:;]$/.test(t) && t.split(' ').length < 10) return true;

  // Chain-of-thought leaks: LLM narrating its reasoning process
  if (/here'?s (a |my )?thinking process/i.test(t)) return true;
  if (/^\d+\.\s+\*\*analyze/i.test(t)) return true;
  if (/let me think (step by step|through this)/i.test(t)) return true;
  if (/my (reasoning|thought) process/i.test(t)) return true;

  return false;
}

module.exports = { init, relay, stripDelegations, sanitizeForSlack, isGarbledOutput };
