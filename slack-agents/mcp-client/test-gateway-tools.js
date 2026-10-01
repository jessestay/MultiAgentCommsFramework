'use strict';
// Two-tool smoke test: does the desktop gateway honor OpenAI-style tool calls?
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { chatTurn, isConfigured } = require('../utils/litellm');

async function main() {
  console.log('gateway configured:', isConfigured());
  if (!isConfigured()) { console.log('SKIP: no gateway config'); process.exit(0); }
  const tools = [
    { type: 'function', function: { name: 'get_weather', description: 'Get weather for a city', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } },
    { type: 'function', function: { name: 'add_numbers', description: 'Add two numbers', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } } },
  ];
  const turn = await chatTurn({
    systemPrompt: 'You are a test assistant. Use the tools when asked.',
    userMessage: 'What is 41 + 1? Use the add_numbers tool.',
    model: 'smart',
    maxTokens: 300,
    tools,
    toolChoice: 'auto',
  });
  console.log('text:', JSON.stringify(turn.text));
  console.log('toolCalls:', JSON.stringify(turn.toolCalls, null, 2));
  console.log(turn.toolCalls.length > 0 ? 'TOOL-CALL SUPPORT: YES' : 'TOOL-CALL SUPPORT: NO');
}

main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
