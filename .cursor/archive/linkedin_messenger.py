from messenger_config import setup_messenger_logging
import logging
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import os
from dotenv import load_dotenv
import time

# Import the LinkedInDMer class directly
from linkedin_dmer import LinkedInDMer

from google_sheets_handler import GoogleSheetsHandler

def setup_driver():
    """Setup Chrome driver with appropriate options"""
    print("Setting up Chrome driver...")
    temp_dir = None
    
    try:
        # Create a unique user data directory
        import tempfile
        import uuid
        import subprocess
        
        # Create a unique temporary directory for this session
        temp_dir = os.path.join(tempfile.gettempdir(), f"chrome_profile_{uuid.uuid4().hex}")
        os.makedirs(temp_dir, exist_ok=True)
        print(f"Created temporary user data directory: {temp_dir}")
        
        # Try to find Chrome in more locations
        chrome_path = None
        chrome_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.join(os.environ.get('LOCALAPPDATA', ''), r"Google\Chrome\Application\chrome.exe"),
        ]
        
        for path in chrome_paths:
            if os.path.exists(path):
                chrome_path = path
                print(f"Found Chrome at: {path}")
                break
                    
        if not chrome_path:
            # Try to find Chrome in PATH
            try:
                import shutil
                chrome_in_path = shutil.which('chrome')
                if chrome_in_path:
                    chrome_path = chrome_in_path
                    print(f"Found Chrome in PATH: {chrome_path}")
            except Exception as e:
                print(f"Error finding Chrome in PATH: {e}")

        if not chrome_path:
            print("Chrome binary not found. Will try to use default browser.")
            
        # Try using undetected_chromedriver first
        try:
            import undetected_chromedriver as uc
            print("Using undetected_chromedriver")
            options = uc.ChromeOptions()
            options.add_argument('--disable-gpu')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-notifications')
            options.add_argument(f'--user-data-dir={temp_dir}')
            
            if chrome_path:
                options.binary_location = chrome_path
                print(f"Setting Chrome binary location to: {chrome_path}")
            
            driver = uc.Chrome(options=options)
            print("Chrome driver initialized successfully with undetected_chromedriver")
            return driver, temp_dir
        except Exception as uc_error:
            print(f"Failed to initialize with undetected_chromedriver: {uc_error}")
            
        # Regular selenium approach as fallback
        from selenium.webdriver.chrome.service import Service
        from webdriver_manager.chrome import ChromeDriverManager
        
        chrome_options = Options()
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-notifications')
        chrome_options.add_argument(f'--user-data-dir={temp_dir}')
        chrome_options.add_experimental_option('excludeSwitches', ['enable-logging'])
        
        if chrome_path:
            chrome_options.binary_location = chrome_path
            print(f"Setting Chrome binary location to: {chrome_path}")
        
        # Try to use ChromeDriverManager
        try:
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
            print("Chrome driver initialized successfully with regular selenium")
            return driver, temp_dir
        except Exception as cdm_error:
            print(f"ChromeDriverManager failed: {cdm_error}")
            
            # Try with Edge as a last resort
            try:
                from selenium.webdriver.edge.service import Service as EdgeService
                from webdriver_manager.microsoft import EdgeChromiumDriverManager
                
                print("Trying Microsoft Edge as a fallback...")
                edge_options = webdriver.EdgeOptions()
                edge_options.add_argument('--disable-gpu')
                edge_options.add_argument('--no-sandbox')
                edge_options.add_argument('--disable-dev-shm-usage')
                edge_options.add_argument('--disable-notifications')
                # Use a different user data directory for Edge
                edge_temp_dir = os.path.join(tempfile.gettempdir(), f"edge_profile_{uuid.uuid4().hex}")
                os.makedirs(edge_temp_dir, exist_ok=True)
                edge_options.add_argument(f'--user-data-dir={edge_temp_dir}')
                
                edge_service = EdgeService(EdgeChromiumDriverManager().install())
                driver = webdriver.Edge(service=edge_service, options=edge_options)
                print("Edge driver initialized successfully as fallback")
                return driver, edge_temp_dir
            except Exception as edge_error:
                print(f"Edge driver failed: {edge_error}")
                raise Exception("Could not initialize any browser driver")
                
    except Exception as e:
        print(f"Error setting up Chrome driver: {e}", file=sys.stderr)
        raise

def main():
    temp_dir = None
    driver = None
    
    try:
        print("Starting LinkedIn Messenger...")
        
        # Setup logging first
        setup_messenger_logging()
        
        # Load environment variables
        load_dotenv()
        print("Environment variables loaded")
        
        # Initialize handlers
        sheets_handler = GoogleSheetsHandler(os.getenv('GOOGLE_SHEETS_ID'))
        print("Google Sheets handler initialized")
        
        # Get unmessaged profiles
        profiles = sheets_handler.get_unmessaged_profiles()
        print(f"Found {len(profiles)} profiles to message")
        
        if not profiles:
            print("No profiles to message. Exiting.")
            return
            
        # Setup Chrome driver
        driver, temp_dir = setup_driver()
        
        try:
            # Initialize LinkedIn DMer
            print("Initializing LinkedIn DMer...")
            dmer = LinkedInDMer(driver)
            print("Logging into LinkedIn...")
            dmer.login()
            print("Successfully logged into LinkedIn")
            
            if not dmer.check_login_status():
                print("Login appears to have failed. Please check the screenshots.")
                return
            
            # Process each profile
            for i, profile in enumerate(profiles, 1):
                try:
                    print(f"\nProcessing profile {i}/{len(profiles)}: {profile['url']}")
                    
                    # Get message text
                    message = dmer.get_message_text(profile.get('name', ''))
                    print(f"Generated message for {profile.get('name', 'unnamed profile')}")
                    
                    # Send message
                    success = dmer.send_message(profile['url'], message)
                    
                    if success:
                        sheets_handler.update_message_status(profile['url'], 'Sent')
                        print(f"✓ Successfully messaged {profile['url']}")
                        time.sleep(2)
                    else:
                        sheets_handler.update_message_status(profile['url'], 'Failed')
                        print(f"✗ Failed to message {profile['url']}")
                        
                except Exception as e:
                    print(f"Error processing profile {profile['url']}: {e}", file=sys.stderr)
                    try:
                        sheets_handler.update_message_status(profile['url'], 'Failed')
                    except Exception as update_error:
                        print(f"Error updating failure status: {update_error}", file=sys.stderr)
                    continue
                    
        finally:
            if driver:
                driver.quit()
                print("\nChrome driver closed")
            
    except Exception as e:
        print(f"Error in messenger: {e}", file=sys.stderr)
        logging.error("Full error details:", exc_info=True)
    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                # Wait a bit for Chrome to fully release the files
                time.sleep(5)
                
                # Try to remove the directory with shutil
                import shutil
                try:
                    shutil.rmtree(temp_dir)
                    print(f"Removed temporary directory: {temp_dir}")
                except Exception as cleanup_error:
                    print(f"Error with shutil cleanup: {cleanup_error}")
                    
                    # If that fails, try with os.system on Windows
                    try:
                        os.system(f'rmdir /S /Q "{temp_dir}"')
                        print(f"Removed temporary directory using system command")
                    except Exception as cmd_error:
                        print(f"Error with system command cleanup: {cmd_error}")
                        print(f"Note: Temporary directory {temp_dir} may need manual cleanup")
            except Exception as cleanup_error:
                print(f"Error cleaning up temporary directory: {cleanup_error}")
                print(f"Note: Temporary directory {temp_dir} may need manual cleanup")
        
        print("LinkedIn Messenger finished")

if __name__ == "__main__":
    main() 