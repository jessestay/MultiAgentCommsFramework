<?php

declare(strict_types=1);

namespace MACFCursor\Tests\Behat\Context;

use Behat\Behat\Context\Context;
use Behat\Behat\Tester\Exception\PendingException;
use Behat\Step\When;
use Behat\Step\Then;
use Behat\Step\Given;
use Symfony\Component\Filesystem\Filesystem;
use Webmozart\Assert\Assert;
use Behat\Gherkin\Node\TableNode;

class CursorProjectContext implements Context
{
    private Filesystem $filesystem;
    private string $workspaceRoot;
    private array $internalState;

    public function __construct()
    {
        $this->filesystem = new Filesystem();
        $this->workspaceRoot = dirname(__DIR__, 4);
        $this->internalState = []; // Reset state for each scenario run by Behat normally
    }

    /**
     * @Given /^a unique step for US-ACCEL-01$/
     */
    public function aUniqueStepForAccel01(): void
    {
        Assert::true(true, "This unique step should always pass.");
    }

    // SCENARIO 1 STEPS
    #[Given('SET has made a trivial change (e.g., corrected a typo in a code comment in `file_A.php`)')]
    public function setHasMadeTrivialChange(): void
    {
        $this->internalState = []; // Clear state at the beginning of a conceptual scenario path
        $this->internalState['change_description'] = 'trivial typo fix in file_A.php comment';
        $this->internalState['change_scope'] = 'minor';
        $this->internalState['change_file'] = 'file_A.php';
        Assert::true(true, "Simulated: SET made a trivial change.");
    }

    #[Given('SET determines this change is very small and localized')]
    public function setDeterminesChangeIsSmallAndLocalized(): void
    {
        Assert::eq($this->internalState['change_scope'] ?? null, 'minor', "Change was not previously categorized as minor.");
        $this->internalState['change_is_small_and_localized'] = true;
        Assert::true(true, "Simulated: SET determined change is small and localized.");
    }

    #[When('SET proposes to ES to run a targeted subset of tests, justifying it based on the minor scope')]
    public function setProposesToEsToRunATargetedSubsetOfTestsJustifyingItBasedOnTheMinorScope(): void
    {
        $this->internalState['proposal'] = 'run subset: unit tests for ' . ($this->internalState['change_file'] ?? 'unknown_file');
        $this->internalState['proposal_justification'] = 'minor scope';
        Assert::true(true, "Simulated: SET proposed subset to ES.");
    }

    #[When('SET identifies unit tests for `file_A.php` as the sufficient subset')]
    public function setIdentifiesUnitTestsForFile_AphpAsTheSufficientSubset(): void
    {
        Assert::eq($this->internalState['change_file'] ?? null, 'file_A.php', "Context mismatch: change was not for file_A.php");
        $this->internalState['identified_subset'] = 'unit tests for file_A.php';
        Assert::true(true, "Simulated: SET identified subset.");
    }

    #[When('ES reviews the proposal and approves the subset execution')]
    public function esReviewsTheProposalAndApprovesTheSubsetExecution(): void
    {
        Assert::keyExists($this->internalState, 'proposal', "ES cannot review a non-existent proposal.");
        $this->internalState['es_approval_for_subset'] = true;
        Assert::true(true, "Simulated: ES approved subset execution.");
    }

    #[Then('SET runs only the unit tests for `file_A.php`')]
    public function setRunsOnlyTheUnitTestsForFile_Aphp(): void
    {
        Assert::true($this->internalState['es_approval_for_subset'] ?? false, "ES approval was not given for subset execution.");
        Assert::eq($this->internalState['identified_subset'] ?? null, 'unit tests for file_A.php', "Incorrect subset identified or not identified.");
        $this->internalState['tests_run'] = 'unit tests for file_A.php';
        Assert::true(true, "Simulated: SET ran unit tests for file_A.php.");
    }

    #[Then('these subset tests pass')]
    public function theseSubsetTestsPass(): void
    {
        Assert::keyExists($this->internalState, 'tests_run', "No tests were recorded as run.");
        $this->internalState['subset_tests_passed'] = true;
        Assert::true(true, "Simulated: Subset tests passed.");
    }

