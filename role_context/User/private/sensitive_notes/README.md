# PRIVATE - FOR LOCAL PROCESSING ONLY

# Sensitive Notes Directory

This directory contains sensitive personal notes for the user. This information is private and must only be processed by local LLMs.

## Directory Structure

```
sensitive_notes/
  ├── personal/           # Personal reflections and thoughts
  ├── health/             # Health-related notes
  ├── relationships/      # Notes about relationships
  ├── work/               # Sensitive work-related notes
  ├── journal/            # Personal journal entries
  │   ├── YYYY/           # Organized by year
  │   │   ├── MM/         # Organized by month
  └── README.md           # This file
```

## Sensitive Note Format

Sensitive notes should be stored in markdown files with appropriate naming conventions.

For general notes:
`YYYY-MM-DD_note-title.md`

For journal entries:
`YYYY-MM-DD.md`

```markdown
# Note: [Note Title]

## Details
- **Date:** YYYY-MM-DD
- **Category:** [Personal/Health/Relationships/Work]
- **Tags:** [Relevant tags]

## Content
[Note content]

## Context
[Any relevant context for this note]

## Follow-up
- [ ] [Action item 1]
- [ ] [Action item 2]

## Related Notes
- [Link to related note 1]
- [Link to related note 2]

## Updates
- YYYY-MM-DD: [Update note]
```

## Journal Entry Format

```markdown
# Journal Entry: YYYY-MM-DD

## Mood
[Description of mood/emotional state]

## Highlights
- [Highlight 1]
- [Highlight 2]
- [Highlight 3]

## Challenges
- [Challenge 1]
- [Challenge 2]

## Reflections
[Personal reflections]

## Gratitude
- [Item 1]
- [Item 2]
- [Item 3]

## Tomorrow
- [ ] [Priority for tomorrow 1]
- [ ] [Priority for tomorrow 2]
```

## Privacy and Security

This directory contains highly sensitive personal information that must be protected:

1. **NEVER process these files with cloud-based LLMs** like Claude
2. **ONLY use local LLMs** (e.g., Ollama) to process this information
3. Ensure all files have appropriate access controls
4. Regularly audit access to these files
5. Encrypt this directory if possible

## Usage Guidelines

1. Sensitive notes should be used to capture private thoughts, reflections, and information
2. Information from these notes may inform public actions and decisions, but the source should remain private
3. The Privacy Czar can extract non-sensitive insights from these notes when appropriate
4. Regular review of these notes can help identify patterns and insights for personal growth 