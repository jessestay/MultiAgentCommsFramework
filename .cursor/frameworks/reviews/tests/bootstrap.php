<?php

declare(strict_types=1);

// tests/bootstrap.php

echo "Simplified Bootstrap Executed - Attempting to include Composer Autoloader...\n";

require_once __DIR__ . '/../vendor/autoload.php';

echo "Composer Autoloader Included via Simplified Bootstrap.\n";

// End of simplified bootstrap. Behat should handle context autoloading via behat.yml 