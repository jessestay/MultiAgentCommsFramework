// utils/delegation.js — In-process delegation relay with loop prevention
// Agents call relay() after generating a response. If the response contains
// [from: X → Y] patterns, this module calls Y's handleDelegation directly —
// no Slack round-trip, no bot-message filtering issues.
//
// Loop prevention: tracks which agents have already been invoked in this chain.
// Each agent can appear at most once per chain (naturally caps at 8 hops for 8 agents).
// No arbitrary depth limit — it runs as long as the chain has new agents to visit.

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
 */
async function relay(responseText, fromAgentId, visitedAgents = new Set(), channelId = null) {
  if (!responseText) return;

  // Build the new visited set for this level
  const newVisited = new Set([...visitedAgents, fromAgentId]);

  // Match all [from: X → Y] patterns in the response
  // Captures: group 1 = target name, group 2 = message body up to next [ or end
  const delegRegex = /\[from:\s*[^\]→]+→\s*([^\]]+)\]\s*([\s\S]*?)(?=\[from:|$)/gi;
  const dispatched = new Set(); // prevent duplicate A→B pairs in same response
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

    await _agentModules[toAgentId]
      .handleDelegation(fullMsg, new Set(newVisited), channelId)
      .catch(err => console.error(`[delegation] Error invoking ${toAgentId}:`, err));
  }
}

/**
 * Strip [from: X → Y] delegation lines from text before showing to end users.
 * Always call relay() BEFORE stripDelegations() — relay needs the full text.
 * @param {string} text
 * @returns {string}
 */
function stripDelegations(text) {
  if (!text) return '';
  return text
    .split('\n')
    .filter(line => !/^\s*\[from:\s*[^→\]]+→[^\]]+\]/i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { init, relay, stripDelegations };
