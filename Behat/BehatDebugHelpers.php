<?php
// .cursor/Behat/BehatDebugHelpers.php

namespace CursorCI\Behat;

use Behat\Mink\Session;
use Behat\Mink\Driver\Selenium2Driver; // For screenshot capability

trait BehatDebugHelpers
{
    /**
     * Dumps the current page's HTML to a timestamped file.
     *
     * @param Session $session The Mink session.
     * @param string $fileNamePrefix Prefix for the dump file.
     * @return string The path to the dumped HTML file.
     */
    protected function dumpPageHtml(Session $session, string $fileNamePrefix = 'page_dump'): string
    {
        $html = $session->getPage()->getOuterHtml();
        $dumpDir = '.reports/behat/dumps';
        if (!is_dir($dumpDir)) {
            mkdir($dumpDir, 0777, true);
        }
        $filePath = sprintf('%s/%s_%s.html', $dumpDir, $fileNamePrefix, date('Ymd_His'));
        file_put_contents($filePath, $html);
        echo "Page HTML dumped to: " . $filePath . "\n";
        return $filePath;
    }

    /**
     * Takes a screenshot if the driver supports it and saves it to a timestamped file.
     *
     * @param Session $session The Mink session.
     * @param string $fileNamePrefix Prefix for the screenshot file.
     * @return string|null The path to the screenshot file, or null if not supported/failed.
     */
    protected function takeScreenshot(Session $session, string $fileNamePrefix = 'screenshot'): ?string
    {
        $driver = $session->getDriver();
        if ($driver instanceof Selenium2Driver) { // Check if driver is Selenium2Driver or similar that supports screenshots
            try {
                $screenshotData = $driver->getScreenshot();
                $dumpDir = '.reports/behat/dumps';
                if (!is_dir($dumpDir)) {
                    mkdir($dumpDir, 0777, true);
                }
                $filePath = sprintf('%s/%s_%s.png', $dumpDir, $fileNamePrefix, date('Ymd_His'));
                file_put_contents($filePath, $screenshotData);
                echo "Screenshot saved to: " . $filePath . "\n";
                return $filePath;
            } catch (\Exception $e) {
                echo "Failed to take screenshot: " . $e->getMessage() . "\n";
                return null;
            }
        } else {
            echo "Screenshot not supported by current driver: " . get_class($driver) . "\n";
            return null;
        }
    }

    /**
     * Dumps current URL and cookies.
     *
     * @param Session $session The Mink session.
     */
    protected function dumpSessionInfo(Session $session): void
    {
        echo "DEBUG: Current URL: " . $session->getCurrentUrl() . "\n";
        if ($session->getDriver() instanceof Selenium2Driver) {
            try {
                $cookies = $session->evaluateScript('return document.cookie;');
                echo "DEBUG: Cookies (raw string for Selenium2Driver): " . ($cookies ?: "N/A") . "\n";
            } catch (\Exception $e) {
                echo "DEBUG: Could not retrieve cookies via JavaScript: " . $e->getMessage() . "\n";
            }
        } else {
            // For non-Selenium2 drivers (like BrowserKit), document.cookie is not available.
            // We can try to get specific known cookies using $session->getCookie('cookie_name')
            // but a general dump of all cookies is not straightforwardly available across all drivers.
            echo "DEBUG: Cookie dump for non-Selenium2Driver (e.g., BrowserKit) is limited. Specific cookies can be checked with \$session->getCookie('name').\n";
        }
    }

    /**
     * A combined debug dump for convenience on step failure.
     * To be called from a @AfterStep hook or directly in a failing step.
     *
     * @param Session $session
     * @param string $dumpPrefix
     */
    protected function comprehensiveDebugDump(Session $session, string $dumpPrefix = 'debug_info'): void
    {
        echo "DEBUG: --- Comprehensive Debug Dump for: $dumpPrefix ---\n";
        $this->dumpSessionInfo($session);
        $htmlPath = $this->dumpPageHtml($session, $dumpPrefix . '_page');
        echo "DEBUG: Page HTML dumped to: $htmlPath\n";
        $screenshotPath = $this->takeScreenshot($session, $dumpPrefix . '_screenshot');
        if ($screenshotPath) {
            echo "DEBUG: Screenshot saved to: $screenshotPath\n";
        } else {
            echo "DEBUG: Screenshot not taken (driver might not support it or an error occurred).\n";
        }
        echo "DEBUG: --- End of Debug Dump ---\n";
    }
} 