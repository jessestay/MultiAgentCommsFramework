Feature: US-ACCEL-02 Implement Parallel Work Streams Strategy
  As an AI Team Member,
  I want to use parallel work streams and staggered handoffs,
  So that overall feature delivery time is reduced.

  Scenario: SET Defines API, CTW Begins Docs Early
    Given SET is developing a new "User Authentication" service
    When SET defines a stable API for the service (e.g., endpoints, request/response formats)
    And SET communicates this API definition to ES and CTW
    Then CTW can begin drafting the technical documentation for the "User Authentication" API
    And this occurs before SET completes the full backend implementation of the service.

  Scenario: DES Provides Mockups, SET Scaffolds UI Early
    Given DES has completed and received approval for mockups of a "User Profile Page"
    When DES provides these mockups to SET
    Then SET can begin scaffolding the UI component structure and basic logic for the "User Profile Page"
    And DES can simultaneously work on detailed styling for a different component, like the "Site Header".

  Scenario: Role Proactively Identifies Parallel Work Opportunity
    Given CTW is drafting user guides for an upcoming feature "Notifications"
    And CTW realizes that DES will need specific icon assets for these notifications
    When CTW identifies this dependency
    Then CTW proactively communicates to ES and DES that icon design for "Notifications" can begin.

  Scenario: ES Facilitates a Short Review Slot for Early Feedback
    Given SET has an early but stable draft of a database schema for a new "Reporting Module"
    And SET needs early feedback from another SET member (or a data architect role) before proceeding further
    When SET requests ES for an early review slot
    Then ES facilitates scheduling a short, dedicated review window for the schema draft
    And this avoids waiting for the entire Reporting Module to be built before schema review. 