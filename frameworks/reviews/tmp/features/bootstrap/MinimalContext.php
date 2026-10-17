<?php
use Behat\Behat\Context\Context;

class MinimalContext implements Context
{
    /**
     * @Given I have a simple test step
     */
    public function iHaveASimpleTestStep()
    {
        // Intentionally empty - just testing bootstrap
    }

    /**
     * @When I run this test
     */
    public function iRunThisTest()
    {
        // Intentionally empty - just testing bootstrap
    }

    /**
     * @Then it should execute properly
     */
    public function itShouldExecuteProperly()
    {
        // Intentionally empty - just testing bootstrap
    }
}