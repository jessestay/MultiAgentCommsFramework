#!/usr/bin/env python
"""
Test Role Loading

This script tests whether the role response system rule is being properly loaded and applied.
"""

import os
import sys
import json
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def check_rule_file_exists(rule_path: str) -> bool:
    """
    Check if a rule file exists.

    Args:
        rule_path: Path to the rule file

    Returns:
        True if the file exists, False otherwise
    """
    path = Path(rule_path)
    exists = path.exists()
    logger.info(f"Rule file {rule_path}: {'EXISTS' if exists else 'DOES NOT EXIST'}")
    return exists


def check_rule_content(rule_path: str, required_content: list) -> bool:
    """
    Check if a rule file contains required content.

    Args:
        rule_path: Path to the rule file
        required_content: List of strings that should be in the file

    Returns:
        True if all required content is present, False otherwise
    """
    if not check_rule_file_exists(rule_path):
        return False
    
    try:
        with open(rule_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        missing = []
        for item in required_content:
            if item not in content:
                missing.append(item)
                logger.warning(f"Required content not found: {item}")
        
        if missing:
            logger.error(f"Rule file {rule_path} is missing required content: {missing}")
            return False
        
        logger.info(f"Rule file {rule_path} contains all required content")
        return True
    
    except Exception as e:
        logger.error(f"Error reading rule file {rule_path}: {e}")
        return False


def check_rule_frontmatter(rule_path: str) -> bool:
    """
    Check if a rule file has proper frontmatter.

    Args:
        rule_path: Path to the rule file

    Returns:
        True if the frontmatter is correct, False otherwise
    """
    if not check_rule_file_exists(rule_path):
        return False
    
    try:
        with open(rule_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check for frontmatter
        if not content.startswith('---'):
            logger.error(f"Rule file {rule_path} does not have frontmatter")
            return False
        
        # Extract frontmatter
        frontmatter_end = content.find('---', 3)
        if frontmatter_end == -1:
            logger.error(f"Rule file {rule_path} has incomplete frontmatter")
            return False
        
        frontmatter = content[3:frontmatter_end].strip()
        
        # Check required fields
        required_fields = ['description', 'alwaysApply']
        missing = []
        for field in required_fields:
            if field not in frontmatter:
                missing.append(field)
        
        if missing:
            logger.error(f"Rule file {rule_path} is missing required frontmatter fields: {missing}")
            return False
        
        # Check alwaysApply value
        if 'alwaysApply: true' not in frontmatter:
            logger.error(f"Rule file {rule_path} does not have alwaysApply set to true")
            return False
        
        logger.info(f"Rule file {rule_path} has proper frontmatter")
        return True
    
    except Exception as e:
        logger.error(f"Error checking frontmatter in rule file {rule_path}: {e}")
        return False


def test_role_response_system():
    """Test the role response system rule."""
    rule_path = '.cursor/rules/system/001-role-response-system.mdc'
    
    # Check if the file exists
    if not check_rule_file_exists(rule_path):
        logger.error("Role response system rule file does not exist")
        return False
    
    # Check frontmatter
    if not check_rule_frontmatter(rule_path):
        logger.error("Role response system rule file has incorrect frontmatter")
        return False
    
    # Check required content
    required_content = [
        "Default Role",
        "Role Continuity",
        "Multi-Role Responses",
        "Role Tracking",
        "Visual Identity",
        "Response Summary"
    ]
    
    if not check_rule_content(rule_path, required_content):
        logger.error("Role response system rule file is missing required content")
        return False
    
    logger.info("Role response system rule file is valid")
    return True


def test_rule_index():
    """Test the rule index."""
    rule_path = '.cursor/rules/system/003-rule-index.mdc'
    
    # Check if the file exists
    if not check_rule_file_exists(rule_path):
        logger.error("Rule index file does not exist")
        return False
    
    # Check frontmatter
    if not check_rule_frontmatter(rule_path):
        logger.error("Rule index file has incorrect frontmatter")
        return False
    
    # Check required content
    required_content = [
        "001-role-response-system.mdc",
        "002-agile-practices.mdc",
        "003-rule-index.mdc",
        "004-execution-requirements.mdc"
    ]
    
    if not check_rule_content(rule_path, required_content):
        logger.error("Rule index file is missing required content")
        return False
    
    logger.info("Rule index file is valid")
    return True


def test_lazy_loading_index():
    """Test the lazy loading index."""
    rule_path = '.cursor/rules/lazy-loading-index.mdc'
    
    # Check if the file exists
    if not check_rule_file_exists(rule_path):
        logger.error("Lazy loading index file does not exist")
        return False
    
    # Check required content
    required_content = [
        "system\\001-role-response-system.mdc",
        "system\\003-rule-index.mdc",
        "system\\004-execution-requirements.mdc"
    ]
    
    if not check_rule_content(rule_path, required_content):
        logger.error("Lazy loading index file is missing required content")
        return False
    
    logger.info("Lazy loading index file is valid")
    return True


def fix_role_response_system():
    """Fix the role response system rule if needed."""
    rule_path = '.cursor/rules/system/001-role-response-system.mdc'
    
    if check_rule_file_exists(rule_path) and check_frontmatter(rule_path):
        logger.info("Role response system rule file exists and has proper frontmatter")
        return True
    
    # Create the directory if it doesn't exist
    os.makedirs(os.path.dirname(rule_path), exist_ok=True)
    
    # Create the rule file with proper content
    content = """---
description: Core role response system
globs: 
alwaysApply: true
version: 1.1.0
---

# Role Response System

## Core Rules

1. **Default Role**: ALWAYS respond as the Executive Secretary (ES) when no previous role has been addressed and no role is specified in the current message.

2. **Role Continuity**: ALWAYS respond as the last role that was explicitly addressed, unless a new role is specified in the current message.

3. **Multi-Role Responses**: When a role is addressed with @ROLE, that role MUST respond in the same message.

4. **Role Tracking**: Maintain an internal state of which role was last addressed and ALWAYS use this information to determine the responding role.

5. **Visual Identity**: Always use the proper visual formatting for each role as defined in the visual identity system.

6. **Response Summary**: Every response must end with a summary by the original responding role, addressing:
   - What was accomplished in the response
   - What is needed from the user
   - Next steps in the process

## Implementation Details

- Track the last mentioned role in your internal context
- Default to ES when starting a new conversation or when no role has been previously addressed
- When @ROLE is used, immediately switch to that role's perspective
- Multiple roles can respond in the same message when addressed
- Always conclude with a clear summary for the user
- NEVER have a role respond unless they were explicitly addressed or are the last role addressed

## Role Collaboration

1. **Relevant Role Inclusion**: When a task requires expertise from multiple roles, the responding role MUST:
   - Identify which other roles should be consulted
   - Include those roles in the response using @ROLE notation
   - Synthesize a cohesive response that incorporates all relevant perspectives

2. **Product Planning Collaboration**: For product planning tasks:
   - ES coordinates and manages all product plans
   - BIC (Business Income Coach) MUST be consulted for monetization strategies
   - MD (Marketing Director) MUST be consulted for market positioning and go-to-market strategies
   - SET (Software Engineering Team) MUST be consulted for technical feasibility
   - Other roles should be consulted as appropriate for their domains

## Examples

**Example 1: Default to ES**
User: "What's the project status?"
Response: [ES responds with project status and ends with summary]

**Example 2: Role Continuity**
User: "@SET How is the implementation going?"
Response: [SET responds about implementation and ends with summary]
User: "What about the timeline?"
Response: [SET continues to respond about timeline and ends with summary]

**Example 3: Multi-Role Response**
User: "@ES Can you check with @SET about the API implementation?"
Response: [ES responds and SET responds in the same message, with ES providing final summary]

**Example 4: Product Planning**
User: "@ES Please create a product plan for our new service."
Response: [ES coordinates the plan and consults with @BIC for monetization strategy and @MD for marketing strategy]
"""
    
    try:
        with open(rule_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        logger.info(f"Created/fixed role response system rule file at {rule_path}")
        return True
    
    except Exception as e:
        logger.error(f"Error creating/fixing role response system rule file: {e}")
        return False


def fix_lazy_loading_index():
    """Fix the lazy loading index if needed."""
    rule_path = '.cursor/rules/lazy-loading-index.mdc'
    
    if check_rule_file_exists(rule_path):
        # Read the existing content
        try:
            with open(rule_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Check if the required entries are present
            required_entries = [
                "system\\001-role-response-system.mdc",
                "system\\003-rule-index.mdc",
                "system\\004-execution-requirements.mdc"
            ]
            
            missing = []
            for entry in required_entries:
                if entry not in content:
                    missing.append(entry)
            
            if not missing:
                logger.info("Lazy loading index file has all required entries")
                return True
            
            # Add the missing entries
            lines = content.split('\n')
            system_section_index = -1
            
            for i, line in enumerate(lines):
                if line.strip() == "## System Files":
                    system_section_index = i
                    break
            
            if system_section_index == -1:
                logger.error("Could not find System Files section in lazy loading index")
                return False
            
            # Add the missing entries after the System Files section
            for entry in missing:
                lines.insert(system_section_index + 1, f"- {entry}")
            
            # Write the updated content
            with open(rule_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
            
            logger.info(f"Updated lazy loading index file at {rule_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error updating lazy loading index file: {e}")
            return False
    
    # Create the file if it doesn't exist
    try:
        content = """# Lazy Loading Index

## System Files
- system\\001-role-response-system.mdc
- system\\002-agile-practices.mdc
- system\\003-rule-index.mdc
- system\\004-execution-requirements.mdc
"""
        
        with open(rule_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        logger.info(f"Created lazy loading index file at {rule_path}")
        return True
    
    except Exception as e:
        logger.error(f"Error creating lazy loading index file: {e}")
        return False


def main():
    """Main function."""
    print("Testing role response system rule loading...")
    
    # Test the role response system
    role_response_valid = test_role_response_system()
    
    # Test the rule index
    rule_index_valid = test_rule_index()
    
    # Test the lazy loading index
    lazy_loading_valid = test_lazy_loading_index()
    
    # Fix issues if needed
    if not role_response_valid:
        print("Fixing role response system rule...")
        fix_role_response_system()
    
    if not lazy_loading_valid:
        print("Fixing lazy loading index...")
        fix_lazy_loading_index()
    
    # Final status
    if role_response_valid and rule_index_valid and lazy_loading_valid:
        print("All rule files are valid!")
    else:
        print("Some rule files need attention:")
        print(f"- Role response system: {'Valid' if role_response_valid else 'Invalid'}")
        print(f"- Rule index: {'Valid' if rule_index_valid else 'Invalid'}")
        print(f"- Lazy loading index: {'Valid' if lazy_loading_valid else 'Invalid'}")


if __name__ == "__main__":
    main() 