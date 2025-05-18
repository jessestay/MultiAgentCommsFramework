Feature: US-COLLAB-03 Maintain Centralized "Known Issues & Workarounds" Document
  As an AI Team Member,
  I want to use and update the KNOWN_ISSUES.md document,
  So that we avoid re-diagnosing known problems.

  Background:
    Given the document `docs/technical/KNOWN_ISSUES.md` exists

  Scenario: Consulting KNOWN_ISSUES.md for a Problem
    Given SET encounters a recurring error message "PHPUnit Process Execution Failed: Buffer Too Small"
    When SET begins troubleshooting
    Then SET MUST first consult `docs/technical/KNOWN_ISSUES.md` for existing entries related to "PHPUnit" or "Buffer"

  Scenario: Documenting a New Known Issue and Workaround
    Given SET encounters a new tool bug: "Behat tests randomly fail with `WebDriverException: timeout` on Wednesdays"
    And after investigation, SET finds a workaround: "Restarting the Selenium Docker container before Wednesday test runs"
    When the workaround is confirmed by SET
    Then SET or ES MUST add a new entry to `docs/technical/KNOWN_ISSUES.md` detailing:
      | Category             | Detail                                                                    |
      | Issue                | Behat tests randomly fail with WebDriverException: timeout on Wednesdays    |
      | Symptoms             | Intermittent test failures, specifically on Wednesdays, `WebDriverException`  |
      | Affected Tools       | Behat, Selenium Docker Container                                          |
      | Workaround           | Restart Selenium Docker container before Wednesday test runs                |
      | Status               | Workaround Active                                                         |
      | Last Updated         | [Current Date]                                                            |

  Scenario: Updating an Existing Entry in KNOWN_ISSUES.md
    Given `docs/technical/KNOWN_ISSUES.md` contains an entry:
      """
      ## PHPUnit
      ### PHPUnit Process Buffer Issue
      *   Symptoms: PHPUnit Process Execution Failed: Buffer Too Small
      *   Affected Tools/Versions: PHPUnit 9.5.x on Windows with PowerShell
      *   Workaround(s): Increase PowerShell output buffer: `$ErrorView = 'NormalView'; $MaximumHistoryCount = 10000;`
      *   Status: Workaround Active
      *   Last Updated: 2023-01-15
      """
    And a new version of PHPUnit (10.0.0) is released which fixes this buffer issue
    When SET confirms the issue is resolved after upgrading to PHPUnit 10.0.0
    Then SET or ES MUST update the existing entry in `docs/technical/KNOWN_ISSUES.md` to reflect:
      | Field        | New Value                             |
      | Status       | Resolved in PHPUnit 10.0.0            |
      | Last Updated | [Current Date]                        |

  Scenario: Referencing KNOWN_ISSUES.md in Communication
    Given SET is struggling with a PHPUnit test suite hanging
    And ES recalls a similar issue was documented
    When ES communicates with SET about the issue
    Then ES SHOULD say something like: "@SET, regarding the PHPUnit hang, please check `docs/technical/KNOWN_ISSUES.md#phpunit-hang-issue-xyz` for a possible workaround we documented last month." 