@US-CRS-T01
Feature: Reusable Testing Framework Structure Verification for MACF Project

  Background:
    Given I am in the "MACF Project" project context

  Scenario: Core framework directory and its README exist
    When I check for the core framework directory
    Then the directory ".cursor/tests/framework/" should exist
    When I check for the core framework README
    Then the file ".cursor/tests/framework/README.md" should exist
    And its content should indicate its purpose for the reusable testing framework

  Scenario: User story directory for US-CRS-T01 and its README exist
    When I check for the user story directory for "US-CRS-T01" in sprint "sprint-1"
    Then the directory ".cursor/docs/user-stories/sprint-1/US-CRS-T01/" should exist
    When I check for the README for user story "US-CRS-T01" in sprint "sprint-1"
    Then the file ".cursor/docs/user-stories/sprint-1/US-CRS-T01/README.md" should exist
    And its content should indicate its purpose for US-CRS-T01

  Scenario: Sprint status document exists
    When I check for the sprint status document for the "MACF Project" project
    Then the file ".cursor/docs/sprint-status.md" should exist
    And its content should reference "Sprint 1" and "US-CRS-T01"

  Scenario: Top-level documentation README exists
    When I check for the top-level docs README
    Then the file ".cursor/docs/README.md" should exist
    And its content should explain the purpose of the docs directory

  Scenario: Top-level user stories README exists
    When I check for the top-level user stories README
    Then the file ".cursor/docs/user-stories/README.md" should exist
    And its content should explain the purpose of the user stories directory

  Scenario: Sprint-1 user stories README exists
    When I check for the sprint-1 user stories README
    Then the file ".cursor/docs/user-stories/sprint-1/README.md" should exist
    And its content should explain the purpose of this sprint's user story directory

  Scenario: Top-level tests README exists
    When I check for the top-level tests README
    Then the file ".cursor/tests/README.md" should exist
    And its content should explain the purpose of the tests directory

  Scenario: Top-level features README exists
    When I check for the top-level features README
    Then the file ".cursor/tests/features/README.md" should exist
    And its content should explain the purpose of the features directory

  Scenario: US-CRS-T01 features README exists
    When I check for the US-CRS-T01 features README
    Then the file ".cursor/tests/features/US-CRS-T01/README.md" should exist
    And its content should explain the purpose of this user story's feature files directory 