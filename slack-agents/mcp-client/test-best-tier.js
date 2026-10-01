'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { chatTurn } = require('../utils/litellm');
(async () => {
  const tools = [
    { type: 'function', function: { name: 'add_numbers', description: 'Add two numbers', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } } },
  ];
  const turn = await chatTurn({
    systemPrompt: 'You are a test assistant. Use the tools when asked.',
    userMessage: 'What is 41 + 1? Use the add_numbers tool.',
    model: 'best', maxTokens: 300, tools, toolChoice: 'auto',
  });
  console.log('text:', JSON.stringify((turn.text||'').slice(0,200)));
  console.log('native toolCalls:', JSON.stringify(turn.toolCalls));
  console.log(turn.toolCalls.length > 0 ? 'BEST TIER NATIVE TOOL CALLS: YES' : 'BEST TIER NATIVE TOOL CALLS: NO');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
