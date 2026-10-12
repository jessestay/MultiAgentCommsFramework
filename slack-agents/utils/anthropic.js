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
 * Tool-calling machinery (Oct 12, 2026 — Vikunja #724 + amendment).
 *
 * Design: docs/code-enforced-tool-use-design.md (Pillars 1/3/4) and the
 * Oct 12 13:43 amendment (constrained decoding + native tool calling).
 *
 * Route policy:
 *  - Where the route supports the provider's NATIVE tool_call channel,
 *    generateWithTools uses it: tool definitions go out as JSON Schema and
 *    calls/results travel on the structured channel. The direct Anthropic
 *    route uses the SDK's tool_use blocks; the LiteLLM gateway route uses
 *    chatTurn's OpenAI-style tools.
 *  - Text-protocol emulation ([TOOL: ...] lines parsed from prose) is a
 *    LEGACY FALLBACK only, engaged when the route has no native channel
 *    (detected: gateway rejects tools, failover reports toolsDropped, or no
 *    native-capable client). Every emulation run is explicitly FLAGGED —
 *    result.toolCallingMode === 'text-emulation', a console warning, and a
 *    persisted toolRoutes state record — never silent.
 *  - Out-of-schema calls cannot execute on ANY route: executeTool validates
 *    against the per-tool argsSchema and returns a structured correction,
 *    which the loop feeds back on the same channel. Repeating the identical
 *    violation short-circuits the attempt (ok:false, 'invalid_input').
 *  - A final turn containing UNEXECUTED tool-call syntax (the Oct 12
 *    production break: role-played calls + fabricated "[Tool result: ...]"
 *    queued as deliverables for tasks 230/711/271/234/235) is a failed
 *    attempt: the loop re-enters with a correction, and persistent
 *    role-play returns ok:false, errorClass 'invalid_deliverable'. Such
 *    text is never returned as a deliverable.
 */

// JSON Schema parameters object for a registry tool.
function schemaParams(tool) {
  const s = tool.argsSchema || { type: 'object', properties: {}, required: [] };
  return {
    type: 'object',
    properties: s.properties || {},
    required: s.required || [],
    additionalProperties: s.additionalProperties !== false,
  };
}

function openAiToolDefs(TOOLS) {
  return Object.entries(TOOLS).map(([name, t]) => ({
    type: 'function',
    function: { name, description: t.description, parameters: schemaParams(t) },
  }));
}

function anthropicToolDefs(TOOLS) {
  return Object.entries(TOOLS).map(([name, t]) => ({
    name, description: t.description, input_schema: schemaParams(t),
  }));
}

// Tool-call syntax present in text but never executed. Returns a label or
// null. The pattern set lives HERE (generation-time loop integrity, code
// enforcement): the tool-usage auditor's text detectors were deleted in
// Phase 2 — telemetry no longer infers anything from prose.
const UNEXECUTED_CALL_PATTERNS = [
  /\[\s*(fileRead|fileWrite|fileList|urlCheck)\s*\(/,          // [fileRead(path='x')]
  /\b(fileRead|fileWrite|fileList|urlCheck)\((?:path|url)\s*=/, // bare fileRead(path='x')
  /<\|tool_call/,                                                // leaked control tokens
  /\[TOOL:\s*(fileRead|fileWrite|fileList|urlCheck)\]/,         // unexecuted [TOOL:] line
];

function findUnexecutedCallSyntax(text) {
  if (!text) return null;
  for (const re of UNEXECUTED_CALL_PATTERNS) {
    const m = text.match(re);
    if (m) return `tool-call text (${m[1] || 'control token'})`;
  }
  if (/\[Tool result:/i.test(text)) return 'fabricated tool result';
  return null;
}

// Extract a JSON value from a model's final text (bare JSON or fenced).
function parseDeliverableText(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return { value: JSON.parse(candidate) };
  } catch {
    return { value: null };
  }
}

function flagToolCallingMode(mode) {
  try {
    const st = require('./state');
    st.set('toolRoutes', 'lastMode', mode);
    st.set('toolRoutes', 'lastFlaggedAt', new Date().toISOString());
  } catch { /* fail-open */ }
  if (mode === 'text-emulation') {
    console.log('[generateWithTools] ROUTE FLAG: route has no native tool channel — TEXT EMULATION engaged (legacy fallback)');
  }
}

const ROLEPLAY_CORRECTION = (syntax) => `Your previous message contained ${syntax} that was NOT executed — no tool ran and any result shown in it does not exist. Either call a tool for real, or write your final answer in plain prose with no tool-call syntax and no fabricated tool results.`;

/**
 * Generate a report with tool execution capability (Oct 9, 2026; reworked
 * Oct 12, 2026 for #724 — see the machinery note above).
 *
 * Returns { response, toolResults, toolsUsed, toolCallingMode } on success,
 * or { ok: false, errorClass, response: null, toolResults, toolsUsed,
 * toolCallingMode } when the attempt fails structurally (repeated invalid
 * input, role-played deliverable). Callers must treat ok:false as a failed
 * attempt — never as a deliverable.
 */
async function generateWithTools({ systemPrompt, context, maxTokens = 2000, model = 'smart', maxToolRounds = 3, agentId = null, taskId = null, outputSchema = null, schemaName = null }) {
  const { getToolDescriptions, executeTool, TOOLS } = require('./agentTools');
  const { EVIDENCE_REQUIREMENT, DEMO_STANDARD } = require('./agentBase');

  const toolResults = [];
  const violations = new Map();
  let mode = null;

  // Typed deliverable (Pillar 3): when outputSchema is set, a candidate
  // final text must be a schema-valid JSON deliverable. One repair round
  // with the field-level validationErrors, then the attempt fails as
  // invalid_deliverable. Text is never pattern-matched into a pass.
  let deliverableStrikes = 0;
  function judgeDeliverable(text) {
    const { value } = parseDeliverableText(text);
    if (value === null) {
      return { ok: false, validationErrors: [{ path: '$', expected: `JSON deliverable${schemaName ? ` (${schemaName})` : ''}`, received: 'unparseable text' }] };
    }
    const { validate } = require('../engine/deliverableSchemas');
    const v = validate(outputSchema, value);
    if (!v.valid) return { ok: false, validationErrors: v.errors };
    return { ok: true, deliverable: value };
  }
  const deliverableCorrection = (errors) =>
    `Your final answer was not a valid deliverable. validationErrors: ${JSON.stringify(errors)}. Return ONLY the JSON deliverable object${schemaName ? ` matching schema ${schemaName}` : ''} — no prose, no markdown, no tool-call text.`;

  // Execute one tool call through the gateway choke point (validation +
  // receipts happen inside executeTool) and track repeated violations.
  async function runTool(toolName, args) {
    const result = await executeTool(toolName, args, { agentId, taskId });
    toolResults.push({ tool: toolName, args, result });
    let repeatedViolation = false;
    if (result && !result.ok && result.errorClass === 'invalid_input' && result.correction) {
      const sig = `${toolName}|${(result.correction.received || []).join(',')}|${(result.correction.missing || []).join(',')}`;
      const n = (violations.get(sig) || 0) + 1;
      violations.set(sig, n);
      if (n >= 2) repeatedViolation = true;
    }
    return { result, repeatedViolation };
  }

  const finish = (extra) => ({ toolResults, toolsUsed: toolResults.length, toolCallingMode: mode, ...extra });
  const fail = (errorClass, extra = {}) => finish({ ok: false, errorClass, response: null, ...extra });
  const deliverableDone = (deliverable) => finish({
    response: deliverable.summary || JSON.stringify(deliverable),
    deliverable,
  });

  const nativeContext = `Task: ${context}\n\nYou have tools available on the native tool channel. Call them when the task needs real output (files, verified links). When the work is done, write your final answer directly in plain prose — never write tool calls or tool results as text. Be concise. No thinking-process narration.`;

  // ─── Native loop: LiteLLM gateway route (OpenAI-style tools) ─────────────
  async function gatewayNativeLoop() {
    const tools = openAiToolDefs(TOOLS);
    const messages = [{ role: 'user', content: nativeContext }];
    let syntaxStrikes = 0;
    for (let round = 0; round <= maxToolRounds; round++) {
      const wantTools = round < maxToolRounds;
      let turn;
      try {
        turn = await litellm.chatTurn({
          systemPrompt, messages, model, maxTokens,
          ...(wantTools ? { tools } : {}),
        });
      } catch (err) {
        if (wantTools && /tools?\s+(are\s+)?not supported|tool calling (is )?not supported|functions?\s+(are\s+)?not supported/i.test(err.message || '')) {
          return { fallback: 'tools-unsupported' };
        }
        throw err;
      }
      if (turn && turn.toolsDropped) return { fallback: 'tools-dropped' };
      const calls = (turn && turn.toolCalls) || [];
      if (calls.length) {
        messages.push({
          role: 'assistant',
          content: turn.text || null,
          tool_calls: calls.map((tc, i) => ({
            id: tc.id || `call_${round}_${i}`, type: 'function',
            function: { name: tc.toolName, arguments: JSON.stringify(tc.args || {}) },
          })),
        });
        for (let i = 0; i < calls.length; i++) {
          const tc = calls[i];
          const id = tc.id || `call_${round}_${i}`;
          const { result, repeatedViolation } = await runTool(tc.toolName, tc.args || {});
          messages.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(result).slice(0, 2000) });
          if (repeatedViolation) return { failure: fail('invalid_input') };
        }
        continue;
      }
      const text = (turn && turn.text) || '';
      if (!text) continue; // empty turn — spend a round; exhaustion handled after the loop
      if (outputSchema) {
        const j = judgeDeliverable(text);
        if (j.ok) return { done: deliverableDone(j.deliverable) };
        deliverableStrikes++;
        if (deliverableStrikes >= 2) return { failure: fail('invalid_deliverable', { validationErrors: j.validationErrors }) };
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: deliverableCorrection(j.validationErrors) });
        continue;
      }
      const syntax = findUnexecutedCallSyntax(text);
      if (syntax) {
        syntaxStrikes++;
        if (syntaxStrikes >= 2) return { failure: fail('invalid_deliverable') };
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: ROLEPLAY_CORRECTION(syntax) });
        continue;
      }
      return { done: finish({ response: text }) };
    }
    throw new Error('LLM returned empty response after retries');
  }

  // ─── Native loop: direct Anthropic SDK route (tool_use blocks) ───────────
  async function sdkNativeLoop() {
    const tools = anthropicToolDefs(TOOLS);
    const messages = [{ role: 'user', content: nativeContext }];
    let syntaxStrikes = 0;
    for (let round = 0; round <= maxToolRounds; round++) {
      const wantTools = round < maxToolRounds;
      const resp = await client.messages.create({
        model: resolveModel(model),
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        ...(wantTools ? { tools } : {}),
      });
      const blocks = (resp && resp.content) || [];
      // Typed text blocks; an untyped block carrying a text string is also
      // accepted (the pre-#724 chat() read content[0].text unconditionally).
      const text = blocks
        .filter(b => b.type === 'text' || (b.type === undefined && typeof b.text === 'string'))
        .map(b => b.text).join('');
      const calls = blocks.filter(b => b.type === 'tool_use')
        .map(b => ({ id: b.id, toolName: b.name, args: b.input || {} }));
      if (calls.length) {
        messages.push({ role: 'assistant', content: blocks });
        const resultBlocks = [];
        for (const tc of calls) {
          const { result, repeatedViolation } = await runTool(tc.toolName, tc.args);
          resultBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(result).slice(0, 2000) });
          if (repeatedViolation) return { failure: fail('invalid_input') };
        }
        messages.push({ role: 'user', content: resultBlocks });
        continue;
      }
      if (!text) continue;
      if (outputSchema) {
        const j = judgeDeliverable(text);
        if (j.ok) return { done: deliverableDone(j.deliverable) };
        deliverableStrikes++;
        if (deliverableStrikes >= 2) return { failure: fail('invalid_deliverable', { validationErrors: j.validationErrors }) };
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: deliverableCorrection(j.validationErrors) });
        continue;
      }
      const syntax = findUnexecutedCallSyntax(text);
      if (syntax) {
        syntaxStrikes++;
        if (syntaxStrikes >= 2) return { failure: fail('invalid_deliverable') };
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: ROLEPLAY_CORRECTION(syntax) });
        continue;
      }
      return { done: finish({ response: text }) };
    }
    throw new Error('LLM returned empty response after retries');
  }

  // ─── Text-emulation loop (legacy fallback, explicitly flagged) ───────────
  async function textEmulationLoop() {
    const toolDocs = getToolDescriptions();
    const simpleContext = `Task: ${context}\n\nYou have these tools: ${toolDocs.split('\n').slice(0, 10).join('\n')}\n\nTo use a tool, output exactly: [TOOL: toolName] {"arg": "value"}\nWhen done, write your answer directly. Be concise. No thinking process narration.`;
    let conversation = simpleContext;
    let syntaxStrikes = 0;

    async function chatWithRetry(opts, maxRetries = 2) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const resp = await chat(opts);
        if (resp && resp.trim().length > 0) return resp;
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
      throw new Error('LLM returned empty response after retries');
    }

    // Judge a candidate final answer. Returns 'retry' (correction fed back),
    // a failure object, { deliverable } for a valid typed output, or null
    // when a plain-text answer is acceptable (uncontracted work only).
    function judgeFinalText(text) {
      if (outputSchema) {
        const j = judgeDeliverable(text);
        if (j.ok) return { deliverable: j.deliverable };
        deliverableStrikes++;
        if (deliverableStrikes >= 2) return fail('invalid_deliverable', { validationErrors: j.validationErrors });
        conversation += `\n\n${deliverableCorrection(j.validationErrors)}`;
        return 'retry';
      }
      const syntax = findUnexecutedCallSyntax(text);
      if (!syntax) return null;
      syntaxStrikes++;
      if (syntaxStrikes >= 2) return fail('invalid_deliverable');
      conversation += `\n\n${ROLEPLAY_CORRECTION(syntax)}`;
      return 'retry';
    }

    for (let round = 0; round < maxToolRounds; round++) {
      const response = await chatWithRetry({
        systemPrompt: systemPrompt + '\n\nYou have tools available. Use them when the task needs real output, not just words.',
        userMessage: conversation,
        model,
        maxTokens,
      });

      // Parse tool calls — two legacy text formats:
      // Format 1 (instructed): [TOOL: name] {"arg": "value"}
      // Format 2 (native leak): <|tool_call_start|>[name(arg='value')]<|tool_call_end|>
      let toolName = null;
      let toolArgs = {};

      const fmt1 = response.match(/\[TOOL:\s*(\w+)\]\s*(\{[^}]*\})/);
      if (fmt1) {
        toolName = fmt1[1];
        try {
          toolArgs = JSON.parse(fmt1[2]);
        } catch {
          // TOOL AUDITOR (Oct 12, 2026 — #722): the model TRIED to call a tool
          // and couldn't format it. Record it the second it happens.
          try { require('../engine/toolUsageAuditor').recordMalformedCall({ tool: toolName, model }); } catch { /* fail-open */ }
          conversation += `\n\nTool call parse error for ${toolName} — invalid JSON. Try again with valid JSON or write your final response.`;
          continue;
        }
      } else {
        const fmt2 = response.match(/<\|tool_call_start\|>\s*\[(\w+)\(([^)]*)\)\]\s*<\|tool_call_end\|>/);
        if (fmt2) {
          toolName = fmt2[1];
          const argsStr = fmt2[2];
          const argRe = /(\w+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^,\)\s]+))/g;
          let m;
          while ((m = argRe.exec(argsStr)) !== null) {
            toolArgs[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
          }
        }
      }

      if (!toolName) {
        const verdict = judgeFinalText(response);
        if (verdict === 'retry') continue;
        if (verdict && verdict.deliverable) return deliverableDone(verdict.deliverable);
        if (verdict) return verdict;
        return finish({ response });
      }

      const { result, repeatedViolation } = await runTool(toolName, toolArgs);
      if (repeatedViolation) return fail('invalid_input');
      conversation += `\n\n[Your tool call: ${toolName}]\n[Tool result: ${JSON.stringify(result).slice(0, 2000)}]\n\nContinue: use another tool if needed, or write your final response.`;
    }

    // Max rounds reached — get final response without tools.
    const { isGarbledOutput } = require('./delegation');
    const finalPrompt = `Context: ${context}\n\n${EVIDENCE_REQUIREMENT}\n\n${DEMO_STANDARD}\n\nTool results from your work:\n${toolResults.map(t => `- ${t.tool}: ${JSON.stringify(t.result).slice(0, 500)}`).join('\n')}\n\nWrite your final response now, incorporating the tool results above.\n\nDO NOT output any [TOOL:] lines or <|tool_call_start|> blocks. Your tools are done. Just write the professional response.`;
    let finalResponse = await chatWithRetry({
      systemPrompt,
      userMessage: finalPrompt,
      model,
      maxTokens,
    });

    // Typed path: the final answer must validate as a deliverable.
    if (outputSchema) {
      const j = judgeDeliverable(finalResponse);
      if (j.ok) return deliverableDone(j.deliverable);
      return fail('invalid_deliverable', { validationErrors: j.validationErrors });
    }

    // Unexecuted call syntax in the final answer is a failed attempt —
    // it is never stripped-and-shipped (that WAS the production bug).
    const syntax = findUnexecutedCallSyntax(finalResponse);
    if (syntax) return fail('invalid_deliverable');

    if (isGarbledOutput(finalResponse)) {
      finalResponse = await chatWithRetry({
        systemPrompt: systemPrompt + '\n\nCRITICAL: Your previous response was REJECTED for narrating your thinking process ("Here\'s a thinking process", numbered analysis steps, etc.). Respond AS the agent directly. No meta-commentary. No analysis steps. Just the professional output.',
        userMessage: conversation + '\n\nWrite your final response now. Direct output only — no thinking process narration.',
        model,
        maxTokens,
      });
      if (findUnexecutedCallSyntax(finalResponse)) return fail('invalid_deliverable');
    }

    return finish({ response: finalResponse });
  }

  // ─── Route selection ─────────────────────────────────────────────────────
  const useSdk = !!process.env.ANTHROPIC_API_KEY;
  const gatewayNative = !useSdk && litellm.isConfigured() && typeof litellm.chatTurn === 'function';

  if (useSdk) {
    mode = 'native';
    flagToolCallingMode(mode);
    const out = await sdkNativeLoop();
    if (out.failure) return out.failure;
    return out.done;
  }
  if (gatewayNative) {
    mode = 'native';
    const out = await gatewayNativeLoop();
    if (out.fallback) {
      // Route lacks a working native channel — degrade EXPLICITLY.
      mode = 'text-emulation';
      flagToolCallingMode(mode);
      return textEmulationLoop();
    }
    flagToolCallingMode(mode);
    if (out.failure) return out.failure;
    return out.done;
  }
  mode = 'text-emulation';
  flagToolCallingMode(mode);
  return textEmulationLoop();
}

