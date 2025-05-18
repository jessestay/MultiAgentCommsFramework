<?php

use Behat\Behat\Context\Context;
use Behat\Gherkin\Node\PyStringNode;
use Behat\Gherkin\Node\TableNode;
use Behat\Testwork\Hook\Scope\BeforeSuiteScope;

// Add this line to use PendingException
use Behat\Behat\Tester\Exception\PendingException;


/**
 * Defines application features from the specific context.
 */
class FeatureContext implements Context
{
    private string $changedFile;
    private string $changeNature;
    private bool $isChangeMinorAndLocalized;
    private bool $subsetProposalMade;
    private ?string $identifiedSubset = null;
    private bool $esApprovedSubsetExecution;
    private bool $subsetTestsRun;
    private bool $subsetTestsPassed;
    private bool $fullTestSuiteRun;
    private bool $fullTestSuitePassed;
    private ?string $esRejectedSubsetReason = null;
    private bool $initialSubsetApprovedAndPassed = false;

    // For US-ACCEL-02
    private ?string $currentServiceDevelopment = null;
    private ?string $apiDefinitionStable = null; // Stores API details or a flag
    private array $apiCommunicatedToRoles = [];
    private bool $ctwDocsDraftingBegan = false;
    private bool $backendImplementationComplete = false;

    // For US-ACCEL-02, Scenario 2
    private ?string $desMockupsCompleteAndApprovedFor = null;
    private ?string $mockupsProvidedToSetFor = null;
    private ?string $setUiScaffoldingBeganFor = null;
    private ?string $desWorkingOnOtherComponent = null;

    // For US-ACCEL-02, Scenario 3
    private ?string $ctwWorkingOnFeature = null;
    private ?string $ctwIdentifiedDependencyAsset = null;
    private array $dependencyCommunicatedByCtwToRoles = [];

    // For US-ACCEL-02, Scenario 4
    private ?string $earlySchemaDraftForFeature = null;
    private bool $needsEarlyFeedback = false;
    private bool $esReviewSlotRequested = false;
    private bool $esReviewSlotScheduled = false;
    private bool $avoidedWaitingForFullBuild = false;

    // For US-ACCEL-03
    private ?string $currentFunctionImplementation = null;
    private ?string $testWritingFocus = null;
    private ?string $unitTestCoverageTarget = null;
    private bool $avoidedUiTestingForLogic = false;

    /**
     * Initializes context.
     *
     * Every scenario gets its own context instance.
     * You can also pass arbitrary arguments to the
     * context constructor through behat.yml.
     */
    public function __construct()
    {
        // Initialize state if necessary, or use a @BeforeScenario hook
        $this->resetState();
    }

    /**
     * @BeforeScenario
     */
    public function resetState(): void
    {
        $this->changedFile = '';
        $this->changeNature = '';
        $this->isChangeMinorAndLocalized = false;
        $this->subsetProposalMade = false;
        $this->identifiedSubset = null;
        $this->esApprovedSubsetExecution = false;
        $this->subsetTestsRun = false;
        $this->subsetTestsPassed = false;
        $this->fullTestSuiteRun = false;
        $this->fullTestSuitePassed = false;
        $this->esRejectedSubsetReason = null;
        $this->initialSubsetApprovedAndPassed = false;

        // For US-ACCEL-02
        $this->currentServiceDevelopment = null;
        $this->apiDefinitionStable = null;
        $this->apiCommunicatedToRoles = [];
        $this->ctwDocsDraftingBegan = false;
        $this->backendImplementationComplete = false;

        // For US-ACCEL-02, Scenario 2
        $this->desMockupsCompleteAndApprovedFor = null;
        $this->mockupsProvidedToSetFor = null;
        $this->setUiScaffoldingBeganFor = null;
        $this->desWorkingOnOtherComponent = null;

        // For US-ACCEL-02, Scenario 3
        $this->ctwWorkingOnFeature = null;
        $this->ctwIdentifiedDependencyAsset = null;
        $this->dependencyCommunicatedByCtwToRoles = [];

        // For US-ACCEL-02, Scenario 4
        $this->earlySchemaDraftForFeature = null;
        $this->needsEarlyFeedback = false;
        $this->esReviewSlotRequested = false;
        $this->esReviewSlotScheduled = false;
        $this->avoidedWaitingForFullBuild = false;

        // For US-ACCEL-03
        $this->currentFunctionImplementation = null;
        $this->testWritingFocus = null;
        $this->unitTestCoverageTarget = null;
        $this->avoidedUiTestingForLogic = false;
    }

