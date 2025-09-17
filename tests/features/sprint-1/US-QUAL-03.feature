Feature: US-QUAL-03 Quality Gate: User Experience and Usability
  As a User of the Framework/Tool,
  I want the framework to be intuitive and provide clear feedback,
  So that I can use it effectively and efficiently.

  Background:
    Given the framework's command-line interface (CLI) is available

  Scenario: Requesting Help Information
    When the user executes the help command (e.g., "framework --help")
    Then the CLI SHOULD display comprehensive help information
    And the help information SHOULD include available commands and options
    And the help information SHOULD be clearly formatted and easy to understand.

  Scenario: Handling Invalid Command
    When the user executes an invalid command (e.g., "framework non_existent_command")
    Then the CLI SHOULD display a clear error message
    And the error message SHOULD indicate that the command is not recognized
    And the error message SHOULD suggest trying the help command for available commands.

  Scenario: Successful Execution of a Basic Valid Command
    Given a basic valid command "framework --version" exists
    When the user executes "framework --version"
    Then the CLI SHOULD execute the command successfully
    And the CLI SHOULD display the framework's current version information
    And the output SHOULD be concise and accurate.

  Scenario: RCA for Usability Regression (Example: Help Command Broken)
    Given the "framework --help" command was previously working correctly
    And after a recent change, the "framework --help" command now shows an error or incorrect information (a usability regression)
    When ES confirms the regression with SET
    Then ES MUST initiate a brief Root Cause Analysis (RCA) with SET for the "framework --help" regression.

  Scenario: Conducting RCA for Usability Regression and Identifying Actions
    Given ES and SET are conducting an RCA for the "framework --help" regression
    When they investigate why existing tests (if any) did not catch this usability regression
    And they determine the regression was caused by a refactoring error in the command parsing module
    Then the RCA output MUST document this root cause
    And the RCA output MUST include an action item: "Fix the command parsing module and add/update tests for the help command output." 