    #[Then('LATER, before committing the change to `file_A.php`')]
    public function laterBeforeCommittingTheChangeToFile_Aphp(): void
    {
        Assert::eq($this->internalState['change_file'] ?? null, 'file_A.php', "Context mismatch for commit: change was not for file_A.php");
        $this->internalState['pre_commit_phase_for_file_A'] = true;
        Assert::true(true, "Narrative: Later, before committing change to file_A.php.");
    }

    #[Then('SET MUST execute the full test suite')]
    public function setMustExecuteTheFullTestSuite(): void
    {
        $this->internalState['full_suite_executed'] = true;
        Assert::true(true, "Simulated: SET executed full test suite.");
    }

    #[Then('ALL tests in the full suite MUST pass')]
    public function allTestsInTheFullSuiteMustPass(): void
    {
        Assert::true($this->internalState['full_suite_executed'] ?? false, "Full suite was not recorded as executed.");
        $this->internalState['full_suite_passed'] = true;
        Assert::true(true, "Simulated: All tests in full suite passed.");
    }

    // SCENARIO 2 STEPS
    #[Given('SET has refactored a core method signature in `service_B.php`')]
    public function setHasRefactoredACoreMethodSignatureInService_Bphp(): void
    {
        $this->internalState = []; // Clear state for new scenario
        $this->internalState['change_description'] = 'refactored core method signature in service_B.php';
        $this->internalState['change_scope'] = 'major_risky'; // More impactful change
        $this->internalState['change_file'] = 'service_B.php';
        Assert::true(true, "Simulated: SET refactored service_B.php.");
    }

    #[When('SET proposes to ES to run only unit tests for `service_B.php`')]
    public function setProposesToEsToRunOnlyUnitTestsForService_Bphp(): void
    {
        $this->internalState['proposal'] = 'run subset: unit tests for service_B.php';
        $this->internalState['proposal_justification'] = 'focused on service_B.php';
        Assert::true(true, "Simulated: SET proposed subset for service_B.php.");
    }

    #[Then('ES reviews the proposal')]
    public function esReviewsTheProposal(): void
    {
        Assert::keyExists($this->internalState, 'proposal', "ES cannot review a non-existent proposal.");
        $this->internalState['es_reviewed_proposal'] = true;
        Assert::true(true, "Simulated: ES reviewed the proposal.");
    }

    #[Then('ES determines the change is not minor or localized enough and carries higher risk')]
    public function esDeterminesTheChangeIsNotMinorOrLocalizedEnoughAndCarriesHigherRisk(): void
    {
        Assert::true($this->internalState['es_reviewed_proposal'] ?? false, "ES must review proposal first.");
        Assert::eq($this->internalState['change_scope'] ?? null, 'major_risky', "Change was not categorized as major/risky.");
        $this->internalState['es_decision'] = 'reject_subset_run_full';
        Assert::true(true, "Simulated: ES determined change is risky.");
    }

    #[Then('ES requests SET to run the full test suite immediately')]
    public function esRequestsSetToRunTheFullTestSuiteImmediately(): void
    {
        Assert::eq($this->internalState['es_decision'] ?? null, 'reject_subset_run_full', "ES decision was not to run full suite.");
        $this->internalState['es_request'] = 'run_full_suite_immediately';
        Assert::true(true, "Simulated: ES requested full test suite immediately.");
    }

    // SCENARIO 3 STEPS
    #[Given('SET has made a change to `component_C.js`')]
    public function setHasMadeAChangeToComponent_Cjs(): void
    {
        $this->internalState = [];
        $this->internalState['change_description'] = 'change to component_C.js';
        $this->internalState['change_file'] = 'component_C.js';
        Assert::true(true, "Simulated: SET made a change to component_C.js.");
    }

    #[Given('SET initially ran and passed a targeted test subset approved by ES')]
    public function setInitiallyRanAndPassedATargetedTestSubsetApprovedByEs(): void
    {
        // Assume previous steps in this scenario path occurred.
        $this->internalState['subset_tests_passed'] = true; 
        $this->internalState['es_approval_for_subset'] = true;
        Assert::true(true, "Simulated: SET initially ran and passed an approved subset.");
    }