    /** @Given SET has made a trivial change (e.g., corrected a typo in a code comment in `file_A.php`) */
    public function setHasMadeATrivialChangeEgCorrectedATypoInACodeCommentInFile_Aphp(): void
    {
        $this->changedFile = 'file_A.php';
        $this->changeNature = 'trivial code comment typo';
        // For the purpose of this test, we assume this action is done.
        // In a real scenario, this might involve actual file modification or simulation.
        echo "SIMULATE: SET made a trivial change to {$this->changedFile}\n";
    }

    /** @Given SET determines this change is very small and localized */
    public function setDeterminesThisChangeIsVerySmallAndLocalized(): void
    {
        if ($this->changeNature === 'trivial code comment typo') {
            $this->isChangeMinorAndLocalized = true;
            echo "SIMULATE: SET determined the change to {$this->changedFile} is minor and localized.\n";
        } else {
            throw new \Exception("Change was not of the expected nature to be minor and localized.");
        }
    }

    /** @When SET proposes to ES to run a targeted subset of tests, justifying it based on the minor scope */
    public function setProposesToEsToRunATargetedSubsetOfTestsJustifyingItBasedOnTheMinorScope(): void
    {
        if (!$this->isChangeMinorAndLocalized) {
            throw new \Exception("Cannot propose subset for a non-minor/non-localized change according to prior step.");
        }
        $this->subsetProposalMade = true;
        echo "SIMULATE: SET proposed to ES to run a targeted test subset for {$this->changedFile}.\n";
    }

    /** @When SET identifies unit tests for `file_A.php` as the sufficient subset */
    public function setIdentifiesUnitTestsForFile_AphpAsTheSufficientSubset(): void
    {
        if (!$this->subsetProposalMade) {
            throw new \Exception("Subset proposal must be made before identifying the subset.");
        }
        if ($this->changedFile === 'file_A.php') {
            $this->identifiedSubset = 'unit tests for file_A.php';
            echo "SIMULATE: SET identified '{$this->identifiedSubset}' as the sufficient subset.\n";
        } else {
            throw new \Exception("Identified subset logic not implemented for {$this->changedFile}");
        }
    }

    /** @When ES reviews the proposal and approves the subset execution */
    public function esReviewsTheProposalAndApprovesTheSubsetExecution(): void
    {
        if ($this->identifiedSubset === null) {
            throw new \Exception("No subset identified for ES to approve.");
        }
        // Simulate ES approval for this scenario path
        $this->esApprovedSubsetExecution = true;
        echo "SIMULATE: ES reviewed and approved the execution of '{$this->identifiedSubset}'.\n";
    }

    /** @Then SET runs only the unit tests for `file_A.php` */
    public function setRunsOnlyTheUnitTestsForFile_Aphp(): void
    {
        if (!$this->esApprovedSubsetExecution) {
            throw new \Exception("ES did not approve subset execution.");
        }
        if ($this->identifiedSubset !== 'unit tests for file_A.php') {
            throw new \Exception("Identified subset '{$this->identifiedSubset}' does not match expected 'unit tests for file_A.php'.");
        }
        $this->subsetTestsRun = true;
        echo "SIMULATE: SET ran only the unit tests for file_A.php.\n";
        // In a real test, this would involve actually invoking a test runner
    }

    /** @Then these subset tests pass */
    public function theseSubsetTestsPass(): void
    {
        if (!$this->subsetTestsRun) {
            throw new \Exception("Subset tests were not run.");
        }
        // Simulate tests passing for this scenario
        $this->subsetTestsPassed = true;
        echo "SIMULATE: The subset tests passed.\n";
    }

