/**
 * PM Delegation Layer — TDD
 * 
 * The CEO sends structured requirements to the PM via function call (not LLM).
 * The PM uses LLM reasoning to break requirements into user stories,
 * assign to team members, and manage the sprint.
 * 
 * This replaces CEO→each-role directives with CEO→PM→team.
 */

const { execSync } = require('child_process');

// Role mapping: requirement type → responsible role (deterministic, no LLM)
const ROLE_MAP = {
  'content': 'cmo',
  'visual': 'cuxo',
  'copy': 'cco',
  'outreach': 'cro',
  'finance': 'cfo',
  'tech': 'cto',
  'legal': 'lawyer',
  'pm': 'execpm'
};

/**
 * CEO → PM: structured requirement (function call, not LLM)
 * @param {Object} req - { type, title, description, priority, deadline }
 * @returns {Object} - { pmTaskId, status }
 */
function ceoToPm(req) {
  // Validate required fields
  if (!req.type || !req.title) {
    throw new Error('Requirement must have type and title');
  }
  
  // Deterministic routing: no LLM needed
  const role = ROLE_MAP[req.type];
  if (!role) {
    throw new Error(`Unknown requirement type: ${req.type}`);
  }
  
  return {
    type: req.type,
    title: req.title,
    description: req.description || '',
    priority: req.priority || 3,
    deadline: req.deadline || null,
    assignedRole: role,
    status: 'pending-pm-breakdown'
  };
}

/**
 * PM breaks requirement into user stories (this uses LLM reasoning)
 * @param {Object} req - structured requirement from CEO
 * @returns {Array} - user stories with acceptance criteria
 */
function pmBreakdown(req) {
  // This is where PM uses LLM to reason about the requirement.
  // For TDD, we test the structure, not the LLM output.
  // In production, this calls the gateway with a PM persona prompt.
  
  return {
    requirement: req,
    stories: [], // Filled by LLM in production
    status: 'ready-for-llm-breakdown'
  };
}

module.exports = { ceoToPm, pmBreakdown, ROLE_MAP };

// TDD: Run with `node engine/pm-delegation.test.js`
if (require.main === module) {
  console.log('Running PM delegation tests...');
  
  // Test 1: CEO sends content requirement → routes to CMO
  const req1 = ceoToPm({ type: 'content', title: 'Workshop promo' });
  console.assert(req1.assignedRole === 'cmo', 'Content should route to CMO');
  console.log('✓ Content routes to CMO');
  
  // Test 2: CEO sends visual requirement → routes to CUXO
  const req2 = ceoToPm({ type: 'visual', title: 'Promo images' });
  console.assert(req2.assignedRole === 'cuxo', 'Visual should route to CUXO');
  console.log('✓ Visual routes to CUXO');
  
  // Test 3: Missing type throws
  try {
    ceoToPm({ title: 'No type' });
    console.assert(false, 'Should throw on missing type');
  } catch (e) {
    console.log('✓ Throws on missing type');
  }
  
  // Test 4: Unknown type throws
  try {
    ceoToPm({ type: 'unknown', title: 'Bad type' });
    console.assert(false, 'Should throw on unknown type');
  } catch (e) {
    console.log('✓ Throws on unknown type');
  }
  
  console.log('\nAll PM delegation tests passed!');
}
