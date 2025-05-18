# US-MACF-T01: Implement Rule-Based Execution and Live Testing for Collaborative AI Workflows

*   **As a:** Project Lead / User
*   **I want:** The AI team's collaborative workflows (like Smart Test Subsets from `US-ACCEL-01` and Parallel Work Streams from `US-ACCEL-02`) to be
    1.  Codified into explicit `.cursor/rules`.
    2.  Testable through methods that observe the AI's actual behavior and responses within the Cursor IDE.
*   **So that:** I can be confident that the AI team can autonomously and correctly execute these advanced collaborative strategies, and that the strategies improve overall efficiency and quality.

## Business Value
This story is critical for transforming designed collaborative strategies from theoretical models (validated via simulation in `FeatureContext.php`) into tangible, autonomous AI capabilities. It ensures the AI team doesn't just "know" a good process but can *actually perform it*, leading to real improvements in development speed, bug prevention, and collaboration.

## Acceptance Criteria (AC):

1.  **AC1: Rule Codification for `US-ACCEL-01` (Smart Test Subsets):**
    *   **Given** the workflow for Smart Test Subset Execution (`US-ACCEL-01`) has been defined and validated via `FeatureContext.php` simulation.
    *   **When** this user story (`US-MACF-T01`) is implemented.
    *   **Then** new or updated `.cursor/rules` (e.g., in role definitions for SET/ES, or as new procedural rules) MUST be created that instruct SET and ES to autonomously follow the Smart Test Subset proposal, evaluation, and execution logic (including adherence to the Golden Test Rule).

2.  **AC2: Rule Codification for `US-ACCEL-02` (Parallel Work Streams):**
    *   **Given** the workflow for Parallel Work Streams (`US-ACCEL-02`) has been defined and validated via `FeatureContext.php` simulation.
    *   **When** this user story (`US-MACF-T01`) is implemented.
    *   **Then** new or updated `.cursor/rules` MUST be created that instruct relevant AI roles (SET, CTW, DES, ES) to autonomously initiate and manage parallel tasks based on triggers like API definition stability or mockup availability.

3.  **AC3: Test Plan for Live AI Rule Adherence (General):**
    *   **Given** new `.cursor/rules` have been codified for a collaborative workflow (e.g., for `US-ACCEL-01` or `US-ACCEL-02`).
    *   **When** this user story (`US-MACF-T01`) is implemented.
    *   **Then** a documented test plan MUST be created outlining how to manually guide and observe the AI team's live behavior in Cursor to verify adherence to these specific rules. This plan should include:
        *   Example initial prompts for the user to provide to the AI team.
        *   Expected AI role responses and tool usage at key stages of the workflow.
        *   Observable outcomes in the workspace (file changes, command outputs if applicable).
        *   Criteria for judging successful rule adherence.

4.  **AC4: Example Live Test Execution & Documentation (for `US-ACCEL-01`):**
    *   **Given** the rules for `US-ACCEL-01` are codified (AC1) and a test plan (AC3) exists.
    *   **When** a manual guided test is performed according to the plan for `US-ACCEL-01`.
    *   **Then** the results of this guided test, including user prompts, AI responses (verbatim), tool calls, and outcomes, MUST be documented in a new file (e.g., `docs/technical/live_tests/US-ACCEL-01_live_test_log.md`).
    *   **And** this log MUST verify whether the AI team correctly followed the Smart Test Subset workflow as per the new rules.

5.  **AC5: User Prompts for Test Initiation:**
    *   **Given** the system needs to test the AI's adherence to specific codified rules for a workflow.
    *   **When** SET is developing the test plan (AC3).
    *   **Then** the test plan MUST include specific prompts the *user* would need to issue in the Cursor chat to initiate the workflow and engage the AI in a way that allows observation of the rule-based behavior.
    *   **And** these prompts should be designed to naturally lead the AI through the steps defined in the target workflow (e.g., `US-ACCEL-01`).

## Technical Notes
*   This story focuses on the *implementation of rules* and the *methodology for testing* those rules via guided observation. Full automation of live AI testing (e.g., via a test harness that drives the Cursor UI) is a more complex, future endeavor and out of scope for this specific story.
*   Rule codification will likely involve editing existing role definition files (`.cursor/rules/roles/`) or creating new higher-level procedural rules in `.cursor/rules/`.
*   The test plan (AC3) and live test log (AC4) will serve as the primary evidence for verifying the AI's capability to follow the codified workflows.

## Definition of Done:
1.  `.cursor/rules` are updated/created to reflect the logic of `US-ACCEL-01`.
2.  `.cursor/rules` are updated/created to reflect the logic of `US-ACCEL-02` (once its simulation is complete).
3.  A documented test plan for live AI rule adherence testing is created in `docs/technical/live_tests/MACF_live_test_plan.md`.
4.  At least one example live guided test (for `US-ACCEL-01`) is executed and its results documented in `docs/technical/live_tests/US-ACCEL-01_live_test_log.md`.
5.  All ACs are met and verified.

## Test Coverage Matrix
| AC ID | Test Artifact(s)                                                                 | Status  |
|-------|----------------------------------------------------------------------------------|---------|
| AC1   | Review of `.cursor/rules` for `US-ACCEL-01` logic.                               | Pending |
| AC2   | Review of `.cursor/rules` for `US-ACCEL-02` logic.                               | Pending |
| AC3   | `docs/technical/live_tests/MACF_live_test_plan.md`                               | Pending |
| AC4   | `docs/technical/live_tests/US-ACCEL-01_live_test_log.md`                         | Pending |
| AC5   | Prompts documented within `docs/technical/live_tests/MACF_live_test_plan.md`.      | Pending | 