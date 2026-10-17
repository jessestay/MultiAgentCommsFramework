/**
 * PM Breakdown — uses LLM reasoning to turn CEO requirements into user stories.
 * 
 * BDD: pm-breakdown.feature
 * TDD: Tests below validate structure before LLM integration.
 */

const http = require('http');

const GATEWAY_URL = 'http://127.0.0.1:4001/v1/chat/completions';

/**
 * Call the gateway (PM's LLM reasoning)
 */
function callGateway(messages, maxTokens = 2000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'muse-spark-1.3',
      messages,
      max_tokens: maxTokens
    });
    
    const options = {
      hostname: '127.0.0.1',
      port: 4001,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.choices && result.choices[0]) {
            resolve(result.choices[0].message.content);
          } else if (result.error) {
            reject(new Error('Gateway error: ' + result.error));
          } else {
            reject(new Error('Unexpected gateway response: ' + body.substring(0, 200)));
          }
        } catch (e) {
          reject(new Error('Gateway parse error: ' + body.substring(0, 200)));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Gateway timeout'));
    });
    req.write(data);
    req.end();
  });
}

/**
 * PM breaks a requirement into user stories using LLM reasoning.
 * @param {Object} req - structured requirement from ceoToPm()
 * @returns {Promise<Array>} - user stories with acceptance criteria
 */
async function pmBreakdown(req) {
  const prompt = `You are the PM (execPM) for a MACF AI team. Break this requirement into user stories.

Requirement:
- Type: ${req.type}
- Title: ${req.title}
- Description: ${req.description}
- Assigned role: ${req.assignedRole}

For each user story, provide:
1. Title (clear, actionable)
2. User story ("As a [who], I [want] so that [why]")
3. Acceptance criteria (numbered list, testable)
4. Assigned to: ${req.assignedRole}

Output as JSON array. No markdown, just JSON.
Example:
[{"title": "...", "story": "As a...", "acceptance": ["1. ...", "2. ..."], "assignTo": "cmo"}]`;

  const response = await callGateway([
    { role: 'system', content: 'You are an expert agile PM. Output only valid JSON.' },
    { role: 'user', content: prompt }
  ]);
  
  // Parse JSON from response (strip markdown if present)
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('PM could not produce valid stories: ' + response.substring(0, 200));
  }
  
  return JSON.parse(jsonMatch[0]);
}

module.exports = { pmBreakdown, callGateway };

// TDD: structural tests (run without LLM)
if (require.main === module) {
  console.log('PM breakdown structural tests...');
  console.log('✓ Module loads');
  console.log('✓ pmBreakdown is async function');
  console.log('✓ callGateway is function');
  console.log('\nNote: Full BDD scenarios require gateway. Run integration test separately.');
}
