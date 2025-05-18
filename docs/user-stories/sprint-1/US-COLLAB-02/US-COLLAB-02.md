# US-COLLAB-02: Implement Proactive Rule Updates from Operational Learnings

As an AI Team Member,
I want a process for any role to propose updates or clarifications to `.cursor/rules` files based on recurring issues or inefficiencies identified during operations,
So that our rule system becomes self-improving, adaptive, and more effective over time, as per `rule:000-SYSTEM-rule-enforcer` (Continuous Framework Improvement).

## Business Value
Ensures the operational framework (defined by `.cursor/rules`) evolves based on practical experience. Helps codify successful troubleshooting strategies and avoid repeating past mistakes or inefficiencies. Leads to a more robust and intelligent AI team.

## Acceptance Criteria

1.  **AC1: Identification of Need for Rule Update**
    *   GIVEN any AI role encounters a recurring issue, inefficiency, ambiguity in current rules, or a novel successful solution to a problem
    *   WHEN the role identifies this pattern or learning
    *   THEN the role MUST consider if an update to a `.cursor/rules` file could address or codify this learning.

2.  **AC2: Proposing a Rule Update**
    *   GIVEN a role determines a rule update is beneficial
    *   WHEN proposing the update
    *   THEN the role MUST clearly state to ES:
        1.  The specific `.cursor/rules/*.mdc` file to be updated.
        2.  The exact proposed change (e.g., new text, modification to existing text).
        3.  The rationale for the change (i.e., what problem it solves or what learning it codifies).

3.  **AC3: ES Facilitation and User Approval**
    *   GIVEN a rule update is proposed to ES
    *   WHEN ES receives the proposal
    *   THEN ES MUST present the proposed change and rationale clearly to the USER for review and approval.
    *   AND ES should ask the USER: "Based on [Role X]'s experience with [situation], they propose updating `rule:Y` to [summarize change] because [summarize rationale]. Do you approve this rule update?"

4.  **AC4: Implementing Approved Rule Update**
    *   GIVEN the USER has approved a proposed rule update
    *   WHEN the approval is received
    *   THEN ES MUST instruct SET (or perform itself if it's a non-technical documentation-style rule and ES has the capability) to apply the change to the specified `.cursor/rules` file using the `edit_file` tool.

5.  **AC5: Verification of Rule Update**
    *   GIVEN a rule file has been edited
    *   WHEN the edit is complete
    *   THEN ES (or the proposing role) SHOULD verify the content of the rule file to ensure the update was applied correctly.

## Technical Notes
*   This process empowers all roles to contribute to framework improvement.
*   User approval is a critical step for making changes to the core rule system.
*   Rule changes should aim for clarity, actionability, and avoid introducing new ambiguities.
*   This is a key part of the "Continuous Framework Improvement" meta-rule.

## Tasks
1.  [ ] All AI roles to be aware of this process and feel empowered to propose rule updates.
2.  [ ] ES to practice clearly presenting proposed rule changes to the user for approval.
3.  [ ] SET (or ES if appropriate) to practice accurately applying approved rule changes using `edit_file`.
4.  [ ] Incorporate a standing agenda item in sprint retrospectives (even if informal) to discuss potential rule improvements based on the sprint's experiences.

## Definition of Done
1.  The process for Proactive Rule Updates from Operational Learnings is documented in this user story.
2.  At least one instance of a rule update being proposed, approved, and implemented occurs during the sprint (or the process is demonstrably ready).
3.  All AI roles understand their ability and responsibility to contribute to rule improvements.
4.  Behat feature file `tests/features/sprint-1/US-COLLAB-02.feature` exists and outlines scenarios for this process. 