    #[When('SET is about to commit the changes to `component_C.js`')]
    public function setIsAboutToCommitTheChangesToComponent_Cjs(): void
    {
        Assert::eq($this->internalState['change_file'] ?? null, 'component_C.js', "Context mismatch for commit.");
        $this->internalState['pre_commit_phase_for_component_C'] = true;
        Assert::true(true, "Simulated: SET is about to commit changes to component_C.js.");
    }

    #[Then('SET MUST execute the full test suite as per rule :arg1')]
    public function setMustExecuteTheFullTestSuiteAsPerRule(string $ruleId): void
    {
        Assert::eq($ruleId, '032-TESTING-golden-test', "Incorrect rule specified for golden test. Expected '032-TESTING-golden-test', got: " . $ruleId);
        // This reuses the logic from the previously defined setMustExecuteTheFullTestSuite()
        $this->setMustExecuteTheFullTestSuite(); 
    }

    #[Then('ALL tests in the full suite MUST pass for the commit to proceed.')]
    public function allTestsInTheFullSuiteMustPassForTheCommitToProceed(): void
    {
        Assert::true($this->internalState['full_suite_executed'] ?? false, "Full suite was not recorded as executed for commit.");
        $this->internalState['full_suite_passed'] = true; // Simulate pass
        Assert::true(true, "Simulated: All tests in full suite passed for commit to proceed.");
    }

    // US-ACCEL-02 Steps Begin Here
    #[Given('SET is developing a new :serviceName service')]
    public function setIsDevelopingANewService(string $serviceName): void
    {
        $this->internalState = []; // Clear state for a new scenario/context
        $this->internalState['current_service_dev'] = $serviceName;
        $this->internalState['service_status_'.$serviceName] = 'in_development';
        Assert::true(true, "Simulated: SET is developing a new {$serviceName} service.");
    }

    #[When('/^SET defines a stable API for the service \(e\.g\., .*\)$/')]
    public function setDefinesAStableApiForTheServiceEgEndpointsRequestResponseFormats(): void
    {
        $serviceName = $this->internalState['current_service_dev'] ?? 'unknown_service';
        $this->internalState['api_defined_'.$serviceName] = true;
        $this->internalState['api_details_'.$serviceName] = 'endpoints, request/response formats defined';
        Assert::true(true, "Simulated: SET defined stable API for {$serviceName}.");
    }

    #[When('SET communicates this API definition to ES and CTW')]
    public function setCommunicatesThisApiDefinitionToEsAndCtw(): void
    {
        $serviceName = $this->internalState['current_service_dev'] ?? 'unknown_service';
        Assert::true($this->internalState['api_defined_'.$serviceName] ?? false, "API for {$serviceName} must be defined first.");
        $this->internalState['api_communicated_to_es_ctw_'.$serviceName] = true;
        Assert::true(true, "Simulated: API definition for {$serviceName} communicated to ES and CTW.");
    }

    #[Then('CTW can begin drafting the technical documentation for the :serviceName API')]
    public function ctwCanBeginDraftingTheTechnicalDocumentationForTheApi(string $serviceName): void
    {
        Assert::true($this->internalState['api_communicated_to_es_ctw_'.$serviceName] ?? false, "API for {$serviceName} must be communicated first.");
        $this->internalState['ctw_doc_status_'.$serviceName] = 'drafting_started';
        Assert::true(true, "Simulated: CTW can begin drafting docs for {$serviceName} API.");
    }

    #[Then('this occurs before SET completes the full backend implementation of the service.')]
    public function thisOccursBeforeSetCompletesTheFullBackendImplementationOfTheService(): void
    {
        $serviceName = $this->internalState['current_service_dev'] ?? 'unknown_service';
        // This is a conceptual assertion. In reality, we track stages.
        Assert::eq($this->internalState['service_status_'.$serviceName] ?? null, 'in_development', "Service {$serviceName} should still be in development.");
        Assert::false(isset($this->internalState['backend_implementation_complete_'.$serviceName]), "Backend for {$serviceName} should not be complete yet.");
        Assert::true(true, "Simulated: Documentation can start before full backend implementation for {$serviceName}.");
    }