    /** @Then LATER, before committing the change to `file_A.php` */
    public function laterBeforeCommittingTheChangeToFile_Aphp(): void
    {
        // This step primarily serves as a narrative separator.
        // We need to ensure the previous steps related to subset testing are complete.
        if (!$this->subsetTestsPassed) {
            throw new \Exception("Cannot proceed to 'LATER' step if subset tests did not pass or run.");
        }
        echo "SIMULATE: Time passes... SET is now about to commit the change to {$this->changedFile}.\n";
    }

    /** @Then SET MUST execute the full test suite */
    public function setMustExecuteTheFullTestSuiteEgNpmRunTestfullSuite(): void
    {
        // This step ensures the Golden Test Rule is followed.
        // It can be reached from Scenario 1 (after subset tests passed)
        // or Scenario 2 (after ES rejected subset and requested full suite).
        if (!($this->subsetTestsPassed || $this->esRejectedSubsetReason !== null)) {
            throw new \Exception("It's not time to run the full test suite yet, or prior conditions not met.");
        }
        $this->fullTestSuiteRun = true;
        if ($this->esRejectedSubsetReason !== null) {
            echo "SIMULATE: SET is now executing the full test suite for {$this->changedFile} as requested by ES after subset rejection.\n";
        } else {
            echo "SIMULATE: SET is now executing the full test suite (e.g., npm run test:full-suite) for {$this->changedFile}.\n";
        }
        // In a real test, this would involve actually invoking the full test suite runner
    }

    /** @Then ALL tests in the full suite MUST pass */
    public function allTestsInTheFullSuiteMustPass(): void
    {
        if (!$this->fullTestSuiteRun) {
            throw new \Exception("Full test suite was not run.");
        }
        // Simulate full test suite passing for this scenario
        $this->fullTestSuitePassed = true;
        echo "SIMULATE: ALL tests in the full suite passed. Commit can proceed.\n";

        // Final assertion for the scenario\'s successful completion
        if (!($this->changedFile === 'file_A.php' &&
              $this->changeNature === 'trivial code comment typo' &&
              $this->isChangeMinorAndLocalized &&
              $this->subsetProposalMade &&
              $this->identifiedSubset === 'unit tests for file_A.php' &&
              $this->esApprovedSubsetExecution &&
              $this->subsetTestsRun &&
              $this->subsetTestsPassed &&
              $this->fullTestSuiteRun &&
              $this->fullTestSuitePassed)) {
            throw new \Exception("Scenario did not complete as expected. Check intermediate states.");
        }
    }

    /** @Given SET has refactored a core method signature in `service_B.php` */
    public function setHasRefactoredACoreMethodSignatureInServiceBphp(): void
    {
        $this->changedFile = 'service_B.php';
        $this->changeNature = 'core method signature refactor';
        echo "SIMULATE: SET refactored a core method signature in {$this->changedFile}\n";
    }

    /** @When SET proposes to ES to run only unit tests for `service_B.php` */
    public function setProposesToEsToRunOnlyUnitTestsForServiceBphp(): void
    {
        $this->subsetProposalMade = true;
        $this->identifiedSubset = 'unit tests for service_B.php';
        echo "SIMULATE: SET proposed to ES to run only unit tests for {$this->changedFile}.\n";
    }

    /** @Then ES reviews the proposal */
    public function esReviewsTheProposal(): void
    {
        if (!$this->subsetProposalMade) {
            throw new \Exception("No proposal made for ES to review.");
        }
        echo "SIMULATE: ES is reviewing the proposal for {$this->changedFile}.\n";
    }

    /** @Then ES determines the change is not minor or localized enough and carries higher risk */
    public function esDeterminesTheChangeIsNotMinorOrLocalizedEnoughAndCarriesHigherRisk(): void
    {
        if ($this->changeNature === 'core method signature refactor') {
            $this->isChangeMinorAndLocalized = false; // Explicitly set for clarity
            $this->esApprovedSubsetExecution = false; // ES will not approve
            $this->esRejectedSubsetReason = 'change is not minor or localized enough and carries higher risk';
            echo "SIMULATE: ES determined the change to {$this->changedFile} is high risk: {$this->esRejectedSubsetReason}.\n";
        } else {
            throw new \Exception("Change nature mismatch for this step.");
        }
    }

