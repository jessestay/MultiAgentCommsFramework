// core/ai/perplexity.js — Perplexity AI backend
// Implements the AIBackend interface. Perplexity excels at real-time web research,
// making it a natural fit for CRO (research) tasks. To route specific agents or
// task types here, see core/ai/interface.js or build a RoutingBackend.
//
// Requires: PERPLEXITY_API_KEY env var.
// Model options: sonar-small-online, sonar-medium-online, sonar-large-online

const DEFAULT_MODEL    = process.env.PERPLEXITY_MODEL || 'sonar-medium-online';
const DEFAULT_MAX_TOKENS = 1024;

async function chat({ systemPrompt, userMessage, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS }) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('[ai/perplexity] PERPLEXITY_API_KEY not set');

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[ai/perplexity] API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function generateReport({ systemPrompt, context, maxTokens = 2048 }) {
  return chat({
    systemPrompt,
    userMessage: `Respond based on this context. Write like a person talking to their CEO — short paragraphs, plain sentences, no bold headers, no bullet walls. Be direct and specific.

Context: ${context}`,
    maxTokens,
  });
}

async function generateProactivePost({ systemPrompt, context, maxTokens = 512 }) {
  return chat({
    systemPrompt,
    userMessage: `Write a short, natural Slack message based on this context. Sound like a real person — plain text, conversational, brief and direct.

Context: ${context}`,
    maxTokens,
  });
}

module.exports = { chat, generateReport, generateProactivePost };
