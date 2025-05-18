# US-COLLAB-01: Implement Standardized Task Handoff Templates

As an AI Team Member,
I want to use brief, structured handoff message templates when delegating tasks or passing work between roles (e.g., ES to SET, SET to CTW),
So that critical information is consistently passed, reducing misunderstandings and improving the efficiency of inter-role collaboration.

## Business Value
Ensures clarity and consistency in communication between AI roles. Minimizes information loss during handoffs, leading to smoother transitions and fewer errors due to miscommunication.

## Acceptance Criteria

1.  **AC1: Template Definition for Key Handoffs**
    *   GIVEN the AI team needs to standardize task handoffs
    *   WHEN defining handoff templates
    *   THEN ES, in collaboration with other roles (SET, CTW, DES), MUST define brief, structured message templates for common handoff scenarios. Examples:
        *   **ES to SET (New Task/Bug Fix):** "@SET: Please action [Task Type: Feature/Bug US-ID/Ticket-ID] - [Brief Task Description]. Contextual Briefing Package (US-CTX-01) attached/follows. Key priority: [High/Medium/Low]. Expected outcome: [Briefly describe]."
        *   **SET to CTW (Documentation Needed):** "@CTW: Feature [Feature Name/US-ID] implementation phase impacting documentation is complete. Key files modified/added: [`file1.php`, `module/new_class.php`]. New function `get_data()` in `new_class.php` requires documentation. See [US-ID or design doc link] for context."
        *   **SET to DES (Design Review/Feedback Needed):** "@DES: UI component [Component Name] for [US-ID] is ready for your review at [preview link or screenshot path]. Please focus on [specific aspects if any]."
        *   **ANY Role to ES (Blocker/Information Request):** "@ES: Blocked on [Task US-ID]. Reason: [Brief description of blocker]. Need: [Specific information or action needed from ES or another role]."

2.  **AC2: Consistent Use of Templates**
    *   GIVEN standardized handoff templates are defined
    *   WHEN an AI role is handing off a task or information to another role
    *   THEN the sending role MUST use the appropriate structured template for their message.

3.  **AC3: Information Completeness in Templates**
    *   GIVEN a task handoff template is used
    *   WHEN populating the template
    *   THEN all placeholder fields in the template (e.g., US-ID, Key Files, Specific Need) MUST be filled with relevant and concise information.

## Technical Notes
*   Templates should be brief and focus on essential information.
*   The goal is structure and consistency, not rigid bureaucracy.
*   Templates can be stored in a shared document or rule file for easy reference and updates (e.g., `docs/templates/handoff_templates.md`).

## Tasks
1.  [ ] ES, with input from SET, CTW, DES, to draft and finalize a set of initial handoff templates for common scenarios.
2.  [ ] Store these templates in a designated accessible location (e.g., `docs/templates/handoff_templates.md`).
3.  [ ] All AI roles to familiarize themselves with and begin using these templates for inter-role communication.

## Definition of Done
1.  Standardized task handoff templates for key inter-role communication scenarios are documented.
2.  AI roles consistently use these templates when handing off tasks or requesting actions from other roles.
3.  The information provided in the templates is clear, concise, and sufficient for the receiving role to act.
4.  Behat feature file `tests/features/sprint-1/US-COLLAB-01.feature` exists and outlines scenarios for this process. 