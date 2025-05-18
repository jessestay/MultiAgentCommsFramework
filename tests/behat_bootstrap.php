<?php
// THIS IS THE CORRECT BOOTSTRAP: .cursor/tests/behat_bootstrap.php

$projectRootForBootstrap = __DIR__ . '/../..'; // From .cursor/tests/ to project root
$autoloaderPathForBootstrap = $projectRootForBootstrap . '/vendor/autoload.php';

if (file_exists($autoloaderPathForBootstrap)) {
    require_once $autoloaderPathForBootstrap;
    // fwrite(STDERR, "SUCCESS: Autoloader loaded by: " . __FILE__ . PHP_EOL); // Uncomment for debug
} else {
    fwrite(STDERR, "ERROR IN BEHAT BOOTSTRAP: " . __FILE__ . PHP_EOL);
    fwrite(STDERR, "Autoloader NOT FOUND." . PHP_EOL);
    fwrite(STDERR, "Attempted to load: '" . $autoloaderPathForBootstrap . "'" . PHP_EOL);
    fwrite(STDERR, "__DIR__ in this script was: '" . __DIR__ . "'" . PHP_EOL);
    fwrite(STDERR, "Calculated project root was: '" . $projectRootForBootstrap . "'" . PHP_EOL);
    exit(1);
} 