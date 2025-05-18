<?php
/**
 * PHPUnit bootstrap file for unit tests.
 */

// Composer autoloader.
require_once dirname(__DIR__) . '/vendor/autoload.php'; // Corrected path

// WP_Mock setup if used globally (often done in test case setUp methods too)
// if (class_exists('WP_Mock')) {
// WP_Mock::bootstrap();
// } 