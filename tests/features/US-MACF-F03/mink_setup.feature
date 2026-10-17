@US-MACF-F03 @mink-setup
Feature: Mink Integration Setup Verification
  As a Test Automation Engineer
  I want to verify that Mink is correctly integrated with Behat
  So that I can proceed with writing UI interaction tests.

  Scenario: AC1 - Verify Mink Session Availability in Context
    Given I have a Behat context that extends MinkContext
    Then I should be able to access the Mink session

  Scenario: AC2 - Verify Basic Mink Operation (Visit Path)
    Given I have a Behat context with Mink integrated
    When I attempt to visit "/" using Mink
    Then the operation should complete without a Mink-specific PHP error
    # This test does not assert page content, only that the Mink call itself doesn't fail.
    # A web server doesn't need to be running or serving content for this specific check. 