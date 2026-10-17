# Cloud Agent Usage Examples

Practical examples of how to use cloud agents in the BVital project.

## Basic Agent Activation

### Activate an Agent for a Session

```bash
# Switch to Executive Secretary agent
cp .cursor/agents/agent-es.cursorrules .cursorrules

# Switch to Software Engineering Team agent
cp .cursor/agents/agent-set.cursorrules .cursorrules

# Switch to Marketing Director agent
cp .cursor/agents/agent-md.cursorrules .cursorrules
```

## Common Workflows

### 1. Project Planning Workflow

```bash
# Activate ES agent for project coordination
cp .cursor/agents/agent-es.cursorrules .cursorrules

# ES will:
# - Coordinate sprint planning
# - Create user stories
# - Delegate tasks to appropriate agents
# - Track progress and remove blockers
```

### 2. Development Workflow

```bash
# Activate SET agent for coding tasks
cp .cursor/agents/agent-set.cursorrules .cursorrules

# SET will:
# - Write code following TDD/BDD practices
# - Maintain 80%+ test coverage
# - Follow coding standards
# - Implement technical solutions
```

### 3. Marketing Workflow

```bash
# Activate MD agent for marketing tasks
cp .cursor/agents/agent-md.cursorrules .cursorrules

# MD will:
# - Develop marketing strategies
# - Coordinate Branding Team (DES, CTW, SMM)
# - Plan campaigns and content
# - Optimize for ROI
```

### 4. Design Workflow

```bash
# Activate DES agent for design work
cp .cursor/agents/agent-des.cursorrules .cursorrules

# DES will:
# - Create UI/UX designs
# - Ensure accessibility compliance
# - Maintain brand consistency
# - Produce design assets
```

### 5. Documentation Workflow

```bash
# Activate CTW agent for documentation
cp .cursor/agents/agent-ctw.cursorrules .cursorrules

# CTW will:
# - Write and maintain documentation
# - Create content following style guides
# - Organize knowledge base
# - Ensure documentation clarity
```

## Multi-Agent Scenarios

### Scenario 1: Feature Development

1. **ES coordinates** - Creates user story and plan
2. **DES designs** - Creates UI/UX mockups
3. **SET implements** - Codes the feature with tests
4. **CTW documents** - Writes user and technical docs
5. **ES reviews** - Coordinates testing and deployment

### Scenario 2: Marketing Campaign

1. **MD plans** - Develops campaign strategy
2. **DES designs** - Creates visual assets
3. **CTW writes** - Creates copy and content
4. **SMM schedules** - Plans social media posts
5. **MD analyzes** - Reviews performance and optimizes

### Scenario 3: Legal Matter

1. **UFL/EBL reviews** - Analyzes legal situation
2. **UFL/EBL drafts** - Prepares legal documents
3. **CTW formats** - Ensures proper documentation
4. **ES coordinates** - Manages timeline and deliverables

## Agent Switching

### Quick Agent Switch Script

Create a helper script for easy agent switching:

```bash
#!/bin/bash
# save as: switch-agent.sh

if [ -z "$1" ]; then
    echo "Usage: switch-agent.sh <agent-name>"
    echo "Available agents: es, set, md, des, ctw, smm, drc, bic, dcl, ufl, ebl, sm"
    exit 1
fi

AGENT_FILE=".cursor/agents/agent-${1}.cursorrules"

if [ ! -f "$AGENT_FILE" ]; then
    echo "Error: Agent file not found: $AGENT_FILE"
    exit 1
fi

cp "$AGENT_FILE" .cursorrules
echo "✅ Switched to ${1^^} agent"
```

Usage:
```bash
chmod +x switch-agent.sh
./switch-agent.sh es    # Switch to ES agent
./switch-agent.sh set   # Switch to SET agent
```

## Integration with Cursor IDE

### Using Agents in Cursor Cloud

1. **Reference Agent File**: Point Cursor to the agent configuration file
2. **Agent Selection**: Cursor will load the agent configuration
3. **Framework Access**: Agent has access to all MACF rules
4. **Role Operation**: Agent operates within its role boundaries

### Agent Configuration in Settings

If Cursor supports agent configuration in settings:
- **Agent Path**: `.cursor/agents/agent-{role}.cursorrules`
- **Framework Rules**: Automatically inherited from `.cursor/rules/`
- **Project Context**: Automatically loaded from project structure

## Best Practices

### 1. Start with ES
For any new task or project work, start with the ES agent:
```bash
cp .cursor/agents/agent-es.cursorrules .cursorrules
```
ES will coordinate and delegate as needed.

### 2. Use Specialized Agents
Switch to specialized agents for focused work:
- Coding → SET agent
- Design → DES agent
- Documentation → CTW agent
- Marketing → MD agent

### 3. Maintain Framework Standards
All agents follow MACF framework rules automatically:
- No need to configure standards per agent
- Consistent quality across all agents
- Unified workflows and processes

### 4. Multi-Agent Collaboration
When working with multiple agents:
- ES coordinates overall workflow
- Specialized agents handle their domains
- Clear handoffs between agents
- All follow MACF protocols

## Troubleshooting

### Agent Not Loading Correctly

1. Verify agent file exists: `ls .cursor/agents/agent-{role}.cursorrules`
2. Check file permissions: `chmod 644 .cursor/agents/*.cursorrules`
3. Verify framework rules exist: `ls .cursor/rules/`

### Framework Rules Not Applied

1. Check `.cursor/rules/` directory exists
2. Verify agent configuration references framework rules
3. Regenerate agent configs: `python3 .cursor/agents/generate_agent_configs.py`

### Role Not Following Boundaries

1. Verify role file exists: `.cursor/rules/roles/012-ROLES-{role}.mdc`
2. Check agent configuration includes role file
3. Review role boundaries in role definition file

## Advanced Usage

### Custom Agent Configuration

To create a custom agent configuration:

1. Copy an existing agent file: `cp agent-es.cursorrules agent-custom.cursorrules`
2. Modify the agent identity and responsibilities
3. Keep framework rules inheritance
4. Test the custom agent

### Agent Scripting

For automated workflows:

```bash
#!/bin/bash
# Automated workflow using multiple agents

# Phase 1: Planning with ES
cp .cursor/agents/agent-es.cursorrules .cursorrules
# Run planning tasks...

# Phase 2: Development with SET
cp .cursor/agents/agent-set.cursorrules .cursorrules
# Run development tasks...

# Phase 3: Documentation with CTW
cp .cursor/agents/agent-ctw.cursorrules .cursorrules
# Run documentation tasks...
```

---

*Cloud agents enable specialized, focused work while maintaining consistent framework standards across all tasks.*


