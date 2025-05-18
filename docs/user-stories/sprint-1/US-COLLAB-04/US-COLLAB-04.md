# US-COLLAB-04: Enforce Explicit Use of `@file` and `@code` for Context

As an AI Team Member,
I want all roles to consistently and explicitly use `@file` and `@code` mentions when discussing specific code or referring to files in prompts to other roles or in self-correction loops,
So that context is surgically precise, reducing ambiguity and reliance on automatic context sniffing, leading to more accurate AI actions.

## Business Value
Improves the accuracy and reliability of AI communication and actions by ensuring that context is always explicitly defined. Reduces misunderstandings and errors caused by ambiguous references to code or files. Reinforces the "surgical context" principle.

## Acceptance Criteria

1.  **AC1: Mandatory Use of `@file` for File References**
    *   GIVEN any AI role is communicating about a specific file (e.g., in a task assignment, question, or log message)
    *   WHEN referring to that file
    *   THEN the role MUST use an explicit `@file` mention (e.g., "Please review the changes in `@file:src/Service/MyService.php`").

2.  **AC2: Mandatory Use of `@code` for Code Snippet References**
    *   GIVEN any AI role is discussing a specific block of code, function, or method
    *   WHEN referring to that code snippet in a message or prompt where the snippet itself is not fully quoted
    *   THEN the role MUST use an explicit `@code` mention (e.g., "The logic in `@code:processOrder()` method within `@file:src/OrderController.php` needs adjustment.").
    *   AND if quoting a small, specific snippet for discussion, it should be clearly demarcated (e.g., using markdown backticks for code).

3.  **AC3: Application in All Communication Forms**
    *   GIVEN AI roles are communicating
    *   WHEN referencing files or specific code sections
    *   THEN this explicit use of `@file` and `@code` MUST be applied in: 
        1.  Task handoffs (US-COLLAB-01).
        2.  Contextual Briefing Packages (US-CTX-01).
        3.  Teach Back summaries (US-CTX-02).
        4.  Questions to other roles.
        5.  Self-correction notes or internal monologue if it involves cross-file context.
        6.  Commit messages, where appropriate and supported.

4.  **AC4: ES Reinforcement**
    *   GIVEN an AI role communicates without using appropriate `@file` or `@code` mentions where they would add clarity
    *   WHEN ES observes this
    *   THEN ES SHOULD gently remind the role to use explicit mentions for future communications (e.g., "@SET, for clarity, please use `@file` next time you refer to `OrderController.php`.").

## Technical Notes
*   This complements Cursor's automatic context features by providing an additional layer of explicitness.
*   Helps ensure that even if automatic detection is imperfect, the intended context is clear to all roles (and the user observing).
*   Using fully qualified paths with `@file` when there might be ambiguity is good practice.

## Tasks
1.  [ ] All AI roles to make a conscious effort to use `@file` and `@code` mentions in all relevant communications.
2.  [ ] ES to monitor communications and provide gentle reminders to reinforce this habit.
3.  [ ] Review handoff templates (US-COLLAB-01) to ensure they prompt for `@file` and `@code` where appropriate.

## Definition of Done
1.  The policy for enforcing explicit `@file` and `@code` mentions is documented in this user story.
2.  AI roles consistently use `@file` and `@code` mentions in their communications when referring to files or specific code sections.
3.  ES actively reinforces this practice.
4.  Behat feature file `tests/features/sprint-1/US-COLLAB-04.feature` exists and outlines scenarios for this process. 