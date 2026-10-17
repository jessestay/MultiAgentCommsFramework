import os
from datetime import datetime
import logging
from automation_scheduler import run_scraper, run_messenger

# Setup logging
logging.basicConfig(
    filename=f'automation_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

if __name__ == "__main__":
    try:
        logging.info("Starting automation run")
        
        # Run both tasks once
        run_scraper()
        run_messenger()
        
        logging.info("Automation run complete")
    except Exception as e:
        logging.error(f"Automation failed: {str(e)}") 