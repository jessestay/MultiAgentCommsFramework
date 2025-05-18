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

    // For US-ACCEL-03, Scenario 2
    private ?string $acceptanceTestFocusFeature = null;
    private bool $scenarioFocusesOnCriticalPath = false;
    private bool $scenarioAvoidsMinorValidations = false;

    // For US-ACCEL-03, Scenario 3
    private bool $inSprintRetrospective = false;
    private bool $discussingTestingPractices = false;
    private bool $testBalanceReviewed = false;
    private bool $actionItemToRefactorTestsCreated = false;

    // For US-QUAL-01
    private ?string $reportedBugDescription = null;
    private bool $setTaskedWithFix = false;
    private bool $workOnBugFixBegan = false;
    private ?string $regressionTestWrittenFor = null;
    private bool $regressionTestInitiallyFails = false;
    private ?string $codeChangeImplementedFor = null;
    private bool $regressionTestNowPasses = false;
    private bool $regressionTestAddedToSuite = false;
    private bool $dodIncludesRegressionTest = false;

    // For US-QUAL-01, Scenario 2
    private ?string $submittedBugFixDescription = null;
    private ?string $includedUnitTestName = null;
    private bool $reviewerVerifiedBugReproduction = false;
    private bool $reviewerVerifiedTestPassesWithFix = false;
    private bool $reviewerConfirmedTestInSuite = false;

    // For US-QUAL-03
    private ?string $cliCommandExecuted = null;
    private ?string $cliOutput = null;
    private bool $cliHelpDisplayed = false;
    private bool $cliHelpIncludesCommandsOptions = false;
    private bool $cliHelpIsClear = false;
    private bool $cliErrorDisplayed = false;
    private bool $cliErrorIndicatesCommandNotRecognized = false;
    private bool $cliErrorSuggestsHelp = false;
    private bool $cliCommandSuccessful = false;
    private ?string $cliVersionDisplayed = null;
    private bool $cliOutputConciseAndAccurate = false;
    private ?string $regressedCommand = null;
    private bool $rcaInitiated = false;
    private bool $rcaInvestigatedTestCoverage = false;
    private ?string $rcaRootCause = null;
    private ?string $rcaActionItem = null;

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

        // For US-ACCEL-03, Scenario 2
        $this->acceptanceTestFocusFeature = null;
        $this->scenarioFocusesOnCriticalPath = false;
        $this->scenarioAvoidsMinorValidations = false;

        // For US-ACCEL-03, Scenario 3
        $this->inSprintRetrospective = false;
        $this->discussingTestingPractices = false;
        $this->testBalanceReviewed = false;
        $this->actionItemToRefactorTestsCreated = false;

        // For US-QUAL-01
        $this->reportedBugDescription = null;
        $this->setTaskedWithFix = false;
        $this->workOnBugFixBegan = false;
        $this->regressionTestWrittenFor = null;
        $this->regressionTestInitiallyFails = false;
        $this->codeChangeImplementedFor = null;
        $this->regressionTestNowPasses = false;
        $this->regressionTestAddedToSuite = false;
        $this->dodIncludesRegressionTest = false;

        // For US-QUAL-01, Scenario 2
        $this->submittedBugFixDescription = null;
        $this->includedUnitTestName = null;
        $this->reviewerVerifiedBugReproduction = false;
        $this->reviewerVerifiedTestPassesWithFix = false;
        $this->reviewerConfirmedTestInSuite = false;

        // For US-QUAL-03
        $this->cliCommandExecuted = null;
        $this->cliOutput = null;
        $this->cliHelpDisplayed = false;
        $this->cliHelpIncludesCommandsOptions = false;
        $this->cliHelpIsClear = false;
        $this->cliErrorDisplayed = false;
        $this->cliErrorIndicatesCommandNotRecognized = false;
        $this->cliErrorSuggestsHelp = false;
        $this->cliCommandSuccessful = false;
        $this->cliVersionDisplayed = null;
        $this->cliOutputConciseAndAccurate = false;
        $this->regressedCommand = null;
        $this->rcaInitiated = false;
        $this->rcaInvestigatedTestCoverage = false;
        $this->rcaRootCause = null;
        $this->rcaActionItem = null;
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
    /** @Given SET is implementing the :functionName function in :fileName */
    public function setIsImplementingTheFunctionIn(string $functionName, string $fileName): void
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

    /** @Then SET MUST primarily use unit tests for the :functionName function */
    public function setMustPrimarilyUseUnitTestsForTheFunction(string $functionName): void
    {
        if ($this->currentFunctionImplementation !== "{$functionName} in pricing_service.php" || $this->testWritingFocus !== "unit_tests") {
            throw new \Exception("Conditions not met for this assertion about unit test focus for {$functionName}.");
        }
        // Simplified the expectation for the target to just the function name for this step
        $this->unitTestCoverageTarget = $functionName;
        echo "SIMULATE: SET is focusing on unit tests for '{$this->unitTestCoverageTarget}'.\n";
    }

    /** @Then SET avoids testing this specific calculation logic through a full UI-driven Behat scenario. */
    public function setAvoidsTestingThisSpecificCalculationLogicThroughAFullUiDrivenBehatScenario(): void
    {
        if ($this->unitTestCoverageTarget !== "calculate_discount()" || $this->currentFunctionImplementation !== "calculate_discount() in pricing_service.php") {
            throw new \Exception("Unit test focus not established for 'calculate_discount()' or wrong function for this UI avoidance step.");
        }
        $this->avoidedUiTestingForLogic = true;
        echo "SIMULATE: SET is avoiding UI-driven Behat scenarios for the specific logic of calculate_discount(), favoring unit tests.\n";

        // Final assertions for this scenario path
        if (!($this->currentFunctionImplementation === "calculate_discount() in pricing_service.php" &&
              $this->testWritingFocus === "unit_tests" &&
              $this->unitTestCoverageTarget === "calculate_discount()" &&
              $this->avoidedUiTestingForLogic)) {
            throw new \Exception("Scenario (US-ACCEL-03, Scenario 1) did not complete as expected.");
        }
    }

    /** @Given SET is writing Behat acceptance tests for the :processName process */
    public function setIsWritingBehatAcceptanceTestsForTheProcess(string $processName): void
    {
        $this->acceptanceTestFocusFeature = $processName;
        echo "SIMULATE: SET is writing Behat acceptance tests for the '{$processName}' process.\n";
    }

    /** @When defining the Behat scenarios */
    public function definingTheBehatScenarios(): void
    {
        if ($this->acceptanceTestFocusFeature === null) {
            throw new \Exception("Not currently focused on writing acceptance tests for any specific process.");
        }
        echo "SIMULATE: Defining Behat scenarios for '{$this->acceptanceTestFocusFeature}'.\n";
    }

    /** @Then the scenarios MUST focus on the end-to-end critical path of a user adding an item to cart and completing a purchase */
    public function theScenariosMustFocusOnTheEndToEndCriticalPathOfAUserAddingAnItemToCartAndCompletingAPurchase(): void
    {
        if ($this->acceptanceTestFocusFeature !== 'user checkout') {
            throw new \Exception("This assertion is specific to the 'user checkout' process focus.");
        }
        $this->scenarioFocusesOnCriticalPath = true;
        echo "SIMULATE: Scenarios for '{$this->acceptanceTestFocusFeature}' will focus on the end-to-end critical path (add to cart, complete purchase).\n";
    }

    /** @Then the scenarios SHOULD NOT attempt to test every minor validation rule of each field in the checkout form (which should be covered by unit/integration tests). */
    public function theScenariosShouldNotAttemptToTestEveryMinorValidationRuleOfEachFieldInTheCheckoutFormWhichShouldBeCoveredByUnitIntegrationTests2(): void
    {
        throw new PendingException();
    }

    /** @Given the AI team is conducting a sprint retrospective */
    public function theAiTeamIsConductingASprintRetrospective(): void
    {
        $this->inSprintRetrospective = true;
        echo "SIMULATE: The AI team is conducting a sprint retrospective.\n";
    }

    /** @When discussing testing practices */
    public function discussingTestingPractices(): void
    {
        if (!$this->inSprintRetrospective) {
            throw new \Exception("Not in a sprint retrospective to discuss testing practices.");
        }
        $this->discussingTestingPractices = true;
        echo "SIMULATE: Discussing testing practices in the retrospective.\n";
    }

    /** @Then the team SHOULD review the current balance of unit, integration, and acceptance tests */
    public function theTeamShouldReviewTheCurrentBalanceOfUnitIntegrationAndAcceptanceTests(): void
    {
        if (!$this->discussingTestingPractices) {
            throw new \Exception("Not discussing testing practices, cannot review balance.");
        }
        $this->testBalanceReviewed = true;
        echo "SIMULATE: The team is reviewing the current balance of unit, integration, and acceptance tests.\n";
    }

    /** @Then if the review reveals an over-reliance on slow acceptance tests for functionality that could be unit-tested, an action item is created to refactor tests towards a better pyramid balance. */
    public function ifTheReviewRevealsAnOverRelianceOnSlowAcceptanceTestsForFunctionalityThatCouldBeUnitTestedAnActionItemIsCreatedToRefactorTestsTowardsABetterPyramidBalance(): void
    {
        if (!$this->testBalanceReviewed) {
            throw new \Exception("Test balance has not been reviewed yet.");
        }
        // Simulate a scenario where refactoring is needed
        $overRelianceDetected = true; // For simulation purposes
        if ($overRelianceDetected) {
            $this->actionItemToRefactorTestsCreated = true;
            echo "SIMULATE: Review revealed over-reliance on slow acceptance tests. Action item created to refactor tests.\n";
        } else {
            echo "SIMULATE: Review found a healthy test balance. No action item for refactoring needed at this time.\n";
        }

        // Final assertions for this scenario path (assuming over-reliance was detected for this test pass)
        if (!($this->inSprintRetrospective &&
              $this->discussingTestingPractices &&
              $this->testBalanceReviewed &&
              $this->actionItemToRefactorTestsCreated)) {
            throw new \Exception("Scenario (US-ACCEL-03, Scenario 3) did not complete as expected when over-reliance is detected.");
        }
    }
    //</editor-fold>

    //<editor-fold desc="US-QUAL-01 Steps">
    /** @Given a reported bug: :bugDescription */
    public function aReportedBug(string $bugDescription): void
    {
        $this->reportedBugDescription = $bugDescription;
        echo "SIMULATE: A bug has been reported: '{$bugDescription}'.\n";
    }

    /** @Given SET is tasked with fixing this bug */
    public function setIsTaskedWithFixingThisBug(): void
    {
        if ($this->reportedBugDescription === null) {
            throw new \Exception("No bug was reported to be tasked with fixing.");
        }
        $this->setTaskedWithFix = true;
        echo "SIMULATE: SET is tasked with fixing the bug: '{$this->reportedBugDescription}'.\n";
    }

    /** @When SET begins work on the bug fix */
    public function setBeginsWorkOnTheBugFix(): void
    {
        if (!$this->setTaskedWithFix) {
            throw new \Exception("SET was not tasked with fixing a bug.");
        }
        $this->workOnBugFixBegan = true;
        echo "SIMULATE: SET begins work on the bug fix for: '{$this->reportedBugDescription}'.\n";
    }

    /** @Then SET first writes a new unit test (or integration test) that attempts to log in a user with an email like :emailExample */
    public function setFirstWritesANewUnitTestOrIntegrationTestThatAttemptsToLogInAUserWithAnEmailLike2(string $emailExample): void
    {
        if (!$this->workOnBugFixBegan) {
            throw new \Exception("Work on bug fix has not begun.");
        }
        if ($this->reportedBugDescription !== "User cannot log in with a valid email address containing a plus (+) symbol.") {
            throw new \Exception("This step is specific to the plus symbol email bug.");
        }
        $this->regressionTestWrittenFor = "login with email {$emailExample}";
        echo "SIMULATE: SET first writes a new test for '{$this->regressionTestWrittenFor}'.\n";
    }

    /** @Then this new test initially fails, confirming the bug */
    public function thisNewTestInitiallyFailsConfirmingTheBug(): void
    {
        if ($this->regressionTestWrittenFor === null) {
            throw new \Exception("No regression test has been written yet.");
        }
        $this->regressionTestInitiallyFails = true; // Simulate failure
        echo "SIMULATE: The new test for '{$this->regressionTestWrittenFor}' initially FAILS, confirming the bug.\n";
    }

    /** @When SET implements the code changes to allow logins with emails containing plus symbols */
    public function setImplementsTheCodeChangesToAllowLoginsWithEmailsContainingPlusSymbols(): void
    {
        if (!$this->regressionTestInitiallyFails) {
            throw new \Exception("Regression test did not initially fail, or was not written.");
        }
        $this->codeChangeImplementedFor = "plus symbol email login";
        echo "SIMULATE: SET implements code changes to allow logins with emails containing plus symbols.\n";
    }

    /** @Then the new regression test MUST now pass */
    public function theNewRegressionTestMustNowPass(): void
    {
        if ($this->codeChangeImplementedFor !== "plus symbol email login") {
            throw new \Exception("Code change for plus symbol email login was not implemented.");
        }
        $this->regressionTestNowPasses = true; // Simulate test passing after fix
        echo "SIMULATE: The new regression test for '{$this->regressionTestWrittenFor}' now PASSES.\n";
    }

    /** @Then this new test is added permanently to the test suite */
    public function thisNewTestIsAddedPermanentlyToTheTestSuite(): void
    {
        if (!$this->regressionTestNowPasses) {
            throw new \Exception("Regression test is not passing, cannot be added to suite permanently.");
        }
        $this->regressionTestAddedToSuite = true;
        echo "SIMULATE: The new regression test for '{$this->regressionTestWrittenFor}' is added permanently to the test suite.\n";
    }

    /** @Then the Definition of Done for the bug fix task includes :dodCriterion */
    public function theDefinitionOfDoneForTheBugFixTaskIncludes(string $dodCriterion): void
    {
        if (!$this->regressionTestAddedToSuite) {
            throw new \Exception("Regression test was not added to the suite.");
        }
        if ($dodCriterion === "Regression test for plus symbol in email login created and passing.") {
            $this->dodIncludesRegressionTest = true;
            echo "SIMULATE: DoD for the bug fix task now includes: '{$dodCriterion}'.\n";
        } else {
            throw new \Exception("DoD criterion '{$dodCriterion}' does not match expected.");
        }

        // Final assertions for this scenario path
        if (!($this->reportedBugDescription === "User cannot log in with a valid email address containing a plus (+) symbol." &&
              $this->setTaskedWithFix &&
              $this->workOnBugFixBegan &&
              $this->regressionTestWrittenFor === "login with email user+alias@example.com" &&
              $this->regressionTestInitiallyFails &&
              $this->codeChangeImplementedFor === "plus symbol email login" &&
              $this->regressionTestNowPasses &&
              $this->regressionTestAddedToSuite &&
              $this->dodIncludesRegressionTest)) {
            throw new \Exception("Scenario (US-QUAL-01, Scenario 1) did not complete as expected.");
        }
    }

    /** @Given SET has submitted a bug fix for :bugFixDescription */
    public function setHasSubmittedABugFixFor(string $bugFixDescription): void
    {
        $this->submittedBugFixDescription = $bugFixDescription;
        echo "SIMULATE: SET has submitted a bug fix for: '{$bugFixDescription}'.\n";
    }

    /** @Given the bug fix includes a new unit test `test_discount_for_high_value_orders()` */
    public function theBugFixIncludesANewUnitTestTest_discount_for_high_value_orders(): void // Method name simplified
    {
        if ($this->submittedBugFixDescription !== "Incorrect discount calculation for orders over $100.") {
            throw new \Exception("This step is specific to the discount calculation bug fix.");
        }
        $this->includedUnitTestName = "test_discount_for_high_value_orders()";
        echo "SIMULATE: The bug fix includes a new unit test: '{$this->includedUnitTestName}'.\n";
    }

    /** @When ES (or another designated reviewer) reviews the bug fix */
    public function esOrAnotherDesignatedReviewerReviewsTheBugFix2(): void
    {
        if ($this->includedUnitTestName === null) {
            throw new \Exception("No unit test was included with the bug fix to review.");
        }
        echo "SIMULATE: ES (or another reviewer) is reviewing the bug fix for: '{$this->submittedBugFixDescription}' including test '{$this->includedUnitTestName}'.\n";
    }

    /** @Then the reviewer MUST verify that `test_discount_for_high_value_orders()` specifically reproduces the original discount bug conditions */
    public function theReviewerMustVerifyThatTest_discount_for_high_value_ordersSpecificallyReproducesTheOriginalDiscountBugConditions(): void // Method name simplified
    {
        if ($this->includedUnitTestName !== "test_discount_for_high_value_orders()") {
            throw new \Exception("Reviewing wrong test or test not specified.");
        }
        $this->reviewerVerifiedBugReproduction = true;
        echo "SIMULATE: Reviewer verifies that '{$this->includedUnitTestName}' reproduces original bug conditions.\n";
    }

    /** @Then the reviewer MUST verify that the test passes with the fix applied */
    public function theReviewerMustVerifyThatTheTestPassesWithTheFixApplied(): void
    {
        if (!$this->reviewerVerifiedBugReproduction) {
            throw new \Exception("Bug reproduction by test was not verified.");
        }
        $this->reviewerVerifiedTestPassesWithFix = true;
        echo "SIMULATE: Reviewer verifies that '{$this->includedUnitTestName}' passes with the fix applied.\n";
    }

    /** @Then the reviewer confirms the test has been added to the test suite. */
    public function theReviewerConfirmsTheTestHasBeenAddedToTheTestSuite(): void
    {
        if (!$this->reviewerVerifiedTestPassesWithFix) {
            throw new \Exception("Test passing with fix was not verified.");
        }
        $this->reviewerConfirmedTestInSuite = true;
        echo "SIMULATE: Reviewer confirms '{$this->includedUnitTestName}' has been added to the test suite.\n";

        // Final assertions for this scenario path
        if (!($this->submittedBugFixDescription === "Incorrect discount calculation for orders over $100." &&
              $this->includedUnitTestName === "test_discount_for_high_value_orders()" &&
              $this->reviewerVerifiedBugReproduction &&
              $this->reviewerVerifiedTestPassesWithFix &&
              $this->reviewerConfirmedTestInSuite)) {
            throw new \Exception("Scenario (US-QUAL-01, Scenario 2) did not complete as expected.");
        }
    }
    //</editor-fold>

    public function reviewerConfirmedTestInSuite(): void
    {
        // For the purpose of this test, we assume this action is done.
        if ($this->submittedBugFixDescription && $this->includedUnitTestName && $this->reviewerVerifiedBugReproduction && $this->reviewerVerifiedTestPassesWithFix) {
            $this->reviewerConfirmedTestInSuite = true;
            echo "SIMULATE: Reviewer confirmed that test {$this->includedUnitTestName} for fix '{$this->submittedBugFixDescription}' is in the test suite.\\n";
        } else {
            throw new \Exception("Cannot confirm test in suite without prior steps being completed.");
        }
    }

    #[Given('SET needs early feedback from another SET member (or a data architect role) before proceeding further')]
    public function setNeedsEarlyFeedbackFromAnotherSetMemberOrADataArchitectRoleBeforeProceedingFurther(): void
    {
        throw new PendingException();
    }

    #[Given('the AI team has defined handoff templates including:')]
    public function theAiTeamHasDefinedHandoffTemplatesIncluding(TableNode $table): void
    {
        throw new PendingException();
    }

    #[Given('ES needs to assign US-FEAT-:arg2 (:arg1) to SET')]
    public function esNeedsToAssignUsFeatToSet($arg1, $arg2): void
    {
        throw new PendingException();
    }

    #[When('ES prepares the handoff message to SET')]
    public function esPreparesTheHandoffMessageToSet(): void
    {
        throw new PendingException();
    }

    #[Then('ES MUST use the :arg1 template')]
    public function esMustUseTheTemplate($arg1): void
    {
        throw new PendingException();
    }

    #[Then('the message includes :arg1')]
    public function theMessageIncludes($arg1): void
    {
        throw new PendingException();
    }

    #[Given('SET has completed the backend logic for US-FEAT-:arg1')]
    public function setHasCompletedTheBackendLogicForUsFeat($arg1): void
    {
        throw new PendingException();
    }

    #[Given('the files `auth_controller.php` and `user_model.php` were modified')]
    public function theFilesAuth_ControllerphpAndUser_ModelphpWereModified(): void
    {
        throw new PendingException();
    }

    #[Given('the new function `authenticate_user()` in `auth_controller.php` needs documentation')]
    public function theNewFunctionAuthenticate_UserInAuth_ControllerphpNeedsDocumentation(): void
    {
        throw new PendingException();
    }

    #[When('SET prepares the handoff message to CTW')]
    public function setPreparesTheHandoffMessageToCtw(): void
    {
        throw new PendingException();
    }

    #[Then('SET MUST use the :arg1 template')]
    public function setMustUseTheTemplate($arg1): void // Duplicated from an earlier snippet, but Behat might generate based on context. Let's keep one.
    {
        throw new PendingException();
    }

    #[Given('SET is working on US-DB-:arg2 (:arg1)')]
    public function setIsWorkingOnUsDb($arg1, $arg2): void
    {
        throw new PendingException();
    }

    #[Given('SET discovers they need read-only access to a production database replica which they don\'t have')]
    public function setDiscoversTheyNeedReadOnlyAccessToAProductionDatabaseReplicaWhichTheyDontHave(): void
    {
        throw new PendingException();
    }

    #[When('SET prepares a message to ES about the blocker')]
    public function setPreparesAMessageToEsAboutTheBlocker(): void
    {
        throw new PendingException();
    }

    //<editor-fold desc="US-QUAL-03 Steps">

    /**
     * @Given the framework's command-line interface (CLI) is available
     */
    public function theFrameworksCommandLineInterfaceCliIsAvailable(): void
    {
        // For simulation, we assume it's always available.
        // In a real test, this might check for an executable or a running service.
        echo "SIMULATE: Framework's CLI is assumed to be available.\n";
    }

    /**
     * @When the user executes the help command (e.g., "framework --help")
     */
    public function theUserExecutesTheHelpCommandEgFrameworkHelp(): void
    {
        $this->cliCommandExecuted = "framework --help";
        // Simulate execution
        $this->cliOutput = "Usage: framework [command] [options]\nCommands:\n  --version  Display framework version\n  --help     Display this help message\nOptions:\n  --verbose  Enable verbose output";
        echo "SIMULATE: User executed '{$this->cliCommandExecuted}'. Output: {$this->cliOutput}\n";
    }

    /**
     * @Then the CLI SHOULD display comprehensive help information
     */
    public function theCliShouldDisplayComprehensiveHelpInformation(): void
    {
        if (empty($this->cliOutput)) {
            throw new \Exception("CLI output is empty. Help information was not displayed.");
        }
        // Basic check for some output
        $this->cliHelpDisplayed = !empty($this->cliOutput) && str_contains($this->cliOutput, "Usage:");
        if (!$this->cliHelpDisplayed) {
            throw new \Exception("CLI did not display comprehensive help information. Output: {$this->cliOutput}");
        }
        echo "SIMULATE: Verified CLI displayed comprehensive help information.\n";
    }

    /**
     * @Then the help information SHOULD include available commands and options
     */
    public function theHelpInformationShouldIncludeAvailableCommandsAndOptions(): void
    {
        if (!$this->cliHelpDisplayed) {
            throw new \Exception("Help information was not displayed, cannot check for commands/options.");
        }
        $this->cliHelpIncludesCommandsOptions = str_contains($this->cliOutput, "Commands:") && str_contains($this->cliOutput, "Options:");
        if (!$this->cliHelpIncludesCommandsOptions) {
            throw new \Exception("Help information did not include available commands and options. Output: {$this->cliOutput}");
        }
        echo "SIMULATE: Verified help information includes commands and options.\n";
    }

    /**
     * @Then the help information SHOULD be clearly formatted and easy to understand.
     */
    public function theHelpInformationShouldBeClearlyFormattedAndEasyToUnderstand(): void
    {
        if (!$this->cliHelpDisplayed) {
            throw new \Exception("Help information was not displayed, cannot check formatting.");
        }
        // This is subjective, so for simulation, we'll assume it's true if it contains basic structure.
        // A real test might involve more sophisticated parsing or pattern matching.
        $this->cliHelpIsClear = (bool)preg_match("/Usage:.*\nCommands:.*\nOptions:/s", $this->cliOutput);
        if (!$this->cliHelpIsClear) {
            throw new \Exception("Help information does not appear clearly formatted. Output: {$this->cliOutput}");
        }
        echo "SIMULATE: Verified help information is clearly formatted and easy to understand (simulated check).\n";

        // Final assertions for this scenario path
        if (!($this->cliCommandExecuted === "framework --help" &&
              $this->cliHelpDisplayed &&
              $this->cliHelpIncludesCommandsOptions &&
              $this->cliHelpIsClear)) {
            throw new \Exception("Scenario 'Requesting Help Information' (US-QUAL-03) did not complete as expected.");
        }
    }

    /**
     * @When the user executes an invalid command (e.g., "framework non_existent_command")
     */
    public function theUserExecutesAnInvalidCommandEgFrameworkNon_existent_command(): void
    {
        $this->cliCommandExecuted = "framework non_existent_command";
        // Simulate execution and error output
        $this->cliOutput = "Error: Command 'non_existent_command' not recognized.\nTry 'framework --help' for a list of available commands.";
        $this->cliErrorDisplayed = true; // Assume error is always displayed for this simulation
        echo "SIMULATE: User executed invalid command '{$this->cliCommandExecuted}'. Output: {$this->cliOutput}\n";
    }

    /**
     * @Then the CLI SHOULD display a clear error message
     */
    public function theCliShouldDisplayAClearErrorMessage(): void
    {
        if (!$this->cliErrorDisplayed || empty($this->cliOutput)) {
            throw new \Exception("CLI did not display a clear error message or output is empty. Output: {$this->cliOutput}");
        }
        // For simulation, any output when an error is expected is considered a clear error message.
        // A real test might check for keywords like "Error:".
        if (!str_starts_with($this->cliOutput, "Error:")) {
             throw new \Exception("CLI error message does not seem clear (missing 'Error:' prefix). Output: {$this->cliOutput}");
        }
        echo "SIMULATE: Verified CLI displayed a clear error message.\n";
    }

    /**
     * @Then the error message SHOULD indicate that the command is not recognized
     */
    public function theErrorMessageShouldIndicateThatTheCommandIsNotRecognized(): void
    {
        if (!$this->cliErrorDisplayed) {
            throw new \Exception("No error message displayed, cannot check content.");
        }
        $this->cliErrorIndicatesCommandNotRecognized = str_contains($this->cliOutput, "not recognized");
        if (!$this->cliErrorIndicatesCommandNotRecognized) {
            throw new \Exception("Error message did not indicate that the command is not recognized. Output: {$this->cliOutput}");
        }
        echo "SIMULATE: Verified error message indicates command not recognized.\n";
    }

    /**
     * @Then the error message SHOULD suggest trying the help command for available commands.
     */
    public function theErrorMessageShouldSuggestTryingTheHelpCommandForAvailableCommands(): void
    {
        if (!$this->cliErrorDisplayed) {
            throw new \Exception("No error message displayed, cannot check suggestion.");
        }
        $this->cliErrorSuggestsHelp = str_contains($this->cliOutput, "--help");
        if (!$this->cliErrorSuggestsHelp) {
            throw new \Exception("Error message did not suggest trying the help command. Output: {$this->cliOutput}");
        }
        echo "SIMULATE: Verified error message suggests trying the help command.\n";

        // Final assertions for this scenario path
        if (!($this->cliCommandExecuted === "framework non_existent_command" &&
              $this->cliErrorDisplayed &&
              str_starts_with($this->cliOutput, "Error:") && // Re-check clear error for assertion
              $this->cliErrorIndicatesCommandNotRecognized &&
              $this->cliErrorSuggestsHelp)) {
            throw new \Exception("Scenario 'Handling Invalid Command' (US-QUAL-03) did not complete as expected.");
        }
    }

    /**
     * @Given a basic valid command :command exists
     */
    public function aBasicValidCommandExists(string $command): void
    {
        // For simulation, we assume specific commands like "framework --version" always exist.
        // In a real test, this might involve checking a list of known valid commands
        // or verifying command registration in the framework.
        if ($command !== "framework --version") {
            throw new PendingException("Existence check for command '{$command}' not implemented yet.");
        }
        echo "SIMULATE: Assumed basic valid command '{$command}' exists.\n";
    }

    /**
     * @When the user executes :command
     */
    public function theUserExecutes(string $command): void
    {
        $this->cliCommandExecuted = $command;
        if ($command === "framework --version") {
            $this->cliOutput = "Framework Version 1.0.0"; // Simulate output
            $this->cliCommandSuccessful = true;
        } else {
            // Default behavior for other commands if not specifically handled
            $this->cliOutput = "Executing {$command}...";
            $this->cliCommandSuccessful = true; // Assume success for simulation unless specified
            // throw new PendingException("Execution logic for command '{$command}' not implemented yet.");
        }
        echo "SIMULATE: User executed '{$this->cliCommandExecuted}'. Output: {$this->cliOutput}\n";
    }

    /**
     * @Then the CLI SHOULD execute the command successfully
     */
    public function theCliShouldExecuteTheCommandSuccessfully(): void
    {
        if (!$this->cliCommandSuccessful) {
            throw new \Exception("CLI command '{$this->cliCommandExecuted}' did not execute successfully. Output: {$this->cliOutput}");
        }
        echo "SIMULATE: Verified CLI command '{$this->cliCommandExecuted}' executed successfully.\n";
    }

    /**
     * @Then the CLI SHOULD display the framework's current version information
     */
    public function theCliShouldDisplayTheFrameworksCurrentVersionInformation(): void
    {
        if (!$this->cliCommandSuccessful || empty($this->cliOutput)) {
            throw new \Exception("Command was not successful or output is empty, cannot display version. Output: {$this->cliOutput}");
        }
        // Simple check for version-like string
        if (str_contains($this->cliOutput, "Version")) {
            $this->cliVersionDisplayed = $this->cliOutput;
        } else {
            throw new \Exception("CLI did not display version information. Output: {$this->cliOutput}");
        }
        echo "SIMULATE: Verified CLI displayed framework version information: {$this->cliVersionDisplayed}\n";
    }

    /**
     * @Then the output SHOULD be concise and accurate.
     */
    public function theOutputShouldBeConciseAndAccurate(): void
    {
        if ($this->cliVersionDisplayed === null) {
            throw new \Exception("Version information was not displayed, cannot check conciseness/accuracy.");
        }
        // This is subjective. For simulation, we assume it's true if a version was displayed.
        // A real test might check length, specific format (e.g., Semantic Versioning), etc.
        $this->cliOutputConciseAndAccurate = (bool)preg_match("/Version\s+\d+\.\d+\.\d+/", $this->cliVersionDisplayed);
        if (!$this->cliOutputConciseAndAccurate) {
            throw new \Exception("Output does not appear concise and accurate (e.g., not matching 'Version X.Y.Z'). Output: {$this->cliVersionDisplayed}");
        }
        echo "SIMULATE: Verified output is concise and accurate (simulated check).\n";

        // Final assertions for this scenario path
        if (!($this->cliCommandExecuted === "framework --version" &&
              $this->cliCommandSuccessful &&
              $this->cliVersionDisplayed !== null &&
              $this->cliOutputConciseAndAccurate)) {
            throw new \Exception("Scenario 'Successful Execution of a Basic Valid Command' (US-QUAL-03) did not complete as expected.");
        }
    }

    /**
     * @Given the :command command was previously working correctly
     */
    public function theCommandWasPreviouslyWorkingCorrectly(string $command): void
    {
        // For simulation, we assume this is true. In a real system, this might involve checking a baseline state.
        echo "SIMULATE: Assumed '{$command}' was previously working correctly.\n";
    }

    /**
     * @Given after a recent change, the :command command now shows an error or incorrect information (a usability regression)
     */
    public function afterARecentChangeTheCommandNowShowsAnErrorOrIncorrectInformationAUsabilityRegression(string $command): void
    {
        $this->regressedCommand = $command;
        // Simulate the regression by setting an error state for this command
        if ($command === "framework --help") {
            $this->cliOutput = "Error: Help system malfunction."; // Simulate error
            $this->cliHelpDisplayed = false; // Help is not displayed correctly
            $this->cliErrorDisplayed = true;
        }
        echo "SIMULATE: A recent change caused '{$this->regressedCommand}' to show an error/incorrect info: '{$this->cliOutput}'.\n";
    }

    /**
     * @When ES confirms the regression with SET
     */
    public function esConfirmsTheRegressionWithSet(): void
    {
        if ($this->regressedCommand === null || !$this->cliErrorDisplayed) {
            throw new \Exception("No regression or error confirmed to discuss with SET.");
        }
        // Simulate confirmation
        echo "SIMULATE: ES confirmed the regression of '{$this->regressedCommand}' with SET.\n";
    }

    /**
     * @Then ES MUST initiate a brief Root Cause Analysis (RCA) with SET for the :command regression.
     */
    public function esMustInitiateABriefRootCauseAnalysisRcaWithSetForTheRegression(string $command): void
    {
        if ($this->regressedCommand !== $command || !$this->cliErrorDisplayed) {
            throw new \Exception("Cannot initiate RCA: Regression for '{$command}' not confirmed or no error state.");
        }
        $this->rcaInitiated = true;
        echo "SIMULATE: ES initiated a brief RCA with SET for the '{$command}' regression.\n";

        // Final assertions for this scenario path
        if (!($this->regressedCommand === "framework --help" &&
              $this->cliErrorDisplayed && // Confirms the regression state
              $this->rcaInitiated)) {
            throw new \Exception("Scenario 'RCA for Usability Regression (Example: Help Command Broken)' (US-QUAL-03) did not complete as expected.");
        }
    }

    /**
     * @Given ES and SET are conducting an RCA for the :command regression
     */
    public function esAndSetAreConductingAnRcaForTheRegression(string $command): void
    {
        // This step often follows the previous scenario. We ensure RCA was initiated.
        if (!$this->rcaInitiated || $this->regressedCommand !== $command) {
            throw new \Exception("RCA not initiated or regressed command mismatch for '{$command}'. Current regressed: '{$this->regressedCommand}'. RCA initiated: " . ($this->rcaInitiated ? 'Yes' : 'No'));
        }
        echo "SIMULATE: ES and SET are conducting an RCA for the '{$command}' regression.\n";
    }

    /**
     * @When they investigate why existing tests (if any) did not catch this usability regression
     */
    public function theyInvestigateWhyExistingTestsIfAnyDidNotCatchThisUsabilityRegression(): void
    {
        if (!$this->rcaInitiated) {
            throw new \Exception("RCA not initiated, cannot investigate test coverage.");
        }
        $this->rcaInvestigatedTestCoverage = true;
        // Simulate finding: Perhaps existing tests were too generic or didn't cover specific help output content.
        echo "SIMULATE: Investigated why existing tests did not catch the '{$this->regressedCommand}' regression. (Assumed finding: Tests were not specific enough for help content).\n";
    }

    /**
     * @When they determine the regression was caused by a refactoring error in the command parsing module
     */
    public function theyDetermineTheRegressionWasCausedByARefactoringErrorInTheCommandParsingModule(): void
    {
        if (!$this->rcaInvestigatedTestCoverage) {
            throw new \Exception("Test coverage investigation step not completed, cannot determine root cause yet.");
        }
        $this->rcaRootCause = "Refactoring error in the command parsing module.";
        echo "SIMULATE: Determined root cause for '{$this->regressedCommand}' regression: {$this->rcaRootCause}\n";
    }

    /**
     * @Then the RCA output MUST document this root cause
     */
    public function theRcaOutputMustDocumentThisRootCause(): void
    {
        if ($this->rcaRootCause === null) {
            throw new \Exception("Root cause not determined, cannot document in RCA output.");
        }
        // In a real scenario, this would involve writing to an RCA document or system.
        // For simulation, we just confirm the property is set.
        echo "SIMULATE: RCA output (simulated) documents root cause: {$this->rcaRootCause}\n";
    }

    /**
     * @Then the RCA output MUST include an action item: :actionItem
     */
    public function theRcaOutputMustIncludeAnActionItem(string $actionItem): void
    {
        if ($this->rcaRootCause === null) { // Dependent on root cause being found
            throw new \Exception("Root cause not determined, cannot add action item to RCA output.");
        }
        $expectedActionItem = "Fix the command parsing module and add/update tests for the help command output.";
        if ($actionItem !== $expectedActionItem) {
            throw new \Exception("Provided action item '{$actionItem}' does not match expected '{$expectedActionItem}'.");
        }
        $this->rcaActionItem = $actionItem;
        // Simulate adding to RCA output
        echo "SIMULATE: RCA output (simulated) includes action item: {$this->rcaActionItem}\n";

        // Final assertions for this scenario path
        if (!($this->regressedCommand === "framework --help" &&
              $this->rcaInitiated &&
              $this->rcaInvestigatedTestCoverage &&
              $this->rcaRootCause === "Refactoring error in the command parsing module." &&
              $this->rcaActionItem === $expectedActionItem)) {
            throw new \Exception("Scenario 'Conducting RCA for Usability Regression and Identifying Actions' (US-QUAL-03) did not complete as expected.");
        }
    }

    //</editor-fold>
} 