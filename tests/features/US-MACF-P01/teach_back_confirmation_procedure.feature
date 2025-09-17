@US-MACF-P01 @workflow @rules
Feature: Teach Back Context Confirmation Procedure
  As a MACF Project Maintainer
  I want to ensure the Teach Back Context Confirmation procedure is testable
  So that we can verify its application within the MACF.

  Background:
    Given the rule "068-WORKFLOW-teach-back-confirmation.mdc" is active
    And the internal state variable "current_task_complexity" is set to "low"
    And the internal state variable "enhanced_briefing_provided" is set to "false"
    And the internal state variable "assignee_perceives_ambiguity" is set to "false"
    And the internal state variable "teach_back_performed" is set to "false"
    And the internal state variable "teach_back_summary_received" is set to "false"

  Scenario: AC2.1 - Rule is not triggered for a simple, non-briefed, clear task
    Given the internal state variable "current_task_complexity" is set to "low"
    And the internal state variable "enhanced_briefing_provided" is set to "false"
    And the internal state variable "assignee_perceives_ambiguity" is set to "false"
    When a task is assigned to a role
    Then the teach back procedure should not be required
    And no teach back summary should be received by the delegating role

  Scenario: AC2.2 - Rule is triggered for a complex task
    Given the internal state variable "current_task_complexity" is set to "high"
    When a task is assigned to a role
    Then the teach back procedure should be required
    # Simulate the teach back occurring
    Given the teach back summary is "Task: Complex task. Key Files: A, B. Impact: High."
    When the receiving role performs a teach back
    Then a teach back summary should be received by the delegating role
    And the received teach back summary should contain "Task: Complex task"

  Scenario: AC2.3 - Rule is triggered if an enhanced briefing was provided
    Given the internal state variable "enhanced_briefing_provided" is set to "true"
    When a task is assigned to a role
    Then the teach back procedure should be required
    Given the teach back summary is "Task: Briefed task. Key Files: C. Impact: Med. Context: Briefing X understood."
    When the receiving role performs a teach back
    Then a teach back summary should be received by the delegating role
    And the received teach back summary should contain "Context: Briefing X understood"

  Scenario: AC2.4 - Rule is triggered if assignee perceives ambiguity
    Given the internal state variable "assignee_perceives_ambiguity" is set to "true"
    When a task is assigned to a role
    Then the teach back procedure should be required
    Given the teach back summary is "Task: Ambiguous task. Need clarification on Y."
    When the receiving role performs a teach back
    Then a teach back summary should be received by the delegating role
    And the received teach back summary should contain "Need clarification on Y"

  Scenario: AC2.5 - Absence of teach back for a complex task is (hypothetically) flagged
    Given the internal state variable "current_task_complexity" is set to "high"
    And the internal state variable "teach_back_performed" is set to "false"
    When a task is assigned to a role
    Then the teach back procedure should be required
    And an error or warning should be logged indicating a teach back was expected but not performed
    # This step implies logic in the rule or context that can detect this absence.
    # For testing, we might just check if a flag is set or a log message exists. 