    /** @Then ES requests SET to run the full test suite immediately */
    public function esRequestsSetToRunTheFullTestSuiteImmediately(): void
    {
        if ($this->esApprovedSubsetExecution || $this->esRejectedSubsetReason === null) {
            throw new \Exception("ES did not reject subset or reason is missing.");
        }
        echo "SIMULATE: ES requests SET to run the full test suite immediately for {$this->changedFile}.\n";
        // This step implies the next action will be running the full suite.
    }

    /** @Given SET has made a change to `component_C.js` */
    public function setHasMadeAChangeToComponentCJs(): void
    {
        $this->changedFile = 'component_C.js';
        $this->changeNature = 'generic component change';
        echo "SIMULATE: SET has made a change to {$this->changedFile}.\n";
    }

    /** @Given SET initially ran and passed a targeted test subset approved by ES */
    public function setInitiallyRanAndPassedATargetedTestSubsetApprovedByEs(): void
    {
        // Simulate this state for scenario 3
        $this->isChangeMinorAndLocalized = true; // Assume it was deemed minor for subset to run
        $this->subsetProposalMade = true;
        $this->identifiedSubset = 'unit tests for component_C.js'; // Example subset
        $this->esApprovedSubsetExecution = true;
        $this->subsetTestsRun = true;
        $this->subsetTestsPassed = true;
        $this->initialSubsetApprovedAndPassed = true;
        echo "SIMULATE: SET had previously run and passed an approved subset test for {$this->changedFile}.\n";
    }

    /** @When SET is about to commit the changes to `component_C.js` */
    public function setIsAboutToCommitTheChangesToComponentCJs(): void
    {
        if (!$this->initialSubsetApprovedAndPassed) {
            throw new \Exception("Initial subset tests condition not met.");
        }
        echo "SIMULATE: SET is about to commit changes to {$this->changedFile}.\n";
    }

    /** @Then SET MUST execute the full test suite as per rule :ruleIdentifier */
    public function setMustExecuteTheFullTestSuiteAsPerRule(string $ruleIdentifier): void
    {
        if (!($this->changedFile === 'component_C.js' && $this->initialSubsetApprovedAndPassed)) {
            throw new \Exception("Conditions not met for running full test suite per rule {$ruleIdentifier}.");
        }
        $this->fullTestSuiteRun = true;
        echo "SIMULATE: SET is executing the full test suite for {$this->changedFile} as per rule: {$ruleIdentifier}.\n";
        // Actual test execution would happen here.
    }

    /** @Then all tests in the full suite MUST pass for the commit to proceed. */
    public function allTestsInTheFullSuiteMustPassForTheCommitToProceed(): void
    {
        if (!$this->fullTestSuiteRun) {
            throw new \Exception("Full test suite was not run for commit to proceed.");
        }
        $this->fullTestSuitePassed = true; // Simulate passing
        echo "SIMULATE: All tests in the full suite passed for {$this->changedFile}. Commit may proceed.\n";
        // Final assertions for this scenario path
        if (!($this->changedFile === 'component_C.js' && $this->initialSubsetApprovedAndPassed && $this->fullTestSuiteRun && $this->fullTestSuitePassed)) {
             throw new \Exception("Scenario 3 did not complete as expected.");
        }
    }

    //<editor-fold desc="US-ACCEL-02 Steps">
    /** @Given SET is developing a new :serviceName service */
    public function setIsDevelopingANewService(string $serviceName): void
    {
        $this->currentServiceDevelopment = $serviceName;
        $this->backendImplementationComplete = false; // Explicitly set at the beginning
        echo "SIMULATE: SET is developing a new '{$serviceName}' service.\n";
    }

    /** @When SET defines a stable API for the service (e.g., endpoints, request/response formats) */
    public function setDefinesAStableApiForTheServiceEgEndpointsRequestResponseFormats2(): void
    {
        if ($this->currentServiceDevelopment === null) {
            throw new \Exception("No service is currently under development.");
        }
        $this->apiDefinitionStable = "API for {$this->currentServiceDevelopment} - Version 1.0 [Simulated]";
        echo "SIMULATE: SET has defined a stable API for '{$this->currentServiceDevelopment}': {$this->apiDefinitionStable}.\n";
    }

