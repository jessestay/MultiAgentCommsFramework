# Projects Directory

This directory contains information about the user's projects. Projects are organized by status and category.

## Directory Structure

```
projects/
  ├── active/             # Currently active projects
  │   ├── category1/      # Projects organized by category
  │   ├── category2/
  │   └── category3/
  ├── completed/          # Completed projects (archived)
  │   ├── YYYY/           # Organized by year completed
  ├── planned/            # Future planned projects
  └── README.md           # This file
```

## Project Format

Each project should be stored in a separate markdown file with the following naming convention:
`project-name.md`

Project files should follow this template:

```markdown
# Project: [Project Name]

## Overview
- **Started:** YYYY-MM-DD
- **Target Completion:** YYYY-MM-DD
- **Status:** [Planning/Active/On Hold/Completed]
- **Priority:** [High/Medium/Low]
- **Category:** [Project category]
- **Tags:** [Relevant tags]

## Description
[Detailed description of the project]

## Goals
- [Primary goal]
- [Secondary goal]
- [Additional goals]

## Success Criteria
- [Criterion 1]
- [Criterion 2]
- [Criterion 3]

## Tasks
- [ ] [Task 1]
- [ ] [Task 2]
- [ ] [Task 3]

## Resources
- [Resource 1]
- [Resource 2]
- [Resource 3]

## Stakeholders
- [Stakeholder 1]
- [Stakeholder 2]

## Notes
[Any additional notes or context]

## Updates
- YYYY-MM-DD: [Update note]
```

## Usage Guidelines

1. New projects should be added to the appropriate category folder in `active/`
2. When a project is completed, move it to the appropriate year folder in `completed/`
3. Future projects should be stored in the `planned/` folder
4. Project files should be updated regularly to reflect current status and progress

## Integration with Task System

Projects are linked to tasks in the following ways:
1. Tasks can reference projects in their metadata
2. Project files can link to specific tasks
3. Project status can be automatically updated based on task completion

## Privacy Considerations

- Do not include sensitive personal information in project descriptions
- For projects containing private information, use the private projects directory in the private folder 