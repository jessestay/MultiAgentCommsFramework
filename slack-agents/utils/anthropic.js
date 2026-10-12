// utils/anthropic.js — Anthropic SDK wrapper with tiered model selection
//
// Model tiers (overridable via env vars):
//   QUICK_MODEL  — haiku  — fast replies, proactive posts, simple Q&A
//   SMART_MODEL  — sonnet — complex reasoning, delegations, legal/financial
//   BEST_MODEL   — opus   — reserved for future use; not used by default
//
// Cost comparison (per 1M tokens, input/output):
//   haiku-4-5:   $0.25 / $1.25   (~60x cheaper than opus)
//   sonnet-4-6:  $3.00 / $15.00  (~5x cheaper than opus)
//   opus-4-6:    $15.00 / $75.00 (only when explicitly requested)
//
// Default strategy: haiku for everything; sonnet for complex tasks where
// quality matters. Pass model:'smart' or model:'best' to override.

const Anthropic = require('@anthropic-ai/sdk');
// LiteLLM gateway fallback: when this host holds no direct provider key,
// route through the desktop gateway (budget-first routing is CEO policy).
const litellm = require('./litellm');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model tiers — now from config/models.yaml via modelRouter.
// Edit config/models.yaml to switch models. Env vars still override for
// quick testing: ANTHROPIC_QUICK_MODEL, ANTHROPIC_SMART_MODEL, ANTHROPIC_BEST_MODEL.
const { getModelForTier } = require('./modelRouter');

const QUICK_MODEL  = process.env.ANTHROPIC_QUICK_MODEL  || getModelForTier('quick');
const SMART_MODEL  = process.env.ANTHROPIC_SMART_MODEL  || getModelForTier('smart');
const BEST_MODEL   = process.env.ANTHROPIC_BEST_MODEL   || getModelForTier('best');

// Default to haiku — fast and cheap. 95% of agent responses don't need more.
const DEFAULT_MODEL = QUICK_MODEL;

// Resolve shorthand tier names to actual model IDs
function resolveModel(model) {
  if (!model || model === 'quick')  return QUICK_MODEL;
  if (model === 'smart')            return SMART_MODEL;
  if (model === 'best')             return BEST_MODEL;
  return model; // pass-through if already a full model ID
}

/**
 * Core chat function.
 * @param {object} options
 * @param {string} options.systemPrompt
 * @param {string} options.userMessage
 * @param {string} [options.model]      — 'quick' | 'smart' | 'best' | full model ID
 * @param {number} [options.maxTokens]
 * @returns {Promise<string>}
 */
async function chat({ systemPrompt, userMessage, model = DEFAULT_MODEL, maxTokens = 1024 }) {
  // No direct provider key on this host → fall through to the LiteLLM
  // gateway (desktop, budget-first tiers). This is what takes the VM engine
  // out of watch mode.
  if (!process.env.ANTHROPIC_API_KEY && litellm.isConfigured()) {
    return litellm.chat({ systemPrompt, userMessage, model, maxTokens });
  }
  const resolvedModel = resolveModel(model);
  try {
    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    });
    return response.content[0].text;
  } catch (err) {
    console.error(`[anthropic] API error (${resolvedModel}):`, err.message);
    throw err;
  }
}

/**
 * Short proactive post — haiku is perfect here.
 * Used for cron-triggered channel updates, alerts, summaries.
 */
async function generateProactivePost({ systemPrompt, context, maxTokens = 400 }) {
  const { DEAD_TOPIC_PATTERNS } = require('./agentBase');
  const text = await chat({
    systemPrompt,
    userMessage: `Write a short, natural Slack message based on this context. Sound like a real person talking to their CEO — plain text, conversational, no bold headers, no bullet walls. Brief and direct.

Context: ${context}`,
    model: 'quick',
    maxTokens,
  });
  // DEAD-TOPIC GUARD (Oct 7, 2026): block proactive posts that reference
  // dead initiatives or hallucinated names. Returns null = do not post.
  for (const { pattern, topic } of DEAD_TOPIC_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`[anthropic] Proactive post blocked: references dead topic "${topic}". Not posting.`);
      return null;
    }
  }
  return text;
}