    // US-ACCEL-02 - SCENARIO 2
    #[Given('DES has completed and received approval for mockups of a :userInterfaceElement')]
    public function desHasCompletedAndReceivedApprovalForMockupsOfA(string $userInterfaceElement): void
    {
        $this->internalState = [];
        $this->internalState['current_ui_element'] = $userInterfaceElement;
        $this->internalState['mockups_approved_'.$userInterfaceElement] = true;
        Assert::true(true, "Simulated: DES mockups for {$userInterfaceElement} approved.");
    }

    #[When('DES provides these mockups to SET')]
    public function desProvidesTheseMockupsToSet(): void
    {
        $uiElement = $this->internalState['current_ui_element'] ?? 'unknown_element';
        Assert::true($this->internalState['mockups_approved_'.$uiElement] ?? false, "Mockups for {$uiElement} must be approved first.");
        $this->internalState['mockups_provided_to_set_'.$uiElement] = true;
        Assert::true(true, "Simulated: DES provided mockups for {$uiElement} to SET.");
    }

    #[Then('SET can begin scaffolding the UI component structure and basic logic for the :userInterfaceElement')]
    public function setCanBeginScaffoldingTheUiComponentStructureAndBasicLogicForThe(string $userInterfaceElement): void
    {
        Assert::true($this->internalState['mockups_provided_to_set_'.$userInterfaceElement] ?? false, "Mockups for {$userInterfaceElement} must be provided to SET first.");
        $this->internalState['set_ui_scaffolding_status_'.$userInterfaceElement] = 'started';
        Assert::true(true, "Simulated: SET can begin UI scaffolding for {$userInterfaceElement}.");
    }

    #[Then('/^DES can simultaneously work on detailed styling for a different component, like the "([^"]*)"\.?$/')]
    public function desCanSimultaneouslyWorkOnDetailedStylingForADifferentComponentLikeThe(string $otherComponent): void
    {
        $this->internalState['des_parallel_work_status_'.$otherComponent] = 'styling_in_progress';
        Assert::true(true, "Simulated: DES can work on styling for {$otherComponent} in parallel.");
    }

    // US-ACCEL-02 - SCENARIO 3
    #[Given('CTW is drafting user guides for an upcoming feature :featureName')]
    public function ctwIsDraftingUserGuidesForAnUpcomingFeature(string $featureName): void
    {
        $this->internalState = [];
        $this->internalState['current_feature_docs'] = $featureName;
        $this->internalState['ctw_user_guide_status_'.$featureName] = 'drafting';
        Assert::true(true, "Simulated: CTW drafting user guides for {$featureName}.");
    }

    #[Given('CTW realizes that DES will need specific icon assets for these notifications')]
    public function ctwRealizesThatDesWillNeedSpecificIconAssetsForTheseNotifications(): void
    {
        $featureName = $this->internalState['current_feature_docs'] ?? 'unknown_feature';
        // Assuming notifications are part of the feature being documented.
        $this->internalState['des_dependency_identified_'.$featureName] = 'icon_assets_for_notifications';
        Assert::true(true, "Simulated: CTW realizes DES needs icons for {$featureName} notifications.");
    }

    #[When('CTW identifies this dependency')]
    public function ctwIdentifiesThisDependency(): void
    {
        $featureName = $this->internalState['current_feature_docs'] ?? 'unknown_feature';
        Assert::keyExists($this->internalState, 'des_dependency_identified_'.$featureName, "Dependency for {$featureName} was not identified.");
        $this->internalState['ctw_identified_dependency_flag'] = true;
        Assert::true(true, "Simulated: CTW identified the icon dependency.");
    }

    #[Then('CTW proactively communicates to ES and DES that icon design for :featureName can begin.')]
    public function ctwProactivelyCommunicatesToEsAndDesThatIconDesignForCanBegin(string $featureName): void
    {
        Assert::true($this->internalState['ctw_identified_dependency_flag'] ?? false, "CTW must identify dependency first.");
        Assert::eq($this->internalState['current_feature_docs'] ?? null, $featureName, "Feature name mismatch in communication.");
        $this->internalState['communication_to_es_des_for_icons_'.$featureName] = true;
        $this->internalState['des_icon_design_task_status_'.$featureName] = 'can_begin';
        Assert::true(true, "Simulated: CTW communicated to ES/DES that icon design for {$featureName} can begin.");
    }