    /** @When SET communicates this API definition to ES and CTW */
    public function setCommunicatesThisApiDefinitionToEsAndCtw(): void
    {
        if ($this->apiDefinitionStable === null) {
            throw new \Exception("API definition is not stable yet to be communicated.");
        }
        $this->apiCommunicatedToRoles = ['ES', 'CTW'];
        echo "SIMULATE: SET communicated the API definition for '{$this->currentServiceDevelopment}' to ES and CTW.\n";
    }

    /** @Then CTW can begin drafting the technical documentation for the :serviceName API */
    public function ctwCanBeginDraftingTheTechnicalDocumentationForTheApi(string $serviceName): void
    {
        if ($this->currentServiceDevelopment !== $serviceName) {
            throw new \Exception("Service name mismatch. Current: '{$this->currentServiceDevelopment}', Expected: '{$serviceName}'.");
        }
        if (!in_array('CTW', $this->apiCommunicatedToRoles) || $this->apiDefinitionStable === null) {
            throw new \Exception("API not defined or not communicated to CTW for '{$serviceName}'.");
        }
        $this->ctwDocsDraftingBegan = true;
        echo "SIMULATE: CTW can begin drafting technical documentation for the '{$serviceName}' API.\n";
    }

    /** @Then this occurs before SET completes the full backend implementation of the service. */
    public function thisOccursBeforeSetCompletesTheFullBackendImplementationOfTheService(): void
    {
        if (!$this->ctwDocsDraftingBegan) {
            throw new \Exception("CTW has not begun drafting documentation yet.");
        }
        if ($this->backendImplementationComplete) {
            throw new \Exception("Error: Backend implementation was already completed. This step should occur before.");
        }
        echo "SIMULATE: CTW doc drafting is occurring before full backend implementation of '{$this->currentServiceDevelopment}' is complete.\n";

        // Final assertions for this scenario path
        if (!($this->currentServiceDevelopment === 'User Authentication' &&
              $this->apiDefinitionStable !== null &&
              count($this->apiCommunicatedToRoles) >= 2 && in_array('CTW', $this->apiCommunicatedToRoles) &&
              $this->ctwDocsDraftingBegan &&
              !$this->backendImplementationComplete)) {
            throw new \Exception("Scenario (US-ACCEL-02, Scenario 1) did not complete as expected.");
        }
    }

    /** @Given DES has completed and received approval for mockups of a :pageName */
    public function desHasCompletedAndReceivedApprovalForMockupsOfA(string $pageName): void
    {
        $this->desMockupsCompleteAndApprovedFor = $pageName;
        echo "SIMULATE: DES has completed and received approval for mockups of '{$pageName}'.\n";
    }

    /** @When DES provides these mockups to SET */
    public function desProvidesTheseMockupsToSet(): void
    {
        if ($this->desMockupsCompleteAndApprovedFor === null) {
            throw new \Exception("DES mockups were not completed and approved first.");
        }
        $this->mockupsProvidedToSetFor = $this->desMockupsCompleteAndApprovedFor;
        echo "SIMULATE: DES provided mockups for '{$this->mockupsProvidedToSetFor}' to SET.\n";
    }

    /** @Then SET can begin scaffolding the UI component structure and basic logic for the :pageName */
    public function setCanBeginScaffoldingTheUiComponentStructureAndBasicLogicForThe(string $pageName): void
    {
        if ($this->mockupsProvidedToSetFor !== $pageName) {
            throw new \Exception("Mockups not provided to SET for '{$pageName}' or mismatch.");
        }
        $this->setUiScaffoldingBeganFor = $pageName;
        echo "SIMULATE: SET can begin scaffolding UI for '{$pageName}'.\n";
    }

    /** @Then DES can simultaneously work on detailed styling for a different component, like the :otherComponent. */
    public function desCanSimultaneouslyWorkOnDetailedStylingForADifferentComponentLikeThe(string $otherComponent): void
    {
        if ($this->setUiScaffoldingBeganFor === null) {
            throw new \Exception("SET has not begun scaffolding UI yet for the primary component.");
        }
        $this->desWorkingOnOtherComponent = $otherComponent;
        echo "SIMULATE: DES can simultaneously work on detailed styling for '{$otherComponent}'.\n";

        // Final assertions for this scenario path
        if (!($this->desMockupsCompleteAndApprovedFor === 'User Profile Page' &&
              $this->mockupsProvidedToSetFor === 'User Profile Page' &&
              $this->setUiScaffoldingBeganFor === 'User Profile Page' &&
              $this->desWorkingOnOtherComponent === 'Site Header')) {
            throw new \Exception("Scenario (US-ACCEL-02, Scenario 2) did not complete as expected.");
        }
    }

