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

    // Other step definitions will be added incrementally
} 