/**
 * Full response/report — uses 'smart' (sonnet) for complex reasoning.
 * Used for handleMention, handleDelegation, analysis tasks.
 * maxTokens capped at 1200 to keep costs predictable; agents should be concise.
 */
async function generateReport({ systemPrompt, context, maxTokens = 1200, model = 'smart', skipEvidence = false }) {
  const { EVIDENCE_REQUIREMENT, DEMO_STANDARD } = require('./agentBase');
  // EVIDENCE GATE (Oct 7, 2026): every deliverable must carry verifiable
  // evidence. Appended automatically — no per-agent prompt patching needed.
  // Pass skipEvidence: true only for internal reasoning never posted.
  // DEMO STANDARD (Oct 9, 2026 — Jesse: "No link, not a demo"): every demo
  // must follow the clickable format. Appended automatically.
  const evidenceBlock = skipEvidence ? '' : `\n\n${EVIDENCE_REQUIREMENT}\n\n${DEMO_STANDARD}`;
  return chat({
    systemPrompt,
    userMessage: `Respond based on this context. Write like a person talking to their CEO — short paragraphs, plain sentences, no bold headers everywhere, no bullet-point lists unless you're genuinely listing 5+ discrete items that need separation. No emoji in the message body. Sound like yourself, not a report generator. Be direct and specific. Keep it under 300 words unless the task genuinely requires more detail.

Context: ${context}${evidenceBlock}`,
    model,
    maxTokens,
  });
}

/**
 * Generate a report with tool execution capability (Oct 9, 2026).
 *
 * This is the fix for "agents can't deliver" — previously agents were pure
 * text generators with no way to build artifacts, check URLs, or write files.
 * Now they can invoke tools during generation:
 *
 * 1. LLM receives tool descriptions in its prompt
 * 2. LLM outputs [TOOL: name] with JSON args to invoke a tool
 * 3. Engine executes the tool and feeds results back
 * 4. LLM incorporates results into its final response
 *
 * Tool calls are bounded, logged, and sandboxed (see utils/agentTools.js).
 */
