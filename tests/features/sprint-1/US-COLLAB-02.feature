Feature: US-COLLAB-02 Implement Proactive Rule Updates from Operational Learnings
  As an AI Team Member,
  I want to propose rule updates based on learnings,
  So that our framework continuously improves.

  Scenario: SET Identifies Need for Rule Clarification and Proposes Update
    Given SET frequently encounters ambiguity interpreting `rule:060-TOOLING-terminal-execution` regarding output redirection
    And SET devises a clearer guideline for redirection: "Always redirect STDOUT and STDERR to a log file for commands with potentially verbose output."
    When SET identifies this recurring issue and a potential clarification
    Then SET proposes an update to ES for `rule:060-TOOLING-terminal-execution` with the new guideline and rationale.

  Scenario: ES Presents Proposed Rule Update to User for Approval
    Given SET has proposed an update to `rule:060-TOOLING-terminal-execution` to ES
    When ES receives the proposal
    Then ES MUST present the proposed change (e.g., "Add guideline: 'Always redirect STDOUT and STDERR to a log file...'") and rationale to the USER
    And ES asks the USER for approval to update the rule file.

  Scenario: Approved Rule Update is Implemented by SET
    Given the USER has approved SET's proposed update to `rule:060-TOOLING-terminal-execution`
    When ES informs SET of the approval
    Then ES instructs SET to apply the approved text change to `.cursor/rules/060-TOOLING-terminal-execution.mdc` using the `edit_file` tool
    And after the edit, SET or ES verifies the file content to confirm the update.

  Scenario: Rule Update Proposal during Retrospective
    Given the AI team is holding a sprint retrospective discussion
    And CTW notes that several tasks were delayed due to unclear handoff information for documentation requirements
    When the team discusses this inefficiency
    Then CTW or ES MAY propose creating a new specific handoff template for "SET to CTW for complex feature docs" to be added to `rule:US-COLLAB-01` (Standardized Handoff Templates) or a new rule file. 