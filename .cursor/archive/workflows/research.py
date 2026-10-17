"""Profile research workflow for LinkedIn"""
import logging
import os
import time
import random
from datetime import datetime

from core.account_manager import LinkedInAccountManager
from core.database_manager import DatabaseManager
from utils.config import get_config

class LinkedInResearchWorkflow:
    """Handles the research workflow for LinkedIn profiles"""
    
    def __init__(self, headless=False):
        self.account_manager = LinkedInAccountManager()
        self.db_manager = DatabaseManager()
        self.headless = headless
        
        # Import here to avoid circular imports
        from workflows.profile_viewer import SafeProfileViewer
        self.profile_viewer = SafeProfileViewer(
            self.account_manager, 
            self.db_manager, 
            headless=self.headless
        )
        
    def run(self, url_file, limit=10):
        """Run the research workflow on a list of URLs"""
        # Load configuration
        min_delay = get_config('research', 'min_delay_between_profiles')
        max_delay = get_config('research', 'max_delay_between_profiles')
        
        # Load URLs
        with open(url_file, 'r') as f:
            urls = [line.strip() for line in f if line.strip()]
        
        urls = urls[:limit]
        logging.info(f"Loaded {len(urls)} URLs for processing")
        
        # Process URLs
        results = {
            'success': 0,
            'failure': 0,
            'profiles': []
        }
        
        for i, url in enumerate(urls):
            logging.info(f"Processing URL {i+1}/{len(urls)}: {url}")
            
            result = self.profile_viewer.view_profile(url)
            
            if result['success']:
                logging.info(f"Successfully processed {url}")
                results['success'] += 1
                results['profiles'].append({
                    'url': url,
                    'name': result.get('data', {}).get('name', ''),
                    'status': 'success'
                })
                
                # Wait before next profile if there are more
                if i < len(urls) - 1:
                    delay = random.uniform(min_delay, max_delay)
                    logging.info(f"Waiting {delay:.1f} seconds before next profile...")
                    time.sleep(delay)
            else:
                logging.warning(f"Failed to process {url}: {result.get('error', 'Unknown error')}")
                results['failure'] += 1
                results['profiles'].append({
                    'url': url,
                    'error': result.get('error', 'Unknown error'),
                    'status': 'failure'
                })
        
        logging.info(f"Research workflow completed. Processed {len(urls)} URLs.")
        logging.info(f"Success: {results['success']}, Failure: {results['failure']}")
        
        return results 