async function generateWithTools({ systemPrompt, context, maxTokens = 2000, model = 'smart', maxToolRounds = 3 }) {
  const { getToolDescriptions, executeTool } = require('./agentTools');
  const { EVIDENCE_REQUIREMENT, DEMO_STANDARD } = require('./agentBase');

  const toolDocs = getToolDescriptions();
  const toolPrompt = `

AVAILABLE TOOLS — you can actually DO things, not just write about them.
To use a tool, output a line exactly like:
[TOOL: toolName] {"arg1": "value1", "arg2": "value2"}

Available tools:
${toolDocs}

CRITICAL RULES:
- You ARE the agent. Respond AS the agent, never narrate your thinking process.
- NEVER output "Here's a thinking process", "Let me analyze", numbered analysis steps, or any meta-commentary about your reasoning.
- Your response is the agent's direct output — professional, concise, in character.
- Use tools when the task needs real artifacts, verified links, or file output.
- After each tool result, decide if you need another tool or are ready to answer.
- When done with tools, write your final response normally (no [TOOL:] line).
- Max ${maxToolRounds} tool rounds — then you must produce your final answer.
- For demos: write artifacts with fileWrite, verify links with urlCheck, then include the artifact info in your demo following the DEMO STANDARD below.`;

  // For weak/free-tier models: use a minimal prompt focused on the task.
  // The full EVIDENCE_REQUIREMENT and DEMO_STANDARD confuse small models.
  const simpleContext = `Task: ${context}

You have these tools: ${toolDocs.split('\n').slice(0, 10).join('\n')}

To use a tool, output exactly: [TOOL: toolName] {"arg": "value"}
When done, write your answer directly. Be concise. No thinking process narration.`;

  let conversation = simpleContext;
  const toolResults = [];

  // Helper: chat with retry on empty responses (free-tier models flake)
  async function chatWithRetry(opts, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const resp = await chat(opts);
      if (resp && resp.trim().length > 0) return resp;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    throw new Error('LLM returned empty response after retries');
  }

  for (let round = 0; round < maxToolRounds; round++) {
    const response = await chatWithRetry({
      systemPrompt: systemPrompt + '\n\nYou have tools available. Use them when the task needs real output, not just words.',
      userMessage: conversation,
      model,
      maxTokens,
    });

    // Parse tool calls — support two formats:
    // Format 1 (instructed): [TOOL: name] {"arg": "value"}
    // Format 2 (native): <|tool_call_start|>[name(arg='value')]<|tool_call_end|>
    let toolName = null;
    let toolArgs = {};

    const fmt1 = response.match(/\[TOOL:\s*(\w+)\]\s*(\{[^}]*\})/);
    if (fmt1) {
      toolName = fmt1[1];
      try {
        toolArgs = JSON.parse(fmt1[2]);
      } catch {
        conversation += `\n\nTool call parse error for ${toolName} — invalid JSON. Try again with valid JSON or write your final response.`;
        continue;
      }
    } else {
      const fmt2 = response.match(/<\|tool_call_start\|>\s*\[(\w+)\(([^)]*)\)\]\s*<\|tool_call_end\|>/);
      if (fmt2) {
        toolName = fmt2[1];
        // Parse Python-style kwargs: key='value', key="value", key=value
        const argsStr = fmt2[2];
        const argRe = /(\w+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^,\)\s]+))/g;
        let m;
        while ((m = argRe.exec(argsStr)) !== null) {
          toolArgs[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
        }
      }
    }

    if (!toolName) {
      // No tool call — this is the final response
      return { response, toolResults, toolsUsed: toolResults.length };
    }

    const result = executeTool(toolName, toolArgs);
    toolResults.push({ tool: toolName, args: toolArgs, result });

    conversation += `\n\n[Your tool call: ${toolName}]\n[Tool result: ${JSON.stringify(result).slice(0, 2000)}]\n\nContinue: use another tool if needed, or write your final response.`;
  }

  // Max rounds reached — get final response without tools
  // Retry if garbled (free-tier models leak chain-of-thought)
  const { isGarbledOutput } = require('./delegation');
  // Final response gets the full requirements (evidence + demo standard)
  const finalPrompt = `Context: ${context}\n\n${EVIDENCE_REQUIREMENT}\n\n${DEMO_STANDARD}\n\nTool results from your work:\n${toolResults.map(t => `- ${t.tool}: ${JSON.stringify(t.result).slice(0, 500)}`).join('\n')}\n\nWrite your final response now, incorporating the tool results above.\n\nDO NOT output any [TOOL:] lines or <|tool_call_start|> blocks. Your tools are done. Just write the professional response.`;
  let finalResponse = await chatWithRetry({
    systemPrompt,
    userMessage: finalPrompt,
    model,
    maxTokens,
  });

  // Strip any tool calls that leaked into the final response
  finalResponse = finalResponse
    .replace(/<\|tool_call_start\|>.*?<\|tool_call_end\|>/gs, '')
    .replace(/\[TOOL:\s*\w+\]\s*\{[^}]*\}/g, '')
    .trim();

  if (isGarbledOutput(finalResponse)) {
    finalResponse = await chatWithRetry({
      systemPrompt: systemPrompt + '\n\nCRITICAL: Your previous response was REJECTED for narrating your thinking process ("Here\'s a thinking process", numbered analysis steps, etc.). Respond AS the agent directly. No meta-commentary. No analysis steps. Just the professional output.',
      userMessage: conversation + '\n\nWrite your final response now. Direct output only — no thinking process narration.',
      model,
      maxTokens,
    });
  }

  return { response: finalResponse, toolResults, toolsUsed: toolResults.length };
}

module.exports = { chat, generateProactivePost, generateReport, generateWithTools, QUICK_MODEL, SMART_MODEL, BEST_MODEL,
  // True when this host can actually call the model: a direct provider key,
  // or the LiteLLM gateway path (desktop, budget-first). Hosts with neither
  // run the engine in watch mode: lock + board scan + Jesse-gated pings only.
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY || litellm.isConfigured() };
