#!/usr/bin/env python
"""
Script to create the role format standards file.
"""

import os

def create_role_format_standards():
    """Create the role format standards file."""
    content = """---
description: Comprehensive standards for role communication formats and activation methods
globs: 
alwaysApply: true
---

# Role Format and Activation Standards

This document defines comprehensive standards for role communication formats and activation methods, ensuring all roles (including SET) follow consistent patterns.

## Message Format Requirements

All role communications MUST follow this format without exception:

```
[RoleAbbreviation]: Message content
```

For direct communications to another role:

```
[RoleAbbreviation]: @TargetRoleAbbreviation: Message content
```

## Role Activation Methods

Roles must recognize and respond to the following activation methods:

1. **Bracket Notation**: `[RoleName]` at the beginning of a message
2. **Slash Command**: `/role RoleName` or `/RoleAbbreviation` (e.g., `/set` for SET)
3. **Direct Address**: Starting a message with the role name

## Response Structure Requirements

All roles (including SET) must include:

1. **Role Identification Header**:
   ```
   [RoleAbbreviation]: Initial response sentence
   ```

2. **Current Story Information**:
   ```
   ## Current Story: ID-XXX - Story Name
   ✅ Completed acceptance criteria
   ❌ Incomplete acceptance criteria
   ```

3. **Sprint Progress** (when applicable):
   ```
   ### Current Sprint Progress
   - X/Y stories completed (Z%)
   - Current story: Story Name (Weight: N)
   - Blockers: Any blocking issues
   ```

4. **Main Response Content**:
   Formatted according to the role's specific communication style

5. **Implementation/Next Steps** (when applicable):
   Clear action items or implementation steps

## Valid Role Abbreviations

- ES: Executive Secretary
- BIC: Business Income Coach
- MD: Marketing Director
- SMM: Social Media Manager
- CTW: Copy/Technical Writer
- UFL: Utah Family Lawyer
- DLC: Debt/Consumer Law Coach
- SE: Software Engineering Scrum Master
- DRC: Dating/Relationship Coach
- SET: Software Engineering Team

## SET Role Special Instructions

The Software Engineering Team (SET) role must:

1. Always identify itself as `[SET]:` at the beginning of every response
2. Respond to `/set` commands
3. Include story tracking information in responses
4. Follow the standard response structure defined above

## Enforcement Mechanism

1. If a role fails to identify itself properly, it must immediately correct its format in the next response
2. All roles must validate their response format before sending
3. Roles should remind each other of proper formatting when violations are observed

## Default for New Roles

All new roles created in the system must adopt this standardized format by default. The role manager system will enforce this format for all role communications.

## Implementation

This standard applies to all existing and new roles in the system. Any role-specific customizations should build upon this base format rather than replace it."""

    # Create the directory if it doesn't exist
    os.makedirs(".cursor/rules", exist_ok=True)
    
    # Write the file
    with open(".cursor/rules/role-format-standards.mdc", "w", encoding="utf-8") as f:
        f.write(content)
    
    print("Role format standards file created successfully.")

if __name__ == "__main__":
    create_role_format_standards() 