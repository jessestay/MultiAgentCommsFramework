from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
import scrape_email_google_mexico
import linkedin_dmer
from google_sheets_handler import GoogleSheetsHandler
import logging
from datetime import datetime
import os
from dotenv import load_dotenv
import time
import sys

# Load environment variables
load_dotenv()

def setup_logging():
    """Setup logging configuration"""
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = f'logs/automation_{timestamp}.log'
    
    # Remove any existing handlers
    root = logging.getLogger()
    if root.handlers:
        for handler in root.handlers:
            root.removeHandler(handler)
            
    # Configure file handler
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.INFO)
    file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(file_formatter)
    
    # Configure console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter('%(levelname)s: %(message)s')
    console_handler.setFormatter(console_formatter)
    
    # Add both handlers to root logger
    root.setLevel(logging.INFO)
    root.addHandler(file_handler)
    root.addHandler(console_handler)
    
    return log_file

SPREADSHEET_ID = os.getenv('GOOGLE_SHEETS_ID')
sheets_handler = GoogleSheetsHandler(SPREADSHEET_ID)

def run_scraper():
    """Run the LinkedIn profile scraper"""
    try:
        scrape_email_google_mexico.setup_logging()
        logging.info("Starting LinkedIn scraper")
        
        # Set 1 hour timeout
        MAX_RUNTIME = 3600  # seconds (1 hour)
        start_time = datetime.now()
        
        try:
            results_df = scrape_email_google_mexico.main()
            if results_df is not None and not results_df.empty:
                scrape_email_google_mexico.save_results(results_df)
                
        except KeyboardInterrupt:
            logging.info("Scraper interrupted by user")
            raise
        except Exception as e:
            logging.error(f"Scraper iteration failed: {str(e)}")
            
    except KeyboardInterrupt:
        logging.info("Automation interrupted by user")
        sys.exit(0)
    except Exception as e:
        logging.error(f"Scraper error: {str(e)}")

def run_messenger():
    """Run the LinkedIn messenger"""
    try:
        linkedin_dmer.setup_logging()
        logging.info("Starting LinkedIn messenger")
        
        # Set 1 hour timeout
        MAX_RUNTIME = 3600  # seconds (1 hour)
        start_time = datetime.now()
        
        # Test Google Sheets connection first
        try:
            profiles_to_message = sheets_handler.get_unmessaged_profiles()
            logging.info(f"Found {len(profiles_to_message)} profiles to message")
        except Exception as e:
            logging.error(f"Failed to get profiles to message: {str(e)}")
            return
            
        # Initialize LinkedIn DM script
        driver = linkedin_dmer.setup_driver()
        try:
            linkedin_dmer.login_to_linkedin(driver)
            
            for profile in profiles_to_message:
                # Check timeout
                if (datetime.now() - start_time).total_seconds() > MAX_RUNTIME:
                    logging.info("Messenger timeout reached")
                    break
                    
                try:
                    success = linkedin_dmer.send_message(
                        driver=driver,
                        profile=profile['url'],
                        name=profile['name'],
                        message_text=profile['message']
                    )
                    
                    # Update status in Google Sheets
                    status = "Sent" if success else "Failed"
                    sheets_handler.update_message_status(profile['url'], status)
                    
                except Exception as e:
                    logging.error(f"Error messaging {profile['url']}: {str(e)}")
                    sheets_handler.update_message_status(profile['url'], "Failed")
                    
        finally:
            if driver:
                try:
                    driver.quit()
                except:
                    pass
                    
        logging.info("Messenger run complete")
                
    except Exception as e:
        logging.error(f"Messenger error: {str(e)}", exc_info=True)

def main():
    try:
        setup_logging()  # Set up automation logging first
        run_scraper()
        run_messenger()
    except KeyboardInterrupt:
        logging.info("Automation terminated by user")
        sys.exit(0)

if __name__ == "__main__":
    main() 