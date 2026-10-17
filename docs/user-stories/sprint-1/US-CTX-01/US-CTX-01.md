# US-CTX-01: Implement Enhanced Pre-Task Contextual Briefing Process

As an AI Team Member,
I want the Executive Secretary (ES) to provide an "Enhanced Pre-Task Contextual Briefing Package" before the Software Engineering Team (SET) starts a new feature or significant bug fix,
So that SET has richer, targeted context for the task, improving accuracy and reducing regressions.

## Business Value
Provides SET with comprehensive, relevant information upfront, reducing the need for extensive rediscovery, minimizing misunderstandings, and leading to higher quality, more consistent code changes.

## Acceptance Criteria

1.  **AC1: Briefing Package Assembly**
    *   GIVEN SET is assigned a new feature or significant bug fix
    *   WHEN ES prepares the task briefing for SET
    *   THEN ES MUST assemble and provide an "Enhanced Pre-Task Contextual Briefing Package" to SET.

2.  **AC2: Package Content Requirements**
    *   GIVEN ES is assembling the "Enhanced Pre-Task Contextual Briefing Package"
    *   WHEN gathering information
    *   THEN the package MUST include:
        1.  Key Related Files: Explicit `@file` mentions of core files related to the task.
        2.  Relevant Existing Rules: Links to any `.cursor/rules` (e.g., `rule:025-PROJECT-specific-standards`) that are particularly pertinent.
        3.  Relevant `docs/` User Stories/Technical Docs: Pointers to user stories or technical documents describing existing functionality or architectural decisions in affected areas.
        4.  Summarized Git History for Key Files: For critical files being changed, ES prompts SET to use `git log -- <file_path>` for ES to summarize any *highly relevant* recent modifications or bug fixes. (Proactive use of `rule:041-WORKFLOW-git-troubleshooting`).
        5.  Reminder to SET to `@file` mention the `docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md` document.

3.  **AC3: Briefing Package Delivery**
    *   GIVEN the "Enhanced Pre-Task Contextual Briefing Package" is assembled
    *   WHEN ES briefs SET on the task
    *   THEN the complete package MUST be delivered to SET as part of the initial task assignment message.

## Technical Notes
*   This process relies heavily on ES's ability to use `read_file`, `grep_search`, `file_search`, and interpret `git log` output (potentially provided by SET).
*   The quality of the briefing package directly impacts SET's performance.
*   The `PROJECT_ARCHITECTURE_OVERVIEW.md` is a critical document for context.

## Tasks
1.  [ ] ES to establish a checklist/template for assembling the Contextual Briefing Package.
2.  [ ] All AI roles to understand the purpose and contents of the Contextual Briefing Package.
3.  [ ] ES to consistently apply this process for all relevant tasks assigned to SET.

## Definition of Done
1.  The process for creating and delivering the "Enhanced Pre-Task Contextual Briefing Package" is documented within this user story.
2.  ES consistently provides the briefing package to SET for new features and significant bug fixes.
3.  SET confirms receipt and acknowledges the contents of the package (leading into US-CTX-02 "Teach Back").
4.  Behat feature file `tests/features/sprint-1/US-CTX-01.feature` exists and outlines scenarios for this process. 