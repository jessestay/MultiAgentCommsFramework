Feature: Basic Review Framework Functionality
  In order to verify the review framework is working
  As a developer
  I need to run a simple Behat test

  Scenario: Running a basic test
    Given I have a simple test step
    When I run this test
    Then it should execute properly