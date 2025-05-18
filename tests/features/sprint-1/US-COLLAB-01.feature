Feature: US-COLLAB-01 Implement Standardized Task Handoff Templates
  As an AI Team Member,
  I want to use standardized templates for task handoffs,
  So that communication is clear and consistent.

  Background: Handoff Templates Defined
    Given the AI team has defined handoff templates including:
      | Template For         | Key Information Fields                                                                  |
      | ES to SET (New Task) | Task Type, US-ID, Description, Context Package Ref, Priority, Expected Outcome        |
      | SET to CTW (Docs)    | Feature/US-ID, Files Modified, Specific items needing docs, Context Link                |
      | SET to DES (Review)  | Component Name, US-ID, Preview Link/Path, Specific focus areas                          |
      | Role to ES (Blocker) | Task US-ID, Blocker Reason, Specific Need                                               |

  Scenario: ES Delegates a New Feature Task to SET Using Template
    Given ES needs to assign US-FEAT-005 ("Implement User Login Form") to SET
    When ES prepares the handoff message to SET
    Then ES MUST use the "ES to SET (New Task)" template
    And the message includes "@SET: Please action Feature US-FEAT-005 - Implement User Login Form. Contextual Briefing Package follows. Priority: High. Expected outcome: Functional login form as per designs."

  Scenario: SET Requests Documentation from CTW Using Template
    Given SET has completed the backend logic for US-FEAT-005
    And the files `auth_controller.php` and `user_model.php` were modified
    And the new function `authenticate_user()` in `auth_controller.php` needs documentation
    When SET prepares the handoff message to CTW
    Then SET MUST use the "SET to CTW (Docs)" template
    And the message includes "@CTW: Feature US-FEAT-005 implementation phase impacting documentation is complete. Key files modified: [`auth_controller.php`, `user_model.php`]. New function `authenticate_user()` requires documentation. See US-FEAT-005 for context."

  Scenario: SET Reports a Blocker to ES Using Template
    Given SET is working on US-DB-002 ("Optimize Database Queries")
    And SET discovers they need read-only access to a production database replica which they don't have
    When SET prepares a message to ES about the blocker
    Then SET MUST use the "Role to ES (Blocker)" template
    And the message includes "@ES: Blocked on US-DB-002. Reason: Require read-only access to production DB replica for analysis. Need: Credentials or access grant for SET." 