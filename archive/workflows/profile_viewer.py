"""LinkedIn profile viewing with safety measures"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import os
import logging
from datetime import datetime

# Import the core functionality
from core.linkedin_core import LinkedInCore

class SafeProfileViewer:
    """Views LinkedIn profiles safely with anti-detection measures"""
    
    def __init__(self, account_manager, db_manager, headless=False):
        self.account_manager = account_manager
        self.db_manager = db_manager
        self.headless = headless
        
    def login(self, driver, account):
        """Login to LinkedIn with the given account"""
        try:
            driver.get("https://www.linkedin.com/login")
            LinkedInCore.wait_random_time(3, 6)
            
            # Find and fill email field
            email_field = driver.find_element(By.ID, "username")
            LinkedInCore.type_like_human(email_field, account["email"])
            
            # Find and fill password field
            password_field = driver.find_element(By.ID, "password")
            LinkedInCore.type_like_human(password_field, account["password"])
            
            # Click login button
            login_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            login_button.click()
            
            LinkedInCore.wait_random_time(5, 10)
            
            # Check if login was successful
            if "checkpoint" in driver.current_url or "challenge" in driver.current_url:
                logging.warning(f"Security checkpoint detected for account {account['username']}")
                return False
                
            # Check if we're on the homepage
            if "feed" in driver.current_url:
                logging.info(f"Successfully logged in as {account['username']}")
                return True
            else:
                logging.error(f"Login failed for account {account['username']}")
                return False
                
        except Exception as e:
            logging.error(f"Error during login: {e}")
            return False
            
    def view_profile(self, url):
        """Safely view a LinkedIn profile and extract data"""
        result = {
            'success': False,
            'data': {},
            'error': None
        }
        
        # Get an available account
        account = self.account_manager.get_available_account()
        if not account:
            result['error'] = "No available accounts within daily view limits"
            logging.warning(result['error'])
            return result
            
        logging.info(f"Using account {account['username']} to view profile {url}")
        
        # Use the core module to set up the driver
        driver = LinkedInCore.setup_driver(headless=self.headless)
        
        try:
            # Login
            if not self.login(driver, account):
                self.account_manager.update_account_status(
                    account['id'], 
                    "login_failed", 
                    f"Failed to login at {datetime.now()}"
                )
                driver.quit()
                result['error'] = "Login failed"
                return result
                
            # Visit the profile
            LinkedInCore.wait_random_time(3, 8)
            driver.get(url)
            LinkedInCore.wait_random_time(5, 10)
            
            # Scroll naturally using the core function
            LinkedInCore.scroll_naturally(driver)
            
            # Extract profile data
            profile_data = self.extract_profile_data(driver)
            
            # Add the URL to the data
            profile_data['linkedin_url'] = url
            
            # Take screenshot for verification
            os.makedirs("profile_screenshots", exist_ok=True)
            filename = f"profile_screenshots/{url.split('/')[-1]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            driver.save_screenshot(filename)
            
            # Save to database
            prospect_id = self.db_manager.save_prospect(profile_data, account['id'])
            
            if prospect_id:
                # Update view count for the account
                self.account_manager.increment_view_count(account['id'])
                
                logging.info(f"Successfully viewed and saved profile: {profile_data.get('name', 'Unknown')}")
                result['success'] = True
                result['data'] = profile_data
            else:
                result['error'] = "Failed to save prospect to database"
            
            return result
            
        except Exception as e:
            error_msg = f"Error viewing profile: {str(e)}"
            logging.error(error_msg)
            result['error'] = error_msg
            return result
            
        finally:
            # Add some random delay before quitting
            LinkedInCore.wait_random_time(3, 8)
            driver.quit()
    
    def extract_profile_data(self, driver):
        """Extract data from a LinkedIn profile using linkedin-scraper"""
        try:
            # Try using linkedin-scraper first
            from linkedin_scraper import Person
            person = Person(driver=driver, url=driver.current_url, scrape=False)
            person.scrape(close_on_complete=False)
            
            # Map to our data format
            return {
                'name': f"{person.first_name} {person.last_name}",
                'title': person.occupation,
                'company': person.company,
                'location': person.location,
                'about': person.about,
                'experiences': [e.to_dict() for e in person.experiences],
                'education': [e.to_dict() for e in person.educations],
                'skills': person.skills
            }
        except Exception as e:
            logging.warning(f"linkedin-scraper error: {e}")
            logging.info("Falling back to custom extraction method")
            
            # Fall back to our original method
            return self._extract_profile_data_original(driver)
        
    def _extract_profile_data_original(self, driver):
        """Original extraction method as fallback"""
        data = {}
        
        try:
            # Wait for the profile to load
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, ".pv-top-card"))
            )
            
            # Extract name
            try:
                name_element = driver.find_element(By.CSS_SELECTOR, "h1.text-heading-xlarge")
                data["name"] = name_element.text.strip()
            except:
                data["name"] = ""
                
            # Extract title
            try:
                title_element = driver.find_element(By.CSS_SELECTOR, ".text-body-medium.break-words")
                data["title"] = title_element.text.strip()
            except:
                data["title"] = ""
                
            # Extract company
            try:
                company_element = driver.find_element(By.CSS_SELECTOR, "div.inline-show-more-text.inline-block")
                data["company"] = company_element.text.strip()
            except:
                data["company"] = ""
                
            # Extract location
            try:
                location_element = driver.find_element(By.CSS_SELECTOR, ".text-body-small.inline-block")
                data["location"] = location_element.text.strip()
            except:
                data["location"] = ""
                
            return data
            
        except Exception as e:
            logging.error(f"Error extracting profile data: {e}")
            return {} 