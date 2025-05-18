Feature: US-QUAL-02 Implement AI-Assisted Code Review with Specific Checklists
  As an AI Reviewer,
  I want to use dynamic checklists for code reviews,
  So that reviews are targeted and consistent.

  Scenario: AI Reviewer Uses Checklist for a New Feature Review
    Given SET has submitted code for a new feature "User Profile Picture Upload"
    And ES is tasked with reviewing the code
    When ES initiates the review
    Then ES generates a checklist tailored for "new feature" reviews, including items like:
      | Checklist Item                                                                   |
      | Adherence to PROJECT_ARCHITECTURE_OVERVIEW.md                                    |
      | Presence and respect for AI_IMPORTANT_CONTEXT comments (US-CTX-03)               |
      | Introduction of new dependencies (documented and justified)                        |
      | Adherence to relevant .cursor/rules (coding standards, security)                 |
      | Clarity, maintainability, and comments                                           |
      | Test coverage for the new feature                                                |
    And ES systematically reviews the code against each checklist item
    And ES reports findings, referencing the checklist (e.g., "Item 2 (AI_IMPORTANT_CONTEXT): OK, Item 5 (Security Rules): Needs attention on input sanitization.")

  Scenario: AI Reviewer Uses Checklist for a Bug Fix Review
    Given SET has submitted a bug fix for "Issue #123: Incorrect calculation"
    And ES is tasked with reviewing the code for the bug fix
    When ES initiates the review
    Then ES generates a checklist tailored for "bug fix" reviews, including items like:
      | Checklist Item                                                                   |
      | Presence of a new regression test for the bug (US-QUAL-01)                       |
      | Clarity of the fix and minimal necessary changes                                   |
      | No introduction of new issues/side-effects                                       |
    And ES reviews the code and the new regression test against the checklist
    And ES reports approval or issues based on the checklist items. 