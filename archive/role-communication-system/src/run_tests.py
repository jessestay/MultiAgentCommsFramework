#!/usr/bin/env python3
"""
Test runner for the role communication system.
Runs all unit tests and verifies system integrity.
"""

import unittest
import sys
import os
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("test_results.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("TestRunner")

def run_tests():
    """Run all unit tests for the role communication system."""
    logger.info("Starting test suite for role communication system")
    
    # Discover and run tests
    test_loader = unittest.TestLoader()
    test_suite = test_loader.discover('tests', pattern='test_*.py')
    
    test_runner = unittest.TextTestRunner(verbosity=2)
    result = test_runner.run(test_suite)
    
    # Log results
    logger.info(f"Tests run: {result.testsRun}")
    logger.info(f"Errors: {len(result.errors)}")
    logger.info(f"Failures: {len(result.failures)}")
    
    # Return success/failure
    return len(result.errors) == 0 and len(result.failures) == 0

def verify_system():
    """Verify system components and dependencies."""
    logger.info("Verifying system components")
    
    # Check required modules
    required_modules = [
        'cryptography',
        'json',
        'threading',
        'configparser'
    ]
    
    missing_modules = []
    for module in required_modules:
        try:
            __import__(module)
            logger.info(f"Module {module} is available")
        except ImportError:
            logger.error(f"Module {module} is missing")
            missing_modules.append(module)
    
    # Check required files
    required_files = [
        'src/message_monitor.py',
        'src/message_processor.py',
        'src/message_encryption.py',
        'src/role_communication.py',
        'src/role_cli.py',
        'config.ini'
    ]
    
    missing_files = []
    for file_path in required_files:
        if not os.path.exists(file_path):
            logger.error(f"Required file {file_path} is missing")
            missing_files.append(file_path)
        else:
            logger.info(f"Required file {file_path} is available")
    
    # Return success/failure
    return len(missing_modules) == 0 and len(missing_files) == 0

def main():
    """Main entry point for the test runner."""
    logger.info("Role Communication System Test Runner")
    
    # Verify system components
    system_ok = verify_system()
    if not system_ok:
        logger.error("System verification failed")
        return 1
    
    # Run tests
    tests_ok = run_tests()
    if not tests_ok:
        logger.error("Tests failed")
        return 1
    
    logger.info("All tests passed and system verification successful")
    return 0

if __name__ == "__main__":
    sys.exit(main()) 