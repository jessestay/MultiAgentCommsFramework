# User Context System

The User Context System maintains information about the user to provide personalized assistance across all roles in the Automatic Jesse system.

## Overview

The User Context System enables:

1. **Personalized Assistance**: Tailoring responses based on user preferences and needs
2. **Consistent Experience**: Maintaining context across different roles and conversations
3. **Efficient Organization**: Helping the user stay organized based on their specific needs
4. **Privacy Protection**: Ensuring sensitive information is handled appropriately
5. **Adaptive Learning**: Evolving understanding of the user over time

## Directory Structure

```
User/
  ├── public/              # Non-sensitive information (Claude accessible)
  │   ├── profile.md       # Basic profile without PII
  │   ├── preferences.md   # Work/communication preferences
  │   ├── schedule.md      # Regular schedule patterns
  │   ├── goals.md         # Professional goals
  │   ├── tasks/           # Task tracking (non-sensitive)
  │   └── projects/        # Project information (non-sensitive)
  │
  └── private/             # Sensitive information (local LLM only)
      ├── .nocloud         # Marker file to prevent cloud processing
      ├── personal_profile.md  # PII/sensitive personal details
      ├── health/          # Health-related information
      ├── private_goals/   # Personal goals
      └── sensitive_notes/ # Sensitive observations
```

## Public Information

The `public/` directory contains non-sensitive information that can be accessed by all roles and processed by cloud-based LLMs like Claude:

1. **profile.md**: Basic information about the user, including work style, communication preferences, and ADHD/autism accommodations (non-sensitive)
2. **preferences.md**: User preferences for productivity systems, tools, notifications, and information organization
3. **schedule.md**: Regular schedule patterns, energy patterns, and time block templates
4. **goals.md**: Professional goals, skill development goals, and productivity goals
5. **tasks/**: Task tracking and management (non-sensitive)
6. **projects/**: Project information and tracking (non-sensitive)

## Private Information

The `private/` directory contains sensitive information that should ONLY be processed by local LLMs (e.g., Ollama):

1. **personal_profile.md**: Personally identifiable information (PII) and detailed ADHD/autism information
2. **health/**: Health-related information, including conditions, medications, and accommodations
3. **private_goals/**: Personal goals related to health, relationships, and other sensitive areas
4. **sensitive_notes/**: Private notes, reflections, and journal entries

## Privacy Protocol

To protect user privacy:

1. **NEVER process files from the `private/` directory with cloud-based LLMs** like Claude
2. **ONLY use local LLMs** (e.g., Ollama) to process information from the `private/` directory
3. The Privacy Czar role is responsible for managing access to private information
4. All requests for private information must be routed through the Privacy Czar
5. The `.nocloud` file in the `private/` directory signals that its contents should not be processed by cloud LLMs

## Role Access

Different roles have different levels of access to user information:

1. **All Roles**: Can access information in the `public/` directory
2. **Privacy Czar**: Can access all information, including the `private/` directory
3. **Executive Secretary**: Primary role for maintaining and organizing user information
4. **Other Roles**: Access public information relevant to their specific responsibilities

## Usage Guidelines

### For Users

1. **Updating Information**: Edit the appropriate files to update your information
2. **Adding Tasks**: Add tasks to the `tasks/` directory following the established format
3. **Adding Projects**: Add projects to the `projects/` directory following the established format
4. **Private Information**: Add sensitive information to the appropriate files in the `private/` directory
5. **Regular Review**: Periodically review and update your information to keep it current

### For Roles

1. **Referencing Information**: Reference user information to provide personalized assistance
2. **Updating Information**: Update user information based on interactions and observations
3. **Privacy Protection**: Always check file paths before processing to avoid exposing private information
4. **Continuous Learning**: Use interactions to refine understanding of user needs and preferences

## Integration with Google Workspace

The User Context System can be integrated with Google Workspace tools:

1. **Google Tasks**: Synchronize with the `tasks/` directory
2. **Google Calendar**: Synchronize with the `schedule.md` file
3. **Google Keep**: Use for quick capture of information
4. **Google Docs**: Use for detailed project documentation

## Future Enhancements

Planned enhancements to the User Context System include:

1. **Automated Synchronization**: Automatic synchronization with Google Workspace
2. **Local LLM Integration**: Direct integration with Ollama for processing private information
3. **Enhanced Privacy Controls**: More granular privacy controls and access management
4. **Adaptive Learning**: Improved learning from user interactions
5. **Visualization Tools**: Visual representations of tasks, projects, and schedules 