# US-CTX-02: Implement "Teach Back" Context Confirmation Process

As an AI Team Member,
I want the Software Engineering Team (SET) to "teach back" its understanding of complex tasks after receiving a briefing,
So that the Executive Secretary (ES) can catch any immediate misunderstandings before coding begins, ensuring alignment and reducing rework.

## Business Value
Provides a quick and effective check for mutual understanding of task scope, context, and potential impacts. This minimizes errors arising from misinterpretations of requirements or provided contextual information.

## Acceptance Criteria

1.  **AC1: SET Teach Back Trigger**
    *   GIVEN SET has received an "Enhanced Pre-Task Contextual Briefing Package" (from US-CTX-01) for a complex change
    *   WHEN SET is about to begin implementation
    *   THEN SET MUST briefly "teach back" its understanding to ES.

2.  **AC2: Teach Back Content**
    *   GIVEN SET is performing a "teach back"
    *   WHEN communicating its understanding
    *   THEN the teach back summary SHOULD include:
        1.  A concise restatement of the task/goal.
        2.  Mention of the key components/files SET expects to modify.
        3.  Acknowledgement of any critical contextual information received (e.g., "keeping in mind the recent refactor of Y_service.php (commit abc123) and the project's standard for error handling defined in rule:031-TESTING-code-quality").
        4.  A brief outline of potential impacts or interactions with other system parts, if apparent.

3.  **AC3: ES Review and Confirmation**
    *   GIVEN SET has provided its "teach back" summary
    *   WHEN ES reviews the summary
    *   THEN ES MUST evaluate if SET's understanding aligns with the task requirements and provided context.
    *   AND IF there is a misalignment, ES MUST provide immediate clarification.
    *   AND IF the understanding is aligned, ES MUST confirm this so SET can proceed.

## Technical Notes
*   The "teach back" should be concise and focused, not a lengthy re-explanation.
*   This process relies on clear communication between SET and ES.
*   Effective execution of US-CTX-01 (Briefing Package) is a prerequisite for a meaningful teach back.

## Tasks
1.  [ ] SET to practice formulating concise "teach back" summaries.
2.  [ ] ES to practice actively listening and providing clear feedback during the teach back.
3.  [ ] Both roles to integrate this step into their workflow for complex tasks.

## Definition of Done
1.  The process for SET performing a "teach back" and ES confirming understanding is documented.
2.  SET consistently performs a "teach back" for complex tasks after receiving the briefing package.
3.  ES actively reviews and confirms (or clarifies) SET's understanding.
4.  Behat feature file `tests/features/sprint-1/US-CTX-02.feature` exists and outlines scenarios for this process. 