    /** @Given CTW is drafting user guides for an upcoming feature :featureName */
    public function ctwIsDraftingUserGuidesForAnUpcomingFeature(string $featureName): void
    {
        $this->ctwWorkingOnFeature = $featureName;
        echo "SIMULATE: CTW is drafting user guides for '{$featureName}'.\n";
    }

    /** @Given CTW realizes that DES will need specific icon assets for these notifications */
    public function ctwRealizesThatDesWillNeedSpecificIconAssetsForTheseNotifications(): void
    {
        if ($this->ctwWorkingOnFeature !== 'Notifications') {
            throw new \Exception("CTW is not working on Notifications, cannot realize this specific dependency.");
        }
        $this->ctwIdentifiedDependencyAsset = 'icon assets for Notifications';
        echo "SIMULATE: CTW realizes DES will need '{$this->ctwIdentifiedDependencyAsset}'.\n";
    }

    /** @When CTW identifies this dependency */
    public function ctwIdentifiesThisDependency(): void
    {
        if ($this->ctwIdentifiedDependencyAsset === null) {
            throw new \Exception("CTW has not identified any dependency yet.");
        }
        echo "SIMULATE: CTW has formally identified the dependency: '{$this->ctwIdentifiedDependencyAsset}'.\n";
    }

    /** @Then CTW proactively communicates to ES and DES that icon design for :featureName can begin. */
    public function ctwProactivelyCommunicatesToEsAndDesThatIconDesignForCanBegin(string $featureName): void
    {
        if ($this->ctwWorkingOnFeature !== $featureName || $this->ctwIdentifiedDependencyAsset !== "icon assets for {$featureName}") {
            throw new \Exception("Mismatch in feature or identified asset for communication.");
        }
        $this->dependencyCommunicatedByCtwToRoles = ['ES', 'DES'];
        echo "SIMULATE: CTW proactively communicated to ES and DES that icon design for '{$featureName}' can begin.\n";

        // Final assertions for this scenario path
        if (!($this->ctwWorkingOnFeature === 'Notifications' &&
              $this->ctwIdentifiedDependencyAsset === 'icon assets for Notifications' &&
              count($this->dependencyCommunicatedByCtwToRoles) >= 2 && in_array('DES', $this->dependencyCommunicatedByCtwToRoles))) {
            throw new \Exception("Scenario (US-ACCEL-02, Scenario 3) did not complete as expected.");
        }
    }

    /** @Given SET has an early but stable draft of a database schema for a new :featureName */
    public function setHasAnEarlyButStableDraftOfADatabaseSchemaForANew(string $featureName): void
    {
        $this->earlySchemaDraftForFeature = $featureName;
        echo "SIMULATE: SET has an early but stable draft of a database schema for '{$featureName}'.\n";
    }

    /** @Given SET needs early feedback from another SET member (or a data architect role) before proceeding further */
    public function setNeedsEarlyFeedbackFromAnotherSetMemberOrADataArchitectRoleBeforeProceedingFurther2(): void
    {
        if ($this->earlySchemaDraftForFeature === null) {
            throw new \Exception("No early schema draft exists to need feedback on.");
        }
        $this->needsEarlyFeedback = true;
        echo "SIMULATE: SET needs early feedback on the schema for '{$this->earlySchemaDraftForFeature}'.\n";
    }

    /** @When SET requests ES for an early review slot */
    public function setRequestsEsForAnEarlyReviewSlot(): void
    {
        if (!$this->needsEarlyFeedback) {
            throw new \Exception("SET does not currently need early feedback, so no review slot request is made.");
        }
        $this->esReviewSlotRequested = true;
        echo "SIMULATE: SET requests ES for an early review slot for '{$this->earlySchemaDraftForFeature}'.\n";
    }

