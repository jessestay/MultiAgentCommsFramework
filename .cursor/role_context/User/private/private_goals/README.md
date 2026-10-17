# PRIVATE - FOR LOCAL PROCESSING ONLY

# Private Goals Directory

This directory contains private goal-related information for the user. This information is sensitive and must only be processed by local LLMs.

## Directory Structure

```
private_goals/
  ├── personal/           # Personal development goals
  ├── health/             # Health-related goals
  ├── financial/          # Financial goals
  ├── relationships/      # Relationship goals
  └── README.md           # This file
```

## Private Goal Format

Private goals should be stored in markdown files with appropriate naming conventions.

```markdown
# Private Goal: [Goal Name]

## Details
- **Created:** YYYY-MM-DD
- **Target Completion:** YYYY-MM-DD
- **Category:** [Personal/Health/Financial/Relationship]
- **Priority:** [High/Medium/Low]
- **Status:** [Not Started/In Progress/On Hold/Completed]

## Description
[Detailed description of the goal]

## Motivation
[Why this goal is important]

## Success Criteria
- [Criterion 1]
- [Criterion 2]
- [Criterion 3]

## Action Steps
- [ ] [Step 1]
- [ ] [Step 2]
- [ ] [Step 3]

## Potential Obstacles
- [Obstacle 1]
  - [Strategy to overcome]
- [Obstacle 2]
  - [Strategy to overcome]

## Resources Needed
- [Resource 1]
- [Resource 2]
- [Resource 3]

## Support System
- [Person/system 1]
- [Person/system 2]

## Progress Tracking
- YYYY-MM-DD: [Progress update]
- YYYY-MM-DD: [Progress update]

## Notes
[Any additional notes or context]
```

## Privacy and Security

This directory contains sensitive personal information that must be protected:

1. **NEVER process these files with cloud-based LLMs** like Claude
2. **ONLY use local LLMs** (e.g., Ollama) to process this information
3. Ensure all files have appropriate access controls
4. Regularly audit access to these files

## Integration with Public Goals

Some private goals may have public components. In these cases:
1. Store the sensitive details in this private directory
2. Create a corresponding public goal with non-sensitive information
3. Use consistent naming to allow the Privacy Czar to link the public and private components
4. The Privacy Czar can provide appropriate summaries of private goals without revealing sensitive details 