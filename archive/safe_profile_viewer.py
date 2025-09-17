from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import os
import sqlite3
from datetime import datetime
import random
import logging

# Import the core functionality
from linkedin_core import LinkedInCore

class SafeProfileViewer:
    def __init__(self, account_manager, headless=False):
        self.account_manager = account_manager
        self.headless = headless
        self.db_path = 'prospects.db'
        self._setup_database()
        
    def _setup_database(self):
        """Create the prospects database if it doesn't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create prospects table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS prospects (
            id INTEGER PRIMARY KEY,
            linkedin_url TEXT UNIQUE,
            name TEXT,
            title TEXT,
            company TEXT,
            location TEXT,
            notes TEXT,
            viewed_date TIMESTAMP,
            viewed_by INTEGER,
            outreach_status TEXT DEFAULT 'not_contacted',
            last_updated TIMESTAMP
        )
        ''')
        
        conn.commit()
        conn.close()
        
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
                print(f"Security checkpoint detected for account {account['username']}")
                return False
                
            # Check if we're on the homepage
            if "feed" in driver.current_url:
                print(f"Successfully logged in as {account['username']}")
                return True
            else:
                print(f"Login failed for account {account['username']}")
                return False
                
        except Exception as e:
            print(f"Error during login: {e}")
            return False
            
    def view_profile(self, url):
        """Safely view a LinkedIn profile and extract data"""
        # Get an available account
        account = self.account_manager.get_available_account()
        if not account:
            print("No available accounts within daily view limits")
            return False
            
        print(f"Using account {account['username']} to view profile {url}")
        
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
                return False
                
            # Visit the profile
            LinkedInCore.wait_random_time(3, 8)
            driver.get(url)
            LinkedInCore.wait_random_time(5, 10)
            
            # Scroll naturally using the core function
            LinkedInCore.scroll_naturally(driver)
            
            # Extract profile data
            profile_data = self.extract_profile_data(driver)
            
            # Take screenshot for verification
            os.makedirs("profile_screenshots", exist_ok=True)
            filename = f"profile_screenshots/{url.split('/')[-1]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            driver.save_screenshot(filename)
            
            # Save to database
            self.save_prospect(url, profile_data, account['id'])
            
            # Update view count for the account
            self.account_manager.increment_view_count(account['id'])
            
            print(f"Successfully viewed and saved profile: {profile_data.get('name', 'Unknown')}")
            return True
            
        except Exception as e:
            print(f"Error viewing profile: {e}")
            return False
            
        finally:
            # Add some random delay before quitting
            LinkedInCore.wait_random_time(3, 8)
            driver.quit()
    
    def save_prospect(self, url, data, account_id):
        """Save prospect data to the database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
            INSERT OR REPLACE INTO prospects 
            (linkedin_url, name, title, company, location, viewed_date, viewed_by, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                url,
                data.get('name', ''),
                data.get('title', ''),
                data.get('company', ''),
                data.get('location', ''),
                datetime.now(),
                account_id,
                datetime.now()
            ))
            
            conn.commit()
            
        except Exception as e:
            print(f"Error saving prospect: {e}")
            
        finally:
            conn.close()
    
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
        # Copy the existing extraction logic here
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