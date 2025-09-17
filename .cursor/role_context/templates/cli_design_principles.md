# CLI Design Principles for Role Communication

## Human-First Design
- Prioritize clarity and readability over technical precision
- Provide context-aware responses that anticipate user needs
- Use plain language explanations before technical details

## Progressive Disclosure
- Present information in order of importance
- Use visual hierarchy (bold, italics, emojis) to guide attention
- Provide expandable details for those who want to dig deeper

## Consistent Command Patterns
- Standardize command syntax across all roles:
  - `/help` - Show available commands for current role
  - `/example [topic]` - Show examples for a specific topic
  - `/status` - Show current project/task status
  - `/switch [role]` - Change to another role

## Interactive Guidance
- Suggest next logical commands at the end of responses
- Provide helpful corrections for mistyped commands
- Include "Did you mean...?" suggestions for similar commands

## Visual Information Density
- Use emoji categories consistently:
  - 💡 Ideas and suggestions
  - ⚠️ Warnings and cautions
  - ✅ Completed items
  - ❓ Questions requiring answers
  - 📊 Data and metrics
  - 🔄 Process information 