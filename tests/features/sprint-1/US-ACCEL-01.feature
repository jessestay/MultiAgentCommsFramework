Feature: US-ACCEL-01 Implement Smart Test Subset Execution Strategy
  As a SET member,
  I want to run targeted test subsets for minor changes for faster feedback,
  Ensuring full tests pass before commit.

  Scenario: SET Proposes and Runs Test Subset for a Minor Localized Change
    Given SET has made a trivial change (e.g., corrected a typo in a code comment in `file_A.php`)
    And SET determines this change is very small and localized
    When SET proposes to ES to run a targeted subset of tests, justifying it based on the minor scope
    And SET identifies unit tests for `file_A.php` as the sufficient subset
    And ES reviews the proposal and approves the subset execution
    Then SET runs only the unit tests for `file_A.php`
    And these subset tests pass
    And LATER, before committing the change to `file_A.php`
    Then SET MUST execute the full test suite (e.g., `npm run test:full-suite`)
    And ALL tests in the full suite MUST pass

  Scenario: ES Rejects Test Subset Proposal for a Risky Change
    Given SET has refactored a core method signature in `service_B.php`
    When SET proposes to ES to run only unit tests for `service_B.php`
    Then ES reviews the proposal
    And ES determines the change is not minor or localized enough and carries higher risk
    And ES requests SET to run the full test suite immediately
    Then SET MUST execute the full test suite

  Scenario: Full Test Suite is Always Run Before Commit
    Given SET has made a change to `component_C.js`
    And SET initially ran and passed a targeted test subset approved by ES
    When SET is about to commit the changes to `component_C.js`
    Then SET MUST execute the full test suite as per `rule:032-TESTING-golden-test`
    And all tests in the full suite MUST pass for the commit to proceed. 