/**
 * generateStructured — the single typed model seam (Oct 12, 2026 — #724
 * Amendment A Layer 3; consumed by Phase 3 executors via ctx.generate).
 *
 * Asks the model for a value conforming to outputSchema and validates the
 * result locally, always. On the gateway route the schema also goes out as
 * a response_format json_schema so the provider enforces it at decode time
 * where supported (enforcement reported in the result). One correction
 * round with the field-level validationErrors, then invalid_deliverable.
 */
async function generateStructured({ systemPrompt, input, outputSchema, schemaName = null, model = 'smart', maxTokens = 1500 }) {
  const { validate } = require('../engine/deliverableSchemas');
  const schemaJson = JSON.stringify(outputSchema);
  let feedback = '';
  let lastErrors = [{ path: '$', expected: 'JSON deliverable', received: 'no attempt made' }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const userMessage =
      `Input:\n${typeof input === 'string' ? input : JSON.stringify(input)}\n\n` +
      `Return ONLY a JSON object conforming to this schema${schemaName ? ` (${schemaName})` : ''}:\n${schemaJson}${feedback}`;
    let text = '';
    let enforcement = 'local-validation';
    if (!process.env.ANTHROPIC_API_KEY && litellm.isConfigured() && typeof litellm.chatTurn === 'function') {
      const turn = await litellm.chatTurn({
        systemPrompt, userMessage, model, maxTokens,
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: (schemaName || 'deliverable').replace(/[^a-zA-Z0-9_-]/g, '_'), schema: outputSchema, strict: true },
        },
      });
      text = (turn && turn.text) || '';
      enforcement = 'gateway-json-schema+local-validation';
    } else {
      text = await chat({ systemPrompt, userMessage, model, maxTokens });
    }
    const { value } = parseDeliverableText(text);
    if (value !== null) {
      const v = validate(outputSchema, value);
      if (v.valid) return { ok: true, value, enforcement };
      lastErrors = v.errors;
    } else {
      lastErrors = [{ path: '$', expected: 'JSON deliverable', received: 'unparseable text' }];
    }
    feedback = `\n\nYour previous output was invalid. validationErrors: ${JSON.stringify(lastErrors)}. Return ONLY the corrected JSON object.`;
  }
  return { ok: false, errorClass: 'invalid_deliverable', validationErrors: lastErrors };
}

module.exports = { chat, generateProactivePost, generateReport, generateWithTools, generateStructured, QUICK_MODEL, SMART_MODEL, BEST_MODEL,
  // True when this host can actually call the model: a direct provider key,
  // or the LiteLLM gateway path (desktop, budget-first). Hosts with neither
  // run the engine in watch mode: lock + board scan + Jesse-gated pings only.
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY || litellm.isConfigured() };
