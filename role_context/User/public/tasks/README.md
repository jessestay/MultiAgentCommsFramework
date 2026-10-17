# Tasks Directory

This directory contains task-related information for the user. Tasks are organized by status and priority.

## Directory Structure

```
tasks/
  ├── active/             # Currently active tasks
  │   ├── high/           # High priority tasks
  │   ├── medium/         # Medium priority tasks
  │   └── low/            # Low priority tasks
  ├── completed/          # Completed tasks (archived)
  │   ├── YYYY-MM/        # Organized by month completed
  ├── recurring/          # Recurring tasks and templates
  └── README.md           # This file
```

## Task Format

Each task should be stored in a separate markdown file with the following naming convention:
`YYYY-MM-DD_task-name.md`

Task files should follow this template:

```markdown
# Task: [Task Name]

## Details
- **Created:** YYYY-MM-DD
- **Due:** YYYY-MM-DD
- **Priority:** [High/Medium/Low]
- **Status:** [Not Started/In Progress/Blocked/Completed]
- **Project:** [Related project if applicable]
- **Tags:** [Relevant tags]

## Description
[Detailed description of the task]

## Subtasks
- [ ] Subtask 1
- [ ] Subtask 2
- [ ] Subtask 3

## Notes
[Any additional notes or context]

## Updates
- YYYY-MM-DD: [Update note]
```

## Usage Guidelines

1. New tasks should be added to the appropriate priority folder in `active/`
2. When a task is completed, move it to the appropriate month folder in `completed/`
3. Recurring tasks should be stored as templates in the `recurring/` folder
4. Task files should be updated regularly to reflect current status and progress

## Integration with Google Tasks

This directory can be synchronized with Google Tasks using the following approach:
1. New Google Tasks are automatically added to the appropriate folder
2. Completed tasks in Google Tasks are moved to the completed folder
3. Task updates in either system are synchronized

## Privacy Considerations

- Do not include sensitive personal information in task descriptions
- For tasks containing private information, use the private tasks directory in the private folder 