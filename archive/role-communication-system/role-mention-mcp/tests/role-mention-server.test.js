const { createServer } = require('@modelcontextprotocol/server');

// Mock the createServer function
jest.mock('@modelcontextprotocol/server', () => ({
  createServer: jest.fn(() => ({
    listen: jest.fn()
  }))
}));

// Import the server module
const serverPath = '../role-mention-server';

describe('Role Mention MCP Server', () => {
  let server;
  let tools;
  
  beforeEach(() => {
    // Clear the module cache to reload the server
    jest.resetModules();
    
    // Reset the mock
    createServer.mockClear();
    
    // Import the server module
    require(serverPath);
    
    // Get the tools passed to createServer
    tools = createServer.mock.calls[0][0].tools;
  });
  
  test('Server is created with the correct tools', () => {
    expect(createServer).toHaveBeenCalled();
    expect(tools).toBeDefined();
    expect(tools.length).toBeGreaterThan(0);
    
    // Check for the handle_role_mention tool
    const handleRoleMentionTool = tools.find(tool => tool.name === 'handle_role_mention');
    expect(handleRoleMentionTool).toBeDefined();
    
    // Check for the get_role_info tool
    const getRoleInfoTool = tools.find(tool => tool.name === 'get_role_info');
    expect(getRoleInfoTool).toBeDefined();
  });
  
  describe('handle_role_mention tool', () => {
    let handleRoleMentionTool;
    
    beforeEach(() => {
      handleRoleMentionTool = tools.find(tool => tool.name === 'handle_role_mention');
    });
    
    test('Detects @ES mention and returns correct response', async () => {
      const result = await handleRoleMentionTool.handler({
        message: 'Hey @ES, can you coordinate with the team about our fundraising campaign?'
      });
      
      expect(result.mentioned_role).toBe('ES');
      expect(result.should_respond_as_role).toBe('ES');
      expect(result.full_name).toBe('Executive Secretary');
      expect(result.instruction).toContain('Respond as ES');
    });
    
    test('Detects @SET mention and returns correct response', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@SET, can you implement a notification system for our fundraising campaign?'
      });
      
      expect(result.mentioned_role).toBe('SET');
      expect(result.should_respond_as_role).toBe('SET');
      expect(result.full_name).toBe('Software Engineering Team');
      expect(result.instruction).toContain('Respond as SET');
    });
    
    test('Detects @MD mention and returns correct response', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@MD, please prepare social media materials for our fundraising campaign.'
      });
      
      expect(result.mentioned_role).toBe('MD');
      expect(result.should_respond_as_role).toBe('MD');
      expect(result.full_name).toBe('Marketing Director');
      expect(result.instruction).toContain('Respond as MD');
    });
    
    test('Detects urgent messages', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@SET, we urgently need the notification system implemented by tomorrow!'
      });
      
      expect(result.mentioned_role).toBe('SET');
      expect(result.is_urgent).toBe(true);
      expect(result.instruction).toContain('urgent');
    });
    
    test('Detects multiple role mentions', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@ES, please coordinate with @MD and @SET on the fundraising campaign.'
      });
      
      expect(result.mentioned_role).toBe('ES');
      expect(result.multiple_roles).toBe(true);
      expect(result.additional_roles).toContain('MD');
      expect(result.additional_roles).toContain('SET');
      expect(result.instruction).toContain('other roles');
    });
    
    test('Continues with current role if no mention is found', async () => {
      const result = await handleRoleMentionTool.handler({
        message: 'Can you provide more details about the fundraising campaign?',
        current_role: 'ES'
      });
      
      expect(result.mentioned_role).toBe('ES');
      expect(result.should_respond_as_role).toBe('ES');
      expect(result.instruction).toContain('Continue responding as ES');
    });
    
    test('Responds as normal if no mention and no current role', async () => {
      const result = await handleRoleMentionTool.handler({
        message: 'Can you provide more details about the fundraising campaign?'
      });
      
      expect(result.mentioned_role).toBeNull();
      expect(result.should_respond_as_role).toBeNull();
      expect(result.instruction).toBe('No role mentioned. Respond as the AI assistant.');
    });
  });
  
  describe('get_role_info tool', () => {
    let getRoleInfoTool;
    
    beforeEach(() => {
      getRoleInfoTool = tools.find(tool => tool.name === 'get_role_info');
    });
    
    test('Returns information for a specific role', async () => {
      const result = await getRoleInfoTool.handler({
        role: 'ES'
      });
      
      expect(result.role).toBe('ES');
      expect(result.full_name).toBe('Executive Secretary');
      expect(result.expertise).toBeDefined();
      expect(result.exists).toBe(true);
    });
    
    test('Returns available roles when role does not exist', async () => {
      const result = await getRoleInfoTool.handler({
        role: 'INVALID'
      });
      
      expect(result.exists).toBe(false);
      expect(result.available_roles).toBeDefined();
      expect(result.available_roles.length).toBeGreaterThan(0);
    });
    
    test('Returns all role information when no role is specified', async () => {
      const result = await getRoleInfoTool.handler({});
      
      expect(result.available_roles).toBeDefined();
      expect(result.role_info).toBeDefined();
      expect(result.role_info.length).toBeGreaterThan(0);
    });
  });
  
  describe('Role-specific functionality tests', () => {
    let handleRoleMentionTool;
    
    beforeEach(() => {
      handleRoleMentionTool = tools.find(tool => tool.name === 'handle_role_mention');
    });
    
    test('ES can coordinate tasks', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@ES, can you coordinate the fundraising campaign tasks?'
      });
      
      expect(result.mentioned_role).toBe('ES');
      expect(result.expertise).toContain('coordination');
    });
    
    test('SET can implement technical solutions', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@SET, can you implement a notification system?'
      });
      
      expect(result.mentioned_role).toBe('SET');
      expect(result.expertise).toContain('software development');
    });
    
    test('MD can create marketing strategies', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@MD, can you create a marketing strategy for our fundraising campaign?'
      });
      
      expect(result.mentioned_role).toBe('MD');
      expect(result.expertise).toContain('marketing strategy');
    });
    
    test('SMM can manage social media', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@SMM, can you manage our social media for the fundraising campaign?'
      });
      
      expect(result.mentioned_role).toBe('SMM');
      expect(result.expertise).toContain('social media management');
    });
    
    test('CTW can create content', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@CTW, can you write copy for our fundraising campaign?'
      });
      
      expect(result.mentioned_role).toBe('CTW');
      expect(result.expertise).toContain('content writing');
    });
    
    test('BIC can provide business strategies', async () => {
      const result = await handleRoleMentionTool.handler({
        message: '@BIC, can you suggest strategies to maximize our fundraising revenue?'
      });
      
      expect(result.mentioned_role).toBe('BIC');
      expect(result.expertise).toContain('business strategy');
    });
  });
}); 