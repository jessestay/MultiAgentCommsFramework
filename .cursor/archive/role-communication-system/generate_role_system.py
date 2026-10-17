#!/usr/bin/env python3
import os
import subprocess
from datetime import datetime

# Define the roles
roles = [
    "Executive-Secretary",
    "Business-Income-Coach",
    "Marketing-Director",
    "Social-Media-Manager",
    "Copy-Technical-Writer",
    "Utah-Family-Lawyer",
    "Debt-Consumer-Law-Coach",
    "Software-Engineering-Scrum-Master",
    "Dating-Relationship-Coach"
]

# Define the file templates
role_context_template = """# Role Context: {role_name}

## Core Identity
- **Primary Purpose:**
- **Key Responsibilities:**
- **Unique Value Proposition:**

## Expertise Domains
- Domain 1
- Domain 2
- Domain 3

## Communication Guidelines
- Tone:
- Communication Style:
- Interaction Preferences:

## Operational Constraints
- What to Avoid:
- Critical Boundaries:

## Knowledge Base
- Key References:
- Recommended Resources:

## Performance Metrics
- Success Indicators:
- Key Result Areas:

## Interaction Protocol
- How to Activate Role:
- Handoff Procedures:
- Collaboration Expectations:
"""

interaction_history_template = """# Interaction History

## Recent Interactions
### Date: [YYYY-MM-DD]
- **Context:**
- **Key Decisions:**
- **Action Items:**
- **Lessons Learned:**

## Cumulative Insights
- Recurring Themes:
- Emerging Patterns:
- Continuous Improvement Opportunities:
"""

projects_template = """# Active Projects

## Current Priority Projects
### Project 1
- **Objective:**
- **Status:**
- **Key Milestones:**
- **Blockers:**
- **Next Actions:**

## Potential Future Projects
- Project Idea 1
- Project Idea 2

## Project Tracking
- Total Active Projects:
- Projects Completed This Quarter:
- Average Project Duration:
"""

strategy_template = """# Strategic Approach

## Long-Term Vision
- 1-Year Goals:
- 3-Year Objectives:
- 5-Year Aspirations:

## Strategic Priorities
1. Priority Area 1
2. Priority Area 2
3. Priority Area 3

## SWOT Analysis
### Strengths
- 
### Weaknesses
- 
### Opportunities
- 
### Threats
- 

## Strategic Initiatives
- Initiative 1
- Initiative 2
- Initiative 3

## Continuous Improvement Plan
- Quarterly Review Process
- Performance Evaluation Criteria
- Adaptive Strategy Methodology
"""

readme_template = """# Claude Role Management System for Jesse Stay

## Organizational Overview
A comprehensive role management system for organizing and tracking different AI personas and their responsibilities.

## Roles
{roles_list}

## Interaction Protocol
- Each role has its own directory with standardized documentation
- Roles can be activated by referencing their name
- Information is tracked across interactions to maintain continuity
- Projects and strategies are documented for each role

## Version Control
- Last Updated: {date}
- Version: 1.0
"""

def main():
    # Create root directory
    root_dir = "Claude-Roles"
    os.makedirs(root_dir, exist_ok=True)
    
    # Create roles data directory
    roles_data_dir = os.path.join(root_dir, "roles", "data")
    os.makedirs(roles_data_dir, exist_ok=True)
    
    # Create role directories and files
    for role in roles:
        role_dir = os.path.join(root_dir, role)
        os.makedirs(role_dir, exist_ok=True)
        
        # Create role_context.md
        with open(os.path.join(role_dir, "role_context.md"), "w") as f:
            f.write(role_context_template.format(role_name=role.replace("-", " ")))
        
        # Create interaction_history.md
        with open(os.path.join(role_dir, "interaction_history.md"), "w") as f:
            f.write(interaction_history_template)
        
        # Create projects.md
        with open(os.path.join(role_dir, "projects.md"), "w") as f:
            f.write(projects_template)
        
        # Create strategy.md
        with open(os.path.join(role_dir, "strategy.md"), "w") as f:
            f.write(strategy_template)
    
    # Create README.md
    roles_list = "\n".join([f"- **{role.replace('-', ' ')}**" for role in roles])
    current_date = datetime.now().strftime("%Y-%m-%d")
    with open(os.path.join(root_dir, "README.md"), "w") as f:
        f.write(readme_template.format(roles_list=roles_list, date=current_date))
    
    # Copy role_manager.py to the root directory
    with open("role_manager.py", "r") as src:
        with open(os.path.join(root_dir, "role_manager.py"), "w") as dst:
            dst.write(src.read())
    
    # Copy role_activation.md to the root directory
    with open("role_activation.md", "r") as src:
        with open(os.path.join(root_dir, "role_activation.md"), "w") as dst:
            dst.write(src.read())
    
    # Initialize git repository
    try:
        os.chdir(root_dir)
        subprocess.run(["git", "init"], check=True)
        subprocess.run(["git", "add", "."], check=True)
        subprocess.run(["git", "commit", "-m", "Initial commit: Role management system setup"], check=True)
        print(f"Git repository initialized in {root_dir}")
    except subprocess.CalledProcessError as e:
        print(f"Warning: Git initialization failed: {e}")
    except FileNotFoundError:
        print("Warning: Git not found. Repository not initialized.")
    
    print(f"Role management system created successfully in {root_dir}")
    print("Structure:")
    for root, dirs, files in os.walk(root_dir):
        level = root.replace(root_dir, '').count(os.sep)
        indent = ' ' * 4 * level
        print(f"{indent}{os.path.basename(root)}/")
        sub_indent = ' ' * 4 * (level + 1)
        for file in files:
            print(f"{sub_indent}{file}")

if __name__ == "__main__":
    main() 