    /** @Then ES facilitates scheduling a short, dedicated review window for the schema draft */
    public function esFacilitatesSchedulingAShortDedicatedReviewWindowForTheSchemaDraft(): void
    {
        if (!$this->esReviewSlotRequested) {
            throw new \Exception("ES review slot was not requested.");
        }
        $this->esReviewSlotScheduled = true;
        echo "SIMULATE: ES facilitates scheduling a short, dedicated review window for the schema for '{$this->earlySchemaDraftForFeature}'.\n";
    }

    /** @Then this avoids waiting for the entire Reporting Module to be built before schema review. */
    public function thisAvoidsWaitingForTheEntireReportingModuleToBeBuiltBeforeSchemaReview(): void
    {
        if (!$this->esReviewSlotScheduled || $this->earlySchemaDraftForFeature !== 'Reporting Module') {
            throw new \Exception("Conditions not met to confirm avoidance of waiting for full build of Reporting Module.");
        }
        $this->avoidedWaitingForFullBuild = true;
        echo "SIMULATE: Early review of '{$this->earlySchemaDraftForFeature}' schema avoided waiting for the entire module to be built.\n";

        // Final assertions for this scenario path
        if (!($this->earlySchemaDraftForFeature === 'Reporting Module' &&
              $this->needsEarlyFeedback &&
              $this->esReviewSlotRequested &&
              $this->esReviewSlotScheduled &&
              $this->avoidedWaitingForFullBuild)) {
            throw new \Exception("Scenario (US-ACCEL-02, Scenario 4) did not complete as expected.");
        }
    }
    //</editor-fold>

    //<editor-fold desc="US-ACCEL-03 Steps">
    /** @Given SET is implementing a new complex calculation function :functionName in :fileName */
    public function setIsImplementingANewComplexCalculationFunctionIn(string $functionName, string $fileName): void
    {
        $this->currentFunctionImplementation = "{$functionName} in {$fileName}";
        echo "SIMULATE: SET is implementing '{$this->currentFunctionImplementation}'.\n";
    }

    /** @When SET writes tests for this function */
    public function setWritesTestsForThisFunction(): void
    {
        if ($this->currentFunctionImplementation === null) {
            throw new \Exception("No function is currently being implemented to write tests for.");
        }
        $this->testWritingFocus = "unit_tests"; // Default assumption for this scenario
        echo "SIMULATE: SET is writing tests for '{$this->currentFunctionImplementation}'.\n";
    }

    /** @Then SET MUST primarily use unit tests to cover various inputs, outputs, and edge cases of :functionName */
    public function setMustPrimarilyUseUnitTestsToCoverVariousInputsOutputsAndEdgeCasesOf(string $functionName): void
    {
        if ($this->currentFunctionImplementation !== "{$functionName} in pricing_service.php" || $this->testWritingFocus !== "unit_tests") {
            throw new \Exception("Conditions not met for this assertion about unit test focus for {$functionName}.");
        }
        $this->unitTestCoverageTarget = "various inputs, outputs, and edge cases of {$functionName}";
        echo "SIMULATE: SET is focusing on unit tests for '{$this->unitTestCoverageTarget}'.\n";
    }

    /** @Then SET avoids testing this specific calculation logic through a full UI-driven Behat scenario. */
    public function setAvoidsTestingThisSpecificCalculationLogicThroughAFullUiDrivenBehatScenario(): void
    {
        if ($this->unitTestCoverageTarget === null || $this->currentFunctionImplementation !== "calculate_discount() in pricing_service.php") {
            throw new \Exception("Unit test focus not established or wrong function for this UI avoidance step.");
        }
        $this->avoidedUiTestingForLogic = true;
        echo "SIMULATE: SET is avoiding UI-driven Behat scenarios for the specific logic of calculate_discount(), favoring unit tests.\n";

        // Final assertions for this scenario path
        if (!($this->currentFunctionImplementation === "calculate_discount() in pricing_service.php" &&
              $this->testWritingFocus === "unit_tests" &&
              $this->unitTestCoverageTarget === "various inputs, outputs, and edge cases of calculate_discount()" &&
              $this->avoidedUiTestingForLogic)) {
            throw new \Exception("Scenario (US-ACCEL-03, Scenario 1) did not complete as expected.");
        }
    }
    //</editor-fold>
} 