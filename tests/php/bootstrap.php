<?php
/**
 * PHPUnit bootstrap file.
 *
 * @package MultiAgentCommsFramework
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    // Check if the WordPress test environment is loaded.
    // This often defines ABSPATH.
    // If not, we might be in a non-WP context or bootstrap needs more setup.
    // For now, we will assume composer's autoloader is the main requirement.
}

// Composer autoloader.
$composer_autoloader = dirname( __DIR__, 2 ) . '/vendor/autoload.php';

if ( ! file_exists( $composer_autoloader ) ) {
    echo "Composer autoload.php not found at {$composer_autoloader}. Did you run composer install?\n";
    exit( 1 );
}

require_once $composer_autoloader;

// Further WordPress environment loading (if needed for integration tests)
// might go here, or be handled by a specific Test Case parent class. 