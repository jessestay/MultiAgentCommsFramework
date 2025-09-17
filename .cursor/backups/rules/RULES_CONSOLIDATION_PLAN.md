# Rules Consolidation Plan

## Identified Issues

After analyzing the `.cursor/rules` directory structure and content, we've identified several issues:

1. **Redundant Role Definition/Communication Rules**:
   - `.cursor/rules/001-multiagent-framework-process.mdc`
   - `.cursor/rules/multiagent-framework-process.mdc` (duplicate of above)
   - `.cursor/rules/system/000-multi-agent-enforcement.mdc`
   - `.cursor/rules/system/000-core-system.mdc`
   - `.cursor/rules/system/001-role-response-system.mdc`
   
   All these files contain overlapping definitions of roles, communication protocols, and enforcement rules.

2. **Redundant File Location Rules**:
   - `.cursor/rules/002-project-file-locator.mdc`
   - `.cursor/rules/project-file-locator.mdc` (duplicate of above)

3. **Redundant Rule Enforcement**:
   - `.cursor/rules/000-cursor-rule-enforcer.mdc`
   - `.cursor/rules/cursor-rule-enforcer.mdc` (duplicate of above)
   - `.cursor/rules/system/000-multi-agent-enforcement.mdc` (overlapping content)

4. **System Directory Concerns**:
   - The `.cursor/rules/system/` directory contains rules that overlap with those in the main directory
   - There's no clear demarcation between what belongs in system vs. main directory
   - Some files appear to be duplicated between the two locations

## Consolidation Plan

### Phase 1: Identify and Archive Duplicates

1. Move direct duplicates to `.cursor/backups/rules/`:
   - `multiagent-framework-process.mdc` → move to backups (keep 001-multiagent-framework-process.mdc)
   - `project-file-locator.mdc` → move to backups (keep 002-project-file-locator.mdc)
   - `cursor-rule-enforcer.mdc` → move to backups (keep 000-cursor-rule-enforcer.mdc)

2. Document the backup process

### Phase 2: Consolidate Redundant System Rules

1. Multi-agent Framework Consolidation:
   - Primary file: `.cursor/rules/001-multiagent-framework-process.mdc`
   - Move `.cursor/rules/system/000-multi-agent-enforcement.mdc` to backups
   - Move `.cursor/rules/system/001-role-response-system.mdc` to backups
   - Ensure all unique content from system files is incorporated into main file

2. Update any references to moved files

### Phase 3: Clarify System Directory Purpose

1. Create a clear `.cursor/rules/system/README.md` that defines:
   - Purpose of the system directory
   - Types of rules that belong there vs. main directory
   - Guidelines for creating new system rules

2. Reorganize remaining system rules for clarity

### Phase 4: Update Documentation

1. Update `.cursor/rules/README.mdc` to:
   - Clearly document the file hierarchy
   - Explain the difference between main directory and system directory rules
   - Emphasize the mandatory use of the file index from `002-project-file-locator.mdc`
   - Document the backup and archival process

## Implementation Timeline

1. **Immediate Actions**:
   - Create `.cursor/backups/rules/` directory ✅
   - Identify direct duplicates ✅
   - Update README with file index usage requirements ✅

2. **Next Steps**:
   - Archive duplicated files
   - Consolidate redundant multi-agent framework rules
   - Create system directory README

3. **Final Stage**:
   - Comprehensive review of all rules
   - Final documentation updates
   - Testing of rule effectiveness

## Long-term Rule Management

1. **Rule Creation Guidelines**:
   - All new rules must follow numbering system
   - Rules must be placed in appropriate directory (main vs. system)
   - No duplication of existing rule content

2. **Rule Review Process**:
   - Periodic review of all rules for redundancy
   - Update file index with any new important files
   - Archive obsolete rules properly 