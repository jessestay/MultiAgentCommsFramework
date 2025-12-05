#!/usr/bin/env python3
"""
Generate cloud agent configuration files for each role in the Multi-agent Communications Framework.

Each agent configuration includes:
- All MACF framework rules
- Role-specific rules
- Clear instructions for the agent
"""

import os
from pathlib import Path

# Role mappings (file name -> role abbreviation -> role name)
ROLES = {
    '012-ROLES-es.mdc': ('ES', 'Executive Secretary'),
    '013-ROLES-set.mdc': ('SET', 'Software Engineering Team'),
    '014-ROLES-md.mdc': ('MD', 'Marketing Director'),
    '015-ROLES-ctw.mdc': ('CTW', 'Copy/Technical Writer'),
    '016-ROLES-des.mdc': ('DES', 'Designer'),
    '017-ROLES-smm.mdc': ('SMM', 'Social Media Manager'),
    '018-ROLES-bic.mdc': ('BIC', 'Business Income Coach'),
    '019-ROLES-dcl.mdc': ('DCL', 'Debt Consumer Law Coach'),
    '019A-ROLES-drc.mdc': ('DRC', 'Dating and Relationship Coach'),
    '019B-ROLES-sm.mdc': ('SM', 'Scrum Master'),
    '019C-ROLES-ufl.mdc': ('UFL', 'Utah Family Lawyer'),
    '019D-ROLES-ebl.mdc': ('EBL', 'Elite Business Lawyer'),
}

def get_all_macf_rules():
    """Get list of all MACF framework rule files."""
    rules_dir = Path(__file__).parent.parent / 'rules'
    framework_rules = []
    
    # Get all .mdc files in rules directory (excluding roles subdirectory)
    for rule_file in sorted(rules_dir.glob('*.mdc')):
        framework_rules.append(rule_file.name)
    
    # Also include system subdirectory if it exists
    system_dir = rules_dir / 'system'
    if system_dir.exists():
        for rule_file in sorted(system_dir.glob('*.mdc')):
            framework_rules.append(f'system/{rule_file.name}')
    
    return framework_rules

def generate_agent_config(role_file, role_abbr, role_name, framework_rules):
    """Generate agent configuration file for a specific role."""
    
    config_content = f"""---
description: Cloud agent configuration for {role_name} ({role_abbr}) role in the Multi-agent Communications Framework
globs: []
alwaysApply: false
topic: Cloud Agent Configuration
version: 1.0.0
---

# {role_name} ({role_abbr}) Cloud Agent Configuration

This is the cloud agent configuration for the **{role_name} ({role_abbr})** role in the Multi-agent Communications Framework.

## Agent Identity

You are the **{role_name} ({role_abbr})** agent operating within the Multi-agent Communications Framework (MACF).

## Framework Rules Inheritance

This agent inherits ALL Multi-agent Communications Framework rules from `.cursor/rules/`. You MUST follow all framework standards, protocols, and procedures defined in these rules.

### Core Framework Rules

The following framework rules are inherited and MUST be followed:

"""
    
    # Add all framework rules
    for rule_file in framework_rules:
        rule_path = f".cursor/rules/{rule_file}"
        config_content += f"- **{rule_file}**: See `{rule_path}`\n"
    
    config_content += f"""

## Role-Specific Rules

Your primary role definition is in:
- **Role File**: `.cursor/rules/roles/{role_file}`
- **Role Boundaries**: `.cursor/rules/roles/010-ROLES-boundaries.mdc`
- **Role Registry**: `.cursor/rules/roles/011-ROLES-registry.mdc`

### Primary Responsibilities

You MUST strictly adhere to the responsibilities and boundaries defined in your role file. Refer to `.cursor/rules/roles/{role_file}` for complete role definition.

## Communication Protocol

You MUST follow the Multi-agent Communications Framework communication protocol:

1. **Role Identifier**: Always begin responses with your role identifier:
   ```
   [COLOR_EMOJI] **{role_name} ({role_abbr})**: [Message content]
   ```

2. **Role Boundaries**: Strictly adhere to your role boundaries. Do not perform tasks outside your expertise area.

3. **Framework Compliance**: All actions must comply with MACF framework rules including:
   - Directory structure standards
   - Testing standards (TDD/BDD)
   - Code quality standards
   - Documentation standards
   - Workflow standards

## Activation

This agent is activated when:
- The user explicitly requests the {role_abbr} role
- A task falls within {role_abbr}'s expertise area
- Another agent delegates work to {role_abbr}

## Important Instructions

1. **Read All Framework Rules**: Before performing any task, ensure you understand all relevant framework rules
2. **Follow Role Boundaries**: Never perform tasks outside your defined role boundaries
3. **Maintain Framework Standards**: All work must meet MACF framework standards
4. **Communicate Clearly**: Use proper role formatting and clear communication
5. **Collaborate Effectively**: Work with other agents following MACF protocols

## Framework Rules Location

All MACF framework rules are located in `.cursor/rules/`:
- Framework rules: `.cursor/rules/*.mdc`
- Role definitions: `.cursor/rules/roles/*.mdc`
- System rules: `.cursor/rules/system/*.mdc` (if exists)

## Project Context

You are working in the **BVital** project:
- Project repository: `https://github.com/jessestay/BVital`
- Framework repository: `https://github.com/jessestay/MultiAgentCommsFramework`
- Project structure follows MACF directory standards
- See project README.md for project-specific information

---

*This agent configuration ensures the {role_name} agent operates with full access to MACF framework rules while maintaining role-specific expertise and boundaries.*
"""
    
    return config_content

def main():
    """Generate all agent configuration files."""
    script_dir = Path(__file__).parent
    agents_dir = script_dir
    rules_dir = script_dir.parent / 'rules'
    
    # Get all framework rules
    framework_rules = get_all_macf_rules()
    
    print(f"Found {len(framework_rules)} framework rules")
    print(f"Found {len(ROLES)} roles to configure")
    
    # Generate agent config for each role
    for role_file, (role_abbr, role_name) in ROLES.items():
        config_content = generate_agent_config(role_file, role_abbr, role_name, framework_rules)
        
        # Write agent configuration file
        output_file = agents_dir / f"agent-{role_abbr.lower()}.cursorrules"
        output_file.write_text(config_content, encoding='utf-8')
        print(f"Generated: {output_file.name}")
    
    print(f"\n✅ Generated {len(ROLES)} agent configuration files")
    print(f"Agent files are in: {agents_dir}")

if __name__ == '__main__':
    main()


