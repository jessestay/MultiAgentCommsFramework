"""Example workflow for LinkedIn research"""
import argparse
import logging
import os
from datetime import datetime
import time
import random

from account_manager import LinkedInAccountManager
from safe_profile_viewer import SafeProfileViewer
from database_manager import DatabaseManager
from config import get_config, Config

def setup_logging():
    """Set up logging"""
    logs_dir = get_config('paths', 'logs_dir')
    os.makedirs(logs_dir, exist_ok=True)
    
    log_file = os.path.join(logs_dir, f"linkedin_research_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )

def research_workflow(url_file, limit=10, headless=False):
    """Run a complete research workflow"""
    # Load configuration
    min_delay = get_config('research', 'min_delay_between_profiles')
    max_delay = get_config('research', 'max_delay_between_profiles')
    
    # Initialize components
    account_manager = LinkedInAccountManager()
    db_manager = DatabaseManager()
    viewer = SafeProfileViewer(account_manager, db_manager, headless=headless)
    
    # Load URLs
    with open(url_file, 'r') as f:
        urls = [line.strip() for line in f if line.strip()]
    
    urls = urls[:limit]
    logging.info(f"Loaded {len(urls)} URLs for processing")
    
    # Process URLs
    for i, url in enumerate(urls):
        logging.info(f"Processing URL {i+1}/{len(urls)}: {url}")
        success = viewer.view_and_save_profile(url)
        
        if success:
            logging.info(f"Successfully processed {url}")
            
            if i < len(urls) - 1:
                delay = random.uniform(min_delay, max_delay)
                logging.info(f"Waiting {delay:.1f} seconds before next profile...")
                time.sleep(delay)
        else:
            logging.warning(f"Failed to process {url}")
    
    logging.info(f"Research workflow completed. Processed {len(urls)} URLs.")

if __name__ == "__main__":
    # Set up logging
    setup_logging()
    
    # Create argument parser
    parser = argparse.ArgumentParser(description='LinkedIn Research Workflow')
    parser.add_argument('--urls', required=True, help='File with LinkedIn profile URLs')
    parser.add_argument('--limit', type=int, default=10, help='Number of profiles to process')
    parser.add_argument('--headless', action='store_true', help='Run in headless mode')
    
    args = parser.parse_args()
    
    # Run workflow
    research_workflow(args.urls, args.limit, args.headless) 