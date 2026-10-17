#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Role Communication Protocol Test Runner

This script runs tests to verify that all role communications follow the established protocol.
It logs results to a file and creates a notification if issues are found.
"""

import os
import sys
import unittest
import logging
import datetime
from pathlib import Path

# Configure logging
os.makedirs('logs', exist_ok=True)
log_file = f'logs/communication_test_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.log'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger('communication_test_runner')

def run_tests():
    """Run the communication protocol tests."""
    logger.info("Starting communication protocol tests")
    
    # Import the test module
    try:
        from tests.test_role_communication import TestRoleCommunicationProtocol
    except ImportError as e:
        logger.error(f"Failed to import test module: {e}")
        return False
    
    # Create a test suite
    suite = unittest.TestLoader().loadTestsFromTestCase(TestRoleCommunicationProtocol)
    
    # Run the tests
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    
    # Log the results
    logger.info(f"Tests run: {result.testsRun}")
    logger.info(f"Errors: {len(result.errors)}")
    logger.info(f"Failures: {len(result.failures)}")
    
    # Create a notification if there are issues
    if result.errors or result.failures:
        create_notification(result)
        return False
    
    logger.info("All tests passed successfully")
    return True

def create_notification(result):
    """Create a notification file with details of test failures."""
    logger.info("Creating notification for test failures")
    
    notification_dir = 'notifications'
    os.makedirs(notification_dir, exist_ok=True)
    
    notification_file = f'{notification_dir}/communication_protocol_issues_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.txt'
    
    with open(notification_file, 'w') as f:
        f.write("COMMUNICATION PROTOCOL ISSUES DETECTED\n")
        f.write("=====================================\n\n")
        f.write(f"Date: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Tests run: {result.testsRun}\n")
        f.write(f"Errors: {len(result.errors)}\n")
        f.write(f"Failures: {len(result.failures)}\n\n")
        
        if result.errors:
            f.write("ERRORS:\n")
            f.write("======\n\n")
            for test, error in result.errors:
                f.write(f"Test: {test}\n")
                f.write(f"Error: {error}\n\n")
        
        if result.failures:
            f.write("FAILURES:\n")
            f.write("=========\n\n")
            for test, failure in result.failures:
                f.write(f"Test: {test}\n")
                f.write(f"Failure: {failure}\n\n")
        
        f.write("\nPlease review the log file for more details: " + log_file)
    
    logger.info(f"Notification created: {notification_file}")

def main():
    """Main entry point."""
    logger.info("Communication test runner started")
    
    # Run the tests
    success = run_tests()
    
    # Exit with appropriate code
    if success:
        logger.info("Communication test runner completed successfully")
        return 0
    else:
        logger.error("Communication test runner completed with issues")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 