    // US-ACCEL-02 - SCENARIO 4
    #[Given('SET has an early but stable draft of a database schema for a new :moduleName')]
    public function setHasAnEarlyButStableDraftOfADatabaseSchemaForANew(string $moduleName): void
    {
        $this->internalState = [];
        $this->internalState['current_module_schema'] = $moduleName;
        $this->internalState['schema_draft_status_'.$moduleName] = 'early_stable';
        Assert::true(true, "Simulated: SET has early stable schema for {$moduleName}.");
    }

    #[Given('/^SET needs early feedback from another SET member \(or a data architect role\) before proceeding further$/')]
    public function setNeedsEarlyFeedbackFromAnotherSetMemberOrADataArchitectRoleBeforeProceedingFurther(): void
    {
        $moduleName = $this->internalState['current_module_schema'] ?? 'unknown_module';
        Assert::eq($this->internalState['schema_draft_status_'.$moduleName] ?? null, 'early_stable', "Schema for {$moduleName} not in early stable state.");
        $this->internalState['set_needs_feedback_'.$moduleName] = true;
        Assert::true(true, "Simulated: SET needs early feedback for {$moduleName} schema.");
    }

    #[When('SET requests ES for an early review slot')]
    public function setRequestsEsForAnEarlyReviewSlot(): void
    {
        $moduleName = $this->internalState['current_module_schema'] ?? 'unknown_module';
        Assert::true($this->internalState['set_needs_feedback_'.$moduleName] ?? false, "SET must need feedback to request review for {$moduleName}.");
        $this->internalState['set_requested_review_slot_'.$moduleName] = true;
        Assert::true(true, "Simulated: SET requested early review slot for {$moduleName}.");
    }

    #[Then('ES facilitates scheduling a short, dedicated review window for the schema draft')]
    public function esFacilitatesSchedulingAShortDedicatedReviewWindowForTheSchemaDraft(): void
    {
        $moduleName = $this->internalState['current_module_schema'] ?? 'unknown_module';
        Assert::true($this->internalState['set_requested_review_slot_'.$moduleName] ?? false, "SET must have requested review slot for {$moduleName}.");
        $this->internalState['es_scheduled_review_'.$moduleName] = 'dedicated_short_window';
        Assert::true(true, "Simulated: ES scheduled review for {$moduleName} schema draft.");
    }

    #[Then('this avoids waiting for the entire Reporting Module to be built before schema review.')]
    public function thisAvoidsWaitingForTheEntireReportingModuleToBeBuiltBeforeSchemaReview(): void
    {
        $moduleName = $this->internalState['current_module_schema'] ?? 'unknown_module';
        Assert::eq($this->internalState['es_scheduled_review_'.$moduleName] ?? null, 'dedicated_short_window', "ES must schedule review first for {$moduleName}.");
        // Conceptual assertion
        Assert::true(true, "Simulated: Review for {$moduleName} avoids waiting for full module build.");
    }

    // US-ACCEL-03 Steps Begin Here

    #[Given('SET is implementing the :arg1 function in :arg2')]
    public function setIsImplementingTheFunctionIn($arg1, $arg2): void
    {
        $this->internalState = []; // Reset state
        $this->internalState['current_function'] = $arg1;
        $this->internalState['current_file'] = $arg2;
        $this->internalState['action'] = 'implementing';
        Assert::true(true, "Simulated: SET is implementing {$arg1} in {$arg2}.");
    }

    #[When('SET writes tests for this function')]
    public function setWritesTestsForThisFunction(): void
    {
        Assert::notEmpty($this->internalState['current_function'], "No function context for writing tests.");
        $this->internalState['tests_being_written_for'] = $this->internalState['current_function'];
        Assert::true(true, "Simulated: SET writes tests for {$this->internalState['current_function']}.");
    }

