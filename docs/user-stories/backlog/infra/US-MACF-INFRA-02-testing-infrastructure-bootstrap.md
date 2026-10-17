# US-MACF-INFRA-02: Integrate Comprehensive TDD/BDD Testing Infrastructure into Bootstrap Script

As a Developer using MACF / Project Lead
I want the project bootstrap script (from US-MACF-INFRA-01) to automatically set up a functional Test-Driven Development (TDD) and Behavior-Driven Development (BDD) testing environment, initially focusing on PHP, but designed for future language extensibility.
So that I can start writing tests immediately in a new project, enforcing test-first development, ensuring high-quality code from the beginning, and having a clear structure for unit, integration, and acceptance tests.

## Business Value
Accelerates the adoption of test-first development practices, reduces boilerplate setup for testing, ensures consistency in testing approaches across MACF projects, and directly addresses the setup for unit, integration (with placeholders), and acceptance tests.

## Acceptance Criteria
1.  **AC1: Dependency on US-MACF-INFRA-01:**
    *   **Given** US-MACF-INFRA-01 is completed and the bootstrap script creates the basic project structure.
    *   **When** this user story is implemented.
    *   **Then** its functionality EXTENDS the script from US-MACF-INFRA-01.

2.  **AC2: PHP Testing Stack Setup (Initial Focus):**
    *   **Given** the bootstrap script is run and "PHP" is chosen or defaulted as the primary language.
    *   **When** the setup completes.
    *   **Then** the project MUST include:
        *   A `composer.json` file with dependencies for PHPUnit and Behat (and their typical companions like Mink, if a web context is assumed by default).
        *   A `phpunit.xml.dist` configured for `tests/php/Unit` and `tests/php/Integration` directories, and a basic `tests/php/bootstrap.php` (loading Composer autoload).
        *   A `behat.yml` configured with a default suite, a placeholder `FeatureContext.php` (e.g., in `tests/features/bootstrap/` or `.cursor/tests/features/bootstrap/`), and an example `.feature` file in `tests/features/example.feature`.
        *   The `src/` directory MUST be configured for PSR-4 autoloading in `composer.json`.
        *   The `tests/php/` directory MUST be configured for PSR-4 autoloading for test classes in `composer.json`.

3.  **AC3: Placeholder Tests (PHP):**
    *   **Given** the PHP testing stack is set up.
    *   **When** the `tests/` directory is inspected.
    *   **Then** it MUST contain:
        *   A passing example unit test (e.g., `tests/php/Unit/ExampleUnitTest.php`).
        *   A passing (or skippable) example integration test (e.g., `tests/php/Integration/ExampleIntegrationTest.php`), even if it only asserts true, to demonstrate the suite runs.
        *   A passing example Behat scenario in `tests/features/example.feature` with a corresponding step in `FeatureContext.php`.

4.  **AC4: Test Execution Scripts (PHP):**
    *   **Given** the PHP testing stack is set up.
    *   **When** `composer.json` is inspected.
    *   **Then** it MUST contain `scripts` for running unit, integration, and Behat tests (e.g., `composer test:unit`, `composer test:integration`, `composer test:behat`, `composer test`).

5.  **AC5: Code Coverage Configuration (PHP):**
    *   **Given** the PHP testing stack is set up.
    *   **When** `phpunit.xml.dist` is inspected.
    *   **Then** it MUST include basic configuration for code coverage, targeting the `src/` directory.

6.  **AC6: Extensibility for Other Languages (Design Consideration):**
    *   **Given** the script's design.
    *   **When** it's reviewed.
    *   **Then** the script's structure SHOULD allow for future addition of setup modules for other languages/stacks (e.g., Python with pytest/behave, Node.js with Jest/Cucumber.js) without major re-architecture. (Actual implementation for other languages is out of scope for this story).

## Tasks
1.  Extend bootstrap script (from US-MACF-INFRA-01) to include language/stack selection (defaulting to PHP initially).
2.  Develop PHPUnit setup module:
    *   Create template `composer.json` additions.
    *   Create template `phpunit.xml.dist`.
    *   Create template `tests/php/bootstrap.php`.
    *   Create template `ExampleUnitTest.php`.
    *   Create template `ExampleIntegrationTest.php`.
3.  Develop Behat setup module:
    *   Create template `behat.yml`.
    *   Create template `FeatureContext.php`.
    *   Create template `example.feature`.
4.  Implement autoloading configuration in `composer.json` for `src/` and `tests/php/`.
5.  Add test execution scripts to `composer.json`.
6.  Design the script for future language extensibility.
7.  Update script documentation to cover testing infrastructure setup.

## Definition of Done
1.  All ACs are met and verified.
2.  The bootstrap script successfully sets up a functional TDD/BDD environment for PHP.
3.  Placeholder unit, integration, and Behat tests are created and pass out-of-the-box.
4.  `composer.json` includes necessary testing dependencies and execution scripts.
5.  Autoloading for `src/` and test directories is correctly configured.
6.  The design considers future support for other languages. 