Feature: US-CTX-01 Implement Enhanced Pre-Task Contextual Briefing Process
  As an AI Team Member,
  I want the ES to provide an "Enhanced Pre-Task Contextual Briefing Package"
  So that SET has richer, targeted context.

  Scenario: ES Assembles and Delivers Contextual Briefing Package
    Given SET is assigned a new complex coding task (new feature or significant bug fix)
    When ES prepares the task briefing for SET
    Then ES assembles an "Enhanced Pre-Task Contextual Briefing Package"
    And this package includes:
      | Item Description                                            | Included |
      | Key Related Files (@file mentions)                          | true     |
      | Relevant Existing Rules (.cursor/rules links)               | true     |
      | Relevant docs (User Stories/Technical Docs pointers)        | true     |
      | Summarized Git History for key files (from ES/SET)          | true     |
      | Reminder for SET to @file PROJECT_ARCHITECTURE_OVERVIEW.md  | true     |
    And ES delivers the complete "Enhanced Pre-Task Contextual Briefing Package" to SET with the task assignment

  Scenario: ES Fails to Provide a Complete Briefing Package (Illustrative Negative Test)
    Given SET is assigned a new complex coding task
    When ES prepares the task briefing for SET
    And ES assembles an "Enhanced Pre-Task Contextual Briefing Package"
    But the package is missing "Summarized Git History for key files"
    Then the briefing package is considered incomplete for US-CTX-01
    # Note: This scenario tests the definition; actual enforcement is procedural. 