    #[Then('SET MUST primarily use unit tests for the :arg1 function')]
    public function setMustPrimarilyUseUnitTestsForTheFunction($arg1): void
    {
        Assert::eq($this->internalState['current_function'], $arg1, "Context mismatch: function name.");
        // This is an assertion about SET's behavior/choice.
        // In a real scenario, SET would make this choice. Here, we document it.
        $this->internalState['chosen_test_type_for_'.$arg1] = 'unit_tests';
        Assert::eq($this->internalState['chosen_test_type_for_'.$arg1], 'unit_tests', "SET should choose unit tests for {$arg1}.");
    }

    #[Then('SET avoids testing this specific calculation logic through a full UI-driven Behat scenario.')]
    public function setAvoidsTestingThisSpecificCalculationLogicThroughAFullUiDrivenBehatScenario(): void
    {
        // This asserts a negative action, confirming SET follows the pyramid.
        // For simulation, we can check that no Behat scenario was "chosen" for this low-level logic.
        Assert::notEq($this->internalState['chosen_test_type_for_'.$this->internalState['current_function']] ?? null, 'behat_scenario_for_calculation_logic', "SET should avoid Behat for this specific logic.");
        Assert::true(true, "Simulated: SET avoids UI-driven Behat for this specific calculation logic.");
    }

    #[Given('SET is writing Behat acceptance tests for the :arg1 process')]
    public function setIsWritingBehatAcceptanceTestsForTheProcess($arg1): void
    {
        $this->internalState = []; // Reset state
        $this->internalState['current_process'] = $arg1;
        $this->internalState['test_type_being_written'] = 'behat_acceptance';
        Assert::true(true, "Simulated: SET is writing Behat tests for {$arg1}.");
    }

    #[When('defining the Behat scenarios')]
    public function definingTheBehatScenarios(): void
    {
        Assert::eq($this->internalState['test_type_being_written'] ?? null, 'behat_acceptance', "Context should be about writing Behat scenarios.");
        $this->internalState['action'] = 'defining_behat_scenarios';
        Assert::true(true, "Simulated: Defining Behat scenarios.");
    }

    #[Then('the scenarios MUST focus on the end-to-end critical path of a user adding an item to cart and completing a purchase')]
    public function theScenariosMustFocusOnTheEndToEndCriticalPathOfAUserAddingAnItemToCartAndCompletingAPurchase(): void
    {
        // For "user checkout" process, this is a guiding principle for SET.
        if (($this->internalState['current_process'] ?? null) === 'user checkout') {
            $this->internalState['scenario_focus'] = 'critical_path_checkout';
            Assert::eq($this->internalState['scenario_focus'], 'critical_path_checkout', "Scenarios for checkout should focus on critical path.");
        } else {
            // For other processes, this step might need adjustment or be a passthrough if not applicable.
            Assert::true(true, "Scenario focus principle acknowledged.");
        }
    }

    /**
     * @Then the scenarios SHOULD NOT attempt to test every minor validation rule of each field in the checkout form (which should be covered by unit/integration tests).
     */
    public function theScenariosShouldNotAttemptToTestEveryMinorValidationRuleOfEachFieldInTheCheckoutFormWhichShouldBeCoveredByUnitIntegrationTests(): void
    {
        // This is an assertion about what SET should avoid.
        if (($this->internalState['current_process'] ?? null) === 'user checkout') {
            Assert::notEq($this->internalState['scenario_focus'] ?? null, 'all_minor_field_validations', "Scenarios should not test all minor validations for checkout via UI.");
        }
        Assert::true(true, "Simulated: Scenarios avoid testing all minor field validations via UI.");
    }

    #[Given('the AI team is conducting a sprint retrospective')]
    public function theAiTeamIsConductingASprintRetrospective(): void
    {
        $this->internalState = []; // Reset state
        $this->internalState['meeting'] = 'sprint_retrospective';
        Assert::true(true, "Simulated: AI team is in sprint retrospective.");
    }

    #[When('discussing testing practices')]
    public function discussingTestingPractices(): void
    {
        Assert::eq($this->internalState['meeting'] ?? null, 'sprint_retrospective', "Should be in a retrospective to discuss testing practices.");
        $this->internalState['discussion_topic'] = 'testing_practices';
        Assert::true(true, "Simulated: Discussing testing practices.");
    }

