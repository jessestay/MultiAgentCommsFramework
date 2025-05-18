Feature: US-ACCEL-03 Implement Prioritized Test Pyramid Strategy
  As an AI Team Member,
  I want our test suite to follow a healthy test pyramid structure,
  So that testing is efficient and effective.

  Scenario: Writing Unit Tests for Business Logic
    Given SET is implementing a new complex calculation function `calculate_discount()` in `pricing_service.php`
    When SET writes tests for this function
    Then SET MUST primarily use unit tests to cover various inputs, outputs, and edge cases of `calculate_discount()`
    And SET avoids testing this specific calculation logic through a full UI-driven Behat scenario.

  Scenario: Writing Focused Acceptance Tests for Critical Flows
    Given SET is writing Behat acceptance tests for the "user checkout" process
    When defining the Behat scenarios
    Then the scenarios MUST focus on the end-to-end critical path of a user adding an item to cart and completing a purchase
    And the scenarios SHOULD NOT attempt to test every minor validation rule of each field in the checkout form (which should be covered by unit/integration tests).

  Scenario: Reviewing Test Suite Composition
    Given the AI team is conducting a sprint retrospective
    When discussing testing practices
    Then the team SHOULD review the current balance of unit, integration, and acceptance tests
    And if the review reveals an over-reliance on slow acceptance tests for functionality that could be unit-tested, an action item is created to refactor tests towards a better pyramid balance. 