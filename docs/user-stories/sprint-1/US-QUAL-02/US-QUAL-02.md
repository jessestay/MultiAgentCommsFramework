# US-QUAL-02: Implement AI-Assisted Code Review with Specific Checklists

As an AI Team Member acting as a reviewer (e.g., ES or another AI role),
I want to use dynamic, context-specific checklists when reviewing code changes,
So that AI-driven code reviews are more targeted, consistent, and less prone to missing high-level contextual issues or adherence to specific project standards.

## Business Value
Enhances the quality and consistency of AI-driven code reviews. Helps catch issues that might be missed by purely syntactic or localized checks. Reinforces project standards and best practices during the review process.

## Acceptance Criteria

1.  **AC1: Checklist Generation Based on Change Type**
    *   GIVEN an AI role (e.g., ES) is tasked with reviewing code changes made by SET
    *   WHEN initiating the review
    *   THEN the reviewing AI role MUST generate or select a dynamic checklist of review items based on the nature of the code change (e.g., new feature, bug fix, refactor, documentation update).

2.  **AC2: Standard Checklist Items (Examples)**
    *   GIVEN a review checklist is being used
    *   WHEN performing the review
    *   THEN the checklist SHOULD include (but is not limited to) items such as:
        1.  "Does this change affect any code mentioned in `docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md`? If so, is it consistent?"
        2.  "Are there any `// AI_IMPORTANT_CONTEXT:` comments near the changed code? Have they been respected?" (Ref: US-CTX-03)
        3.  "If this is a bug fix, is there a new test proving the fix and preventing regression?" (Ref: US-QUAL-01)
        4.  "Does this change introduce new dependencies? Are they documented and justified?"
        5.  "Does the code adhere to relevant `.cursor/rules` (e.g., coding standards, security practices)?"
        6.  "Is the code clear, maintainable, and adequately commented (where necessary)?"

3.  **AC3: Review Execution Against Checklist**
    *   GIVEN a checklist has been generated/selected
    *   WHEN the AI role performs the code review
    *   THEN it MUST systematically go through each item on the checklist, verifying compliance or noting discrepancies.

4.  **AC4: Reporting Review Findings**
    *   GIVEN the review against the checklist is complete
    *   WHEN the AI role reports its findings
    *   THEN the report MUST summarize findings based on the checklist items, highlighting any areas of concern or approval.

## Technical Notes
*   The checklists are dynamic and can be expanded or tailored based on project needs and learnings.
*   The reviewing AI doesn't just look for syntax errors but for adherence to broader project principles and context.
*   This process makes AI reviews more structured and less reliant on generalized assessments.

## Tasks
1.  [ ] ES and SET to collaborate on creating initial sets of checklist templates for common change types (new feature, bug fix, refactor).
2.  [ ] AI roles performing reviews to practice using these checklists.
3.  [ ] Periodically update checklist templates based on common issues found or new standards introduced.

## Definition of Done
1.  The process for AI-Assisted Code Review with Specific Checklists is documented in this user story.
2.  Initial checklist templates for common change types are created (e.g., in a `docs/templates/review_checklists/` directory or within this US).
3.  AI roles performing reviews demonstrate the use of these checklists and report findings based on them.
4.  Behat feature file `tests/features/sprint-1/US-QUAL-02.feature` exists and outlines scenarios for this process. 