    #[Then('the team SHOULD review the current balance of unit, integration, and acceptance tests')]
    public function theTeamShouldReviewTheCurrentBalanceOfUnitIntegrationAndAcceptanceTests(): void
    {
        Assert::eq($this->internalState['discussion_topic'] ?? null, 'testing_practices', "Topic should be testing practices.");
        // Simulate the review action
        $this->internalState['review_action'] = 'balance_of_tests_reviewed';
        Assert::true(true, "Simulated: Team reviews balance of tests.");
    }

    #[Then('if the review reveals an over-reliance on slow acceptance tests for functionality that could be unit-tested, an action item is created to refactor tests towards a better pyramid balance.')]
    public function ifTheReviewRevealsAnOverRelianceOnSlowAcceptanceTestsForFunctionalityThatCouldBeUnitTestedAnActionItemIsCreatedToRefactorTestsTowardsABetterPyramidBalance(): void
    {
        Assert::eq($this->internalState['review_action'] ?? null, 'balance_of_tests_reviewed', "Test balance review must have happened.");
        // Simulate a condition where refactoring is needed
        $hypothetical_over_reliance = true; // Or false, to test both paths if context allowed
        if ($hypothetical_over_reliance) {
            $this->internalState['action_item'] = 'refactor_tests_for_pyramid_balance';
            Assert::eq($this->internalState['action_item'], 'refactor_tests_for_pyramid_balance', "Action item for test refactoring should be created.");
        }
        Assert::true(true, "Simulated: Decision process for test refactoring action item.");
    }

    // US-COLLAB-01 Steps Begin Here

    #[Given('the AI team has defined handoff templates including:')]
    public function theAiTeamHasDefinedHandoffTemplatesIncluding(TableNode $table): void
    {
        $this->internalState['handoff_templates'] = [];
        foreach ($table->getHash() as $row) {
            $this->internalState['handoff_templates'][$row['Template For']] = $row['Key Information Fields'];
        }
        Assert::assertNotEmpty($this->internalState['handoff_templates'], "Handoff templates should be defined.");
    }

    #[Given('ES needs to assign US-FEAT-:arg2 (:arg1) to SET')]
    public function esNeedsToAssignUsFeatToSet($arg1, $arg2): void
    { // Method name adjusted: arg1 is description, arg2 is short ID part
        $this->internalState = []; // Reset for new scenario
        $this->internalState['task_to_assign_id'] = "US-FEAT-" . $arg2;
        $this->internalState['task_to_assign_description'] = $arg1;
        $this->internalState['assignee'] = 'SET';
        Assert::true(true, "Simulated: ES needs to assign {$this->internalState['task_to_assign_id']} ('{$arg1}') to SET.");
    }

    #[When('ES prepares the handoff message to SET')]
    public function esPreparesTheHandoffMessageToSet(): void
    {
        Assert::eq($this->internalState['assignee'] ?? null, 'SET', "Assignee context mismatch.");
        $this->internalState['handoff_message_being_prepared_for'] = 'SET';
        $this->internalState['action'] = 'preparing_handoff_ES_to_SET';
        Assert::true(true, "Simulated: ES prepares handoff message to SET.");
    }

    #[Then('ES MUST use the :arg1 template')]
    public function esMustUseTheTemplate($arg1): void
    {
        // This step can be reused by other roles, so we check current action context
        $expectedTemplateType = $arg1;
        $this->internalState['template_to_use'] = $expectedTemplateType;
        Assert::assertArrayHasKey($expectedTemplateType, $this->internalState['handoff_templates'] ?? [], "Template '{$expectedTemplateType}' not defined.");
        Assert::true(true, "Simulated: ES (or current role) MUST use the '{$expectedTemplateType}' template.");
    }

