@US-MACF-P01 @MACF_Process @Rule_068
Feature: Teach Back Context Confirmation Procedure

  As a MACF Project Maintainer
  I want to ensure the "Teach Back Context Confirmation" procedure is followed
  So that shared understanding is verified and task execution is aligned with expectations.

  Background:
    Given the rule file ".cursor/rules/068-WORKFLOW-teach-back-confirmation.mdc" exists
    And I have read the content of the rule file ".cursor/rules/068-WORKFLOW-teach-back-confirmation.mdc"
    And a task is about to be assigned

  Scenario: Teach Back Triggered by Task Complexity
    Given the current task is designated as "complex"
    And the rule content should state that the procedure is triggered when "A task is explicitly designated as \"complex\" by the Assigner"
    When the task is assigned from "ES" to "SET"
    Then a "Teach Back Confirmation" from "SET" to "ES" is required by rule "068-WORKFLOW-teach-back-confirmation.mdc"

  Scenario: Teach Back Triggered by Contextual Briefing Package
    Given a "Contextual Briefing Package" has been provided for the current task
    And the rule content should state that the procedure is triggered when "A \"Contextual Briefing Package\" (as per `067-WORKFLOW-contextual-briefing.mdc`) has been provided to the Assignee for the task"
    When the task is assigned from "ES" to "SET"
    Then a "Teach Back Confirmation" from "SET" to "ES" is required by rule "068-WORKFLOW-teach-back-confirmation.mdc"

  Scenario: Teach Back Explicitly Requested
    Given the Assigner "ES" explicitly requests a "Teach Back Confirmation" for the current task
    And the rule content should state that the procedure is triggered when "The Assigner explicitly requests a \"Teach Back Confirmation\""
    When the task is assigned from "ES" to "SET"
    Then a "Teach Back Confirmation" from "SET" to "ES" is required by rule "068-WORKFLOW-teach-back-confirmation.mdc"

  Scenario: Successful Teach Back Occurs and is Acknowledged
    Given a "Teach Back Confirmation" from "SET" to "ES" is required by rule "068-WORKFLOW-teach-back-confirmation.mdc"
    And the rule content should define "Assignee Responsibilities (The \"Teach Back\")" criteria
    And the rule content should define "Assigner Responsibilities" criteria
    When "SET" provides a "Teach Back Confirmation" to "ES" including:
      | item                        | detail                                                                 |
      | Task Understanding          | "Implement feature X"                                                  |
      | Key Components/Files        | ".cursor/foo.php, .cursor/bar.module"                                  |
      | Approach Outline            | "Define interface, implement class, write unit tests"                  |
      | Potential Impacts/Risks     | "May affect performance of Y if not optimized"                         |
      | Relevant Context Confirmation | "Acknowledged rule 025-CODING-standards.mdc and PROJECT_ARCHITECTURE_OVERVIEW.md" |
    And "ES" reviews and acknowledges the "Teach Back Confirmation" from "SET" as satisfactory
    Then the "Teach Back Confirmation" procedure is considered complete for this task

  Scenario: Teach Back Provided by Assignee Proactively
    Given the Assignee "SET" feels a Teach Back is necessary for the current task
    And the rule content should state that the procedure is triggered when "The Assignee, after reviewing the task, feels a Teach Back is necessary"
    When "SET" proactively provides a "Teach Back Confirmation" to "ES" including:
      | item               | detail                        |
      | Task Understanding | "Refactor legacy module Z"    |
    And "ES" reviews and acknowledges the "Teach Back Confirmation" from "SET" as satisfactory
    Then the "Teach Back Confirmation" procedure is considered complete for this task

  Scenario: Absence of Required Teach Back (Simulated Check)
    Given the current task is designated as "complex"
    And a "Teach Back Confirmation" from "SET" to "ES" is required by rule "068-WORKFLOW-teach-back-confirmation.mdc"
    When the task is assigned from "ES" to "SET"
    And "SET" proceeds with the task without providing a "Teach Back Confirmation"
    Then a violation of rule "068-WORKFLOW-teach-back-confirmation.mdc" should be flagged for "Absence of required Teach Back"

  Scenario: Teach Back Content Missing Critical Elements (Simulated Check)
    Given a "Teach Back Confirmation" from "SET" to "ES" is required by rule "068-WORKFLOW-teach-back-confirmation.mdc"
    And the rule content should specify that the "Assignee Responsibilities (The \"Teach Back\")" MUST include "Task Understanding"
    And the rule content should specify that the "Assignee Responsibilities (The \"Teach Back\")" MUST include "Key Components/Files"
    When "SET" provides a "Teach Back Confirmation" to "ES" including: # Missing Key Components/Files
      | item                        | detail                                           |
      | Task Understanding          | "Implement feature Y"                            |
      | Approach Outline            | "Write some code"                                |
      | Relevant Context Confirmation | "Read the ticket"                                |
    Then a violation of rule "068-WORKFLOW-teach-back-confirmation.mdc" should be flagged for "Incomplete Teach Back - missing Key Components/Files" 