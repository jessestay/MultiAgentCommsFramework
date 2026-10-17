@US-MACF-M01 @rules @workflow
Feature: Contextual Briefing Package Procedure Verification
  As a development team member
  I want to ensure the Contextual Briefing Package procedure rule is correctly defined
  So that SET receives adequate context before starting significant tasks.

  Background:
    Given the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc" exists

  Scenario: Procedure defines trigger conditions
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should state that the procedure is triggered when "ES assigns a new significant development task to SET"
    And the rule content should define "significant development task" criteria

  Scenario: Procedure mandates inclusion of Task Definition
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should specify that the "Contextual Briefing Package" MUST include "Task Definition"

  Scenario: Procedure mandates inclusion of Key Related Files
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should specify that the "Contextual Briefing Package" MUST include "Key Related Files"

  Scenario: Procedure mandates inclusion of Relevant Existing Rules
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should specify that the "Contextual Briefing Package" MUST include "Relevant Existing Rules"

  Scenario: Procedure mandates inclusion of Relevant Project Documentation
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should specify that the "Contextual Briefing Package" MUST include "Relevant Project Documentation"

  Scenario: Procedure mandates inclusion of Summarized Git History
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should specify that the "Contextual Briefing Package" MUST include "Summarized Git History (Key Files)"

  Scenario: Procedure mandates inclusion of Link to Project Architecture Overview
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should specify that the "Contextual Briefing Package" MUST include "Link to Project Architecture Overview"

  Scenario: Procedure mandates inclusion of Specific Questions or Areas of Focus
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should specify that the "Contextual Briefing Package" MUST include "Specific Questions/Areas of Focus"

  Scenario: Procedure mandates inclusion of Expected Outcome/Deliverables
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should specify that the "Contextual Briefing Package" MUST include "Expected Outcome/Deliverables"

  Scenario: Procedure defines ES responsibilities for assembly and delivery
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should state that ES is responsible for "Assembles the package"
    And the rule content should state that ES is responsible for "Delivers the complete package to SET"

  Scenario: Procedure defines SET responsibilities for review and clarification
    When I read the content of the rule file ".cursor/rules/067-WORKFLOW-contextual-briefing.mdc"
    Then the rule content should state that SET is responsible for "Reviews the Contextual Briefing Package thoroughly"
    And the rule content should state that SET is responsible for "Asks clarifying questions to ES" 