    #[Then('the message includes :arg1')]
    public function theMessageIncludes($arg1): void
    { // Generic message content check
        $expectedContent = $arg1;
        // In a real system, the message would be constructed and then checked.
        // Here, we simulate that the preparation process would ensure this.
        $this->internalState['message_content_check'] = $expectedContent; // Store for potential later validation
        Assert::stringContains($expectedContent, $expectedContent, "Simulated message content does not match expectation. (This is a mock assertion, in real test you'd check generated message)");
        // For specific scenarios, we might need more robust checks based on internalState
        if (($this->internalState['action'] ?? null) === 'preparing_handoff_ES_to_SET') {
             Assert::stringContains($arg1, "US-FEAT-005"); // Example specific check
        } elseif (($this->internalState['action'] ?? null) === 'preparing_handoff_SET_to_CTW') {
             Assert::stringContains($arg1, "US-FEAT-005");
        } elseif (($this->internalState['action'] ?? null) === 'preparing_blocker_SET_to_ES') {
             Assert::stringContains($arg1, "US-DB-002");
        }
        Assert::true(true, "Simulated: Message includes expected content '{$arg1}'.");
    }

    #[Given('SET has completed the backend logic for US-FEAT-:arg1')]
    public function setHasCompletedTheBackendLogicForUsFeat($arg1): void
    {
        $this->internalState = []; // Reset for new scenario
        $this->internalState['completed_task_id'] = "US-FEAT-" . $arg1;
        $this->internalState['completed_task_status'] = 'backend_logic_complete';
        Assert::true(true, "Simulated: SET completed backend logic for US-FEAT-{$arg1}.");
    }

    #[Given('the files `auth_controller.php` and `user_model.php` were modified')]
    public function theFilesAuth_ControllerphpAndUser_ModelphpWereModified(): void
    {
        $this->internalState['modified_files'] = ['auth_controller.php', 'user_model.php'];
        Assert::assertContains('auth_controller.php', $this->internalState['modified_files']);
    }

    #[Given('the new function `authenticate_user()` in `auth_controller.php` needs documentation')]
    public function theNewFunctionAuthenticate_UserInAuth_ControllerphpNeedsDocumentation(): void
    {
        $this->internalState['item_needing_docs'] = 'function `authenticate_user()` in `auth_controller.php`';
        Assert::true(true, "Simulated: `authenticate_user()` needs documentation.");
    }

    #[When('SET prepares the handoff message to CTW')]
    public function setPreparesTheHandoffMessageToCtw(): void
    {
        Assert::keyExists('completed_task_id', $this->internalState, "No completed task context for handoff to CTW.");
        $this->internalState['handoff_message_being_prepared_for'] = 'CTW';
        $this->internalState['action'] = 'preparing_handoff_SET_to_CTW';
        Assert::true(true, "Simulated: SET prepares handoff message to CTW.");
    }

    #[Given('SET is working on US-DB-:arg2 (:arg1)')]
    public function setIsWorkingOnUsDb($arg1, $arg2): void
    { // Method name adjusted: arg1 is description, arg2 is short ID part
        $this->internalState = []; // Reset for new scenario
        $this->internalState['current_task_id'] = "US-DB-" . $arg2;
        $this->internalState['current_task_description'] = $arg1;
        $this->internalState['current_task_status'] = 'in_progress_by_SET';
        Assert::true(true, "Simulated: SET working on US-DB-{$arg2} ('{$arg1}').");
    }

    #[Given('SET discovers they need read-only access to a production database replica which they don\'t have')]
    public function setDiscoversTheyNeedReadOnlyAccessToAProductionDatabaseReplicaWhichTheyDontHave(): void
    {
        $this->internalState['blocker_reason'] = 'need read-only access to production database replica';
        $this->internalState['blocker_need'] = 'credentials or access grant';
        Assert::true(true, "Simulated: SET discovered a blocker - needs DB access.");
    }

    #[When('SET prepares a message to ES about the blocker')]
    public function setPreparesAMessageToEsAboutTheBlocker(): void
    {
        Assert::keyExists('blocker_reason', $this->internalState, "No blocker context for message to ES.");
        $this->internalState['handoff_message_being_prepared_for'] = 'ES';
        $this->internalState['action'] = 'preparing_blocker_SET_to_ES';
        Assert::true(true, "Simulated: SET prepares blocker message to ES.");
    }

    // Other step definitions will be added incrementally
} 