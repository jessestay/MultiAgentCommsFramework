"""
Logger utility module.

This module provides logging functionality for the Calendar & Task Integration System.
"""

import os
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def setup_logger(name, log_level=None, log_file=None):
    """
    Set up a logger with the specified name, level, and file.
    
    Args:
        name: The name of the logger.
        log_level: The logging level. If None, uses the LOG_LEVEL environment variable or defaults to INFO.
        log_file: The log file path. If None, uses the LOG_FILE environment variable or defaults to ./logs/calendar_integration.log.
        
    Returns:
        A configured logger instance.
    """
    # Get log level from environment variable or use default
    if log_level is None:
        log_level_str = os.environ.get('LOG_LEVEL', 'INFO').upper()
        log_level = getattr(logging, log_level_str, logging.INFO)
        
    # Get log file from environment variable or use default
    if log_file is None:
        log_file = os.environ.get('LOG_FILE', './logs/calendar_integration.log')
        
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    
    # Create file handler if log file is specified
    if log_file:
        # Create log directory if it doesn't exist
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)
            
        # Create rotating file handler (10 MB max size, keep 5 backup files)
        file_handler = RotatingFileHandler(
            log_file, maxBytes=10*1024*1024, backupCount=5
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        
        # Add file handler to logger
        logger.addHandler(file_handler)
        
    # Add console handler to logger
    logger.addHandler(console_handler)
    
    return logger


# Create a default logger for the package
logger = setup_logger('calendar_integration') 