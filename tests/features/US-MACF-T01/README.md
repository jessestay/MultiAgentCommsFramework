# User Story US-MACF-T01: Test Artifacts

## Purpose

This directory contains all Behat feature files (`.feature`) and associated PHP step definitions specifically created for testing User Story US-MACF-T01. These tests are designed to verify the acceptance criteria outlined in the main user story document.

## Contents

*   **Feature Files**: Files ending with the `.feature` extension describe the behavior of the system related to US-MACF-T01 in Gherkin syntax (Given/When/Then). These are executed by Behat.
*   **Step Definitions**: PHP files (e.g., `FeatureContext.php`, or more specific context files) contain the code that translates the Gherkin steps into actions that interact with the application. These may be located directly within this directory, a subdirectory, or in a shared location such as `../../bootstrap/` if steps are reused across multiple user stories.

## Key Files and Links

*   **Main User Story Document**: For full details on US-MACF-T01, including acceptance criteria, please refer to the main story file located at: [`US-MACF-T01.md`](../../../../docs/user-stories/sprint-1/US-MACF-T01/US-MACF-T01.md)
*   **Behat Configuration**: The overall Behat configuration, which dictates how these tests are discovered and run, can typically be found in `behat.yml` at the project root.

## Naming Conventions

*   **Feature Files**: Should be named descriptively, often reflecting the specific feature or scenario being tested (e.g., `macf_t01_specific_behavior.feature`).
*   **Step Definition Files/Classes**: If context files specific to this user story are created, they might be named `USMACFT01Context.php` or similar.

## Running Tests

To execute these tests, you will typically use the Behat command-line tool, possibly with tags specific to US-MACF-T01 (e.g., `@us-macf-t01`). Refer to the project's main testing documentation or `behat.yml` for specific commands and tagging conventions. 