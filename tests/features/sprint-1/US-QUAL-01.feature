Feature: US-QUAL-01 Enforce Mandatory Regression Test for Every Bug Fix
  As an AI Team Member,
  I want a new test written for every bug fix,
  So that regressions are prevented.

  Scenario: SET Fixes a Bug and Adds a Regression Test
    Given a reported bug: "User cannot log in with a valid email address containing a plus (+) symbol."
    And SET is tasked with fixing this bug
    When SET begins work on the bug fix
    Then SET first writes a new unit test (or integration test) that attempts to log in a user with an email like "user+alias@example.com"
    And this new test initially fails, confirming the bug
    When SET implements the code changes to allow logins with emails containing plus symbols
    Then the new regression test MUST now pass
    And this new test is added permanently to the test suite
    And the Definition of Done for the bug fix task includes "Regression test for plus symbol in email login created and passing."

  Scenario: Reviewer Verifies Regression Test for a Bug Fix
    Given SET has submitted a bug fix for "Incorrect discount calculation for orders over $100."
    And the bug fix includes a new unit test `test_discount_for_high_value_orders()`
    When ES (or another designated reviewer) reviews the bug fix
    Then the reviewer MUST verify that `test_discount_for_high_value_orders()` specifically reproduces the original discount bug conditions
    And the reviewer MUST verify that the test passes with the fix applied
    And the reviewer confirms the test has been added to the test suite. 