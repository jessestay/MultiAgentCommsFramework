# US-CTX-03: Implement Structured In-Code Annotations for AI

As an AI Team Member,
I want to adopt a convention for structured in-code annotations (special comments),
So that persistent, localized reminders, hints, or warnings are available to any AI (or human) working on the code, improving contextual understanding directly at the source.

## Business Value
Reduces the risk of breaking subtle dependencies, misusing components, or reintroducing issues that have specific contextual nuances. Acts as a durable form of micro-documentation embedded within the code.

## Acceptance Criteria

1.  **AC1: Annotation Convention Definition**
    *   GIVEN the AI team needs to embed persistent contextual hints in code
    *   WHEN defining the annotation convention
    *   THEN the following special comment prefixes MUST be adopted:
        *   `// AI_IMPORTANT_CONTEXT: [Description of context, dependency, or state reliance]`
        *   `// AI_DEPRECATION_TARGET: [Description of why it's deprecated, replacement, and target removal sprint/version]`
        *   `// AI_REFACTOR_NOTE: [Description of why the section is complex or needs caution]`
        *   `// AI_USAGE_NOTE: [Specific guidance on how to use or not use a particular piece of code]`

2.  **AC2: SET Responsibility for Annotations**
    *   GIVEN SET is implementing or modifying code
    *   WHEN SET identifies a situation requiring persistent AI-readable context (as per AC1 types)
    *   THEN SET MUST add the appropriate structured in-code annotation.

3.  **AC3: AI Role Observance of Annotations**
    *   GIVEN any AI role (ES, SET, CTW, etc.) is reviewing or interacting with code
    *   WHEN structured in-code annotations (e.g., `// AI_IMPORTANT_CONTEXT:...`) are present
    *   THEN the AI role MUST read, acknowledge, and consider the information provided in the annotation in its subsequent actions or analysis.

4.  **AC4: Annotation Review**
    *   GIVEN code changes are being reviewed (either by AI or human)
    *   WHEN reviewing the changes
    *   THEN the presence and correctness of relevant AI annotations SHOULD be part of the review process.

## Technical Notes
*   These annotations are primarily for guiding AI behavior and understanding but are also useful for human developers.
*   The list of annotation types can be expanded over time if new common scenarios are identified.
*   Over-annotation should be avoided; use them for genuinely critical or non-obvious contextual points.

## Tasks
1.  [ ] All AI roles (especially SET) to familiarize themselves with the defined annotation prefixes and their purpose.
2.  [ ] SET to begin applying these annotations in new and modified code where appropriate.
3.  [ ] All AI roles to practice observing and acting upon these annotations when encountered.
4.  [ ] Consider adding these conventions to a project coding standards document (if one exists or is created).

## Definition of Done
1.  The convention for structured in-code annotations is documented in this user story.
2.  SET actively adds these annotations to code during development where appropriate.
3.  AI roles demonstrate awareness and consideration of these annotations when they encounter them.
4.  Behat feature file `tests/features/sprint-1/US-CTX-03.feature` exists and outlines scenarios for this process. 