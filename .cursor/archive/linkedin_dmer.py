from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import pandas as pd
import random
import logging
from dotenv import load_dotenv
import os
from datetime import datetime
import re
from fake_useragent import UserAgent
from nameparser import HumanName

# Add the LinkedInDMer class
class LinkedInDMer:
    def __init__(self, driver):
        self.driver = driver
        load_dotenv()
        self.username = os.getenv('LINKEDIN_EMAIL')
        self.password = os.getenv('LINKEDIN_PASSWORD')
        
    def login(self):
        """Login to LinkedIn"""
        try:
            print("Logging into LinkedIn...")
            self.driver.get("https://www.linkedin.com/login")
            
            # Wait for and find username field
            username_field = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.ID, "username"))
            )
            username_field.send_keys(self.username)
            
            # Find and fill password field
            password_field = self.driver.find_element(By.ID, "password")
            password_field.send_keys(self.password)
            
            # Click login button
            login_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            login_button.click()
            
            # Wait for login to complete
            time.sleep(3)
            print("Successfully logged in")
            return True
            
        except Exception as e:
            print(f"Error logging in: {e}")
            return False
            
    def get_first_name(self, full_name):
        """Extract the first name from a full name intelligently using nameparser"""
        if not full_name:
            return ""
        
        try:
            # First try with nameparser library
            name = HumanName(full_name)
            
            # If nameparser found a first name, use it
            if name.first:
                return name.first
            
            # Fall back to our manual method if nameparser doesn't get a result
        except ImportError:
            print("nameparser library not installed, using simple name parsing")
        except Exception as e:
            print(f"Error parsing name with nameparser: {e}")
        
        # Our original manual method as fallback
        full_name = full_name.strip()
        if not full_name:
            return ""
        
        name_parts = full_name.split()
        if len(name_parts) >= 1:
            first_name = name_parts[0]
            first_name = first_name.rstrip('.,;:-')
            
            # Handle prefixes
            prefixes = ['dr', 'dr.', 'mr', 'mr.', 'ms', 'ms.', 'mrs', 'mrs.', 'prof', 'prof.']
            if first_name.lower() in prefixes and len(name_parts) >= 2:
                first_name = name_parts[1]
            
            return first_name
        
        return ""
        
    def get_message_text(self, name):
        """Generate message text based on recipient's first name"""
        # Extract just the first name
        first_name = self.get_first_name(name)
        
        # If we couldn't get a valid first name, use "there"
        if not first_name:
            first_name = "there"
        
        message = f"""Hi {first_name},

I just wrote the book, Canva For Dummies, and wanted to share a special event I'm hosting just for residents of Mexico. 
I'm hosting a live 2-day Canva training on March 6-7 where I'll teach how to make money using Canva—
selling templates, working with international clients, and using Canva for business.

If you're interested, you can check out more details here: 
https://jessestay.com/makemoneyoncanvamexico

Let me know if you have any questions!"""
        
        return message
        
    def send_message(self, profile_url, message):
        """Send a message to a LinkedIn profile"""
        try:
            print(f"Visiting profile: {profile_url}")
            self.driver.get(profile_url)
            time.sleep(5)  # Increase wait time to ensure page loads
            
            # Check if we're on the correct page
            if "linkedin.com" not in self.driver.current_url:
                print(f"Failed to navigate to LinkedIn profile: {profile_url}")
                return False
            
            # Take a screenshot for debugging
            os.makedirs("debug_screenshots", exist_ok=True)
            screenshot_path = f"debug_screenshots/{profile_url.split('/')[-1]}.png"
            self.driver.save_screenshot(screenshot_path)
            print(f"Debug screenshot saved to {screenshot_path}")
            
            # Print all buttons on the page for debugging
            print("Searching for all buttons on the page...")
            all_buttons = self.driver.find_elements(By.TAG_NAME, "button")
            print(f"Found {len(all_buttons)} buttons on the page")
            
            for i, button in enumerate(all_buttons):
                try:
                    button_text = button.text.strip()
                    button_class = button.get_attribute("class")
                    button_aria = button.get_attribute("aria-label")
                    
                    if button_text or button_aria:
                        print(f"Button {i}: Text='{button_text}', Aria-Label='{button_aria}', Class='{button_class}'")
                        
                        # Highlight this button in the screenshot for debugging
                        if "message" in button_text.lower() or (button_aria and "message" in button_aria.lower()):
                            self.driver.execute_script("arguments[0].style.border='3px solid red'", button)
                            highlight_path = f"debug_screenshots/highlight_{profile_url.split('/')[-1]}.png"
                            self.driver.save_screenshot(highlight_path)
                            print(f"Potential message button highlighted in {highlight_path}")
                except:
                    continue
            
            # Try to find the message button directly by text first
            try:
                # Look for a button with exact text "Message"
                message_buttons = self.driver.find_elements(By.XPATH, "//button[text()='Message']")
                if message_buttons and len(message_buttons) > 0:
                    message_button = message_buttons[0]
                    print("Found message button by exact text 'Message'")
                    
                    # Try to click the button
                    try:
                        self.driver.execute_script("arguments[0].scrollIntoView(true);", message_button)
                        time.sleep(1)
                        self.driver.execute_script("arguments[0].click();", message_button)
                        print("Clicked message button using JavaScript")
                        time.sleep(3)
                        
                        # Check if message dialog opened
                        try:
                            message_box = WebDriverWait(self.driver, 5).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, "div[role='textbox']"))
                            )
                            print("Message dialog opened successfully")
                            
                            # Clear any existing text
                            message_box.clear()
                            # Type message character by character to avoid detection
                            for char in message:
                                message_box.send_keys(char)
                                time.sleep(0.05)  # Small delay between characters
                                
                            time.sleep(1)
                            
                            # Find and click send button
                            send_button = WebDriverWait(self.driver, 5).until(
                                EC.element_to_be_clickable((By.CSS_SELECTOR, "button[type='submit']"))
                            )
                            send_button.click()
                            
                            print("Message sent successfully")
                            time.sleep(3)
                            return True
                        except Exception as dialog_error:
                            print(f"Error with message dialog: {dialog_error}")
                            # Continue to try other methods
                    except Exception as click_error:
                        print(f"Error clicking message button: {click_error}")
                        # Continue to try other methods
            except Exception as direct_error:
                print(f"Error finding message button by direct text: {direct_error}")
                # Continue to try other methods
            
            # Check if we need to connect first
            try:
                connect_button = self.driver.find_element(By.CSS_SELECTOR, "button[aria-label='Connect']")
                print("Found Connect button - need to connect first")
                connect_button.click()
                time.sleep(2)
                
                # Click Send on the connect dialog
                send_connect = self.driver.find_element(By.CSS_SELECTOR, "button[aria-label='Send now']")
                send_connect.click()
                time.sleep(2)
                print("Connection request sent")
                
                # We can't message yet, so return
                return False
            except:
                # No connect button found, continue to message
                pass
            
            # Try to find the message button with different selectors
            message_button = None
            selectors = [
                "button[aria-label='Message']",
                "button[aria-label='Mensaje']",  # Spanish
                "button[aria-label='Mesaj']",    # Turkish
                "button[data-control-name='message']",
                "button.message-anywhere-button",
                "button.artdeco-button--primary[type='button']",
                "a[data-control-name='message']",
                "a.message-anywhere-button",
                "div.pv-top-card-v2-ctas a.message-anywhere-button",
                "div.pvs-profile-actions button:nth-child(2)",  # Second button in actions
                "div.pvs-profile-actions button:nth-child(3)",  # Third button in actions
                "div.pvs-profile-actions button:nth-child(4)",  # Fourth button in actions
                ".pv-s-profile-actions--message",  # New selector based on the screenshot
                ".message-anywhere-button",        # New selector based on the screenshot
                ".artdeco-button--primary"         # New selector based on the screenshot
            ]
            
            # Print the page source for debugging
            page_source = self.driver.page_source
            with open(f"debug_html/{profile_url.split('/')[-1]}.html", "w", encoding="utf-8") as f:
                f.write(page_source)
            
            # Try each selector
            for selector in selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for element in elements:
                        try:
                            # Check if this element is visible and contains text related to messaging
                            if element.is_displayed():
                                element_text = element.text.lower()
                                if "message" in element_text or "mensaje" in element_text or "mesaj" in element_text or element_text == "":
                                    message_button = element
                                    print(f"Found message button with selector: {selector}, text: {element_text}")
                                    break
                        except:
                            continue
                
                    if message_button:
                        break
                except:
                    continue
            
            if not message_button:
                # Try one more approach - look for any button that might be a message button
                try:
                    buttons = self.driver.find_elements(By.TAG_NAME, "button")
                    for button in buttons:
                        try:
                            if button.is_displayed():
                                button_text = button.text.lower()
                                if "message" in button_text or "mensaje" in button_text or "mesaj" in button_text:
                                    message_button = button
                                    print(f"Found message button by text: {button_text}")
                                    break
                        except:
                            continue
                except:
                    pass
                
            if not message_button:
                # Take a screenshot for debugging
                screenshot_path = f"error_screenshots/{profile_url.split('/')[-1]}.png"
                os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
                self.driver.save_screenshot(screenshot_path)
                print(f"Screenshot saved to {screenshot_path}")
                return False
            
            # Click the message button
            try:
                self.driver.execute_script("arguments[0].scrollIntoView(true);", message_button)
                time.sleep(1)
                self.driver.execute_script("arguments[0].click();", message_button)
                print("Clicked message button using JavaScript")
            except:
                try:
                    message_button.click()
                    print("Clicked message button normally")
                except Exception as click_error:
                    print(f"Error clicking message button: {click_error}")
                    return False
                
            time.sleep(3)
            
            # Wait for message box and send message
            try:
                # Try different selectors for the message box
                message_box = None
                message_box_selectors = [
                    "div[role='textbox']",
                    "div.msg-form__contenteditable",
                    "div.msg-form__message-texteditor"
                ]
                
                for selector in message_box_selectors:
                    try:
                        message_box = WebDriverWait(self.driver, 5).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                        )
                        if message_box:
                            print(f"Found message box with selector: {selector}")
                            break
                    except:
                        continue
                    
                if not message_box:
                    print("Could not find message box")
                    return False
                
                # Clear any existing text
                message_box.clear()
                # Type message character by character to avoid detection
                for char in message:
                    message_box.send_keys(char)
                    time.sleep(0.05)  # Small delay between characters
                    
                time.sleep(1)
                
                # Find and click send button
                send_button = None
                send_button_selectors = [
                    "button[type='submit']",
                    "button.msg-form__send-button",
                    "button[aria-label='Send']",
                    "button[aria-label='Enviar']"  # Spanish
                ]
                
                for selector in send_button_selectors:
                    try:
                        send_button = WebDriverWait(self.driver, 5).until(
                            EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                        )
                        if send_button:
                            print(f"Found send button with selector: {selector}")
                            break
                    except:
                        continue
                    
                if not send_button:
                    print("Could not find send button")
                    return False
                
                send_button.click()
                
                print("Message sent successfully")
                time.sleep(3)
                return True
            except Exception as e:
                print(f"Error in message dialog: {e}")
                return False
                
        except Exception as e:
            print(f"Error sending message: {e}")
            return False

    def check_login_status(self):
        """Check if we're properly logged into LinkedIn"""
        try:
            # Go to LinkedIn homepage
            self.driver.get("https://www.linkedin.com/feed/")
            time.sleep(3)
            
            # Take a screenshot
            os.makedirs("debug_screenshots", exist_ok=True)
            screenshot_path = "debug_screenshots/login_check.png"
            self.driver.save_screenshot(screenshot_path)
            
            # Check for elements that indicate we're logged in
            try:
                profile_nav = self.driver.find_element(By.CSS_SELECTOR, "div.global-nav__me")
                print("Found profile navigation - we are logged in")
                return True
            except:
                try:
                    # Try another element
                    feed_element = self.driver.find_element(By.ID, "global-nav-feed")
                    print("Found feed element - we are logged in")
                    return True
                except:
                    print("Could not find elements indicating we're logged in")
                    return False
                    
        except Exception as e:
            print(f"Error checking login status: {e}")
            return False

def setup_logging():
    """Setup logging configuration"""
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = f'logs/linkedin_dm_{timestamp}.log'
    
    logging.basicConfig(
        filename=log_file,
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # Also log to console
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    console.setFormatter(formatter)
    logging.getLogger('').addHandler(console)
    
    return log_file

# Load environment variables
load_dotenv()

def random_delay(min_seconds=20, max_seconds=40):
    delay = random.uniform(min_seconds, max_seconds)
    time.sleep(delay)
    return delay

def setup_driver():
    """Setup Chrome driver with better anti-detection"""
    options = webdriver.ChromeOptions()
    
    # Add stronger anti-detection measures
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    # Add random user agent
    # user_agent = UserAgent().random
    # options.add_argument(f'user-agent={user_agent}')
    
    # Reduce fingerprinting
    options.add_argument('--disable-features=IsolateOrigins,site-per-process')
    options.add_argument('--disable-dev-shm-usage')
    
    driver = webdriver.Chrome(options=options)
    
    # Additional stealth measures
    # driver.execute_cdp_cmd('Network.setUserAgentOverride', {"userAgent": user_agent})
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    return driver

def login_to_linkedin(driver):
    try:
        driver.get("https://www.linkedin.com/login")
        random_delay(5, 8)

        email = driver.find_element(By.ID, "username")
        email.send_keys(os.getenv('LINKEDIN_EMAIL'))
        random_delay(2, 4)

        password = driver.find_element(By.ID, "password")
        password.send_keys(os.getenv('LINKEDIN_PASSWORD'))
        random_delay(1, 3)
        
        password.send_keys(Keys.RETURN)
        random_delay(8, 12)  # Longer delay after login

        if "checkpoint" in driver.current_url or "challenge" in driver.current_url:
            logging.warning("LinkedIn security checkpoint detected!")
            input("Please complete the security checkpoint manually and press Enter to continue...")

    except Exception as e:
        logging.error(f"Login failed: {str(e)}")
        raise

def clean_name(name: str) -> str:
    """Clean and validate a name"""
    if not name:
        return ""
        
    # Remove common titles and suffixes
    titles = [
        'dr', 'dr.', 'phd', 'ph.d', 'prof', 'prof.',
        'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.',
        'eng', 'eng.', 'mba', 'cpa', 'esq', 'esq.'
    ]
    
    # Convert to title case and split
    name = name.strip().title()
    
    # Remove parentheses and their contents
    name = re.sub(r'\([^)]*\)', '', name)
    
    # Split into words
    words = name.split()
    
    # Remove titles
    words = [w for w in words if w.lower().replace('.', '') not in titles]
    
    # Remove numbers and special characters
    words = [re.sub(r'[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]', '', w) for w in words]
    
    # Remove empty strings and strip each word
    words = [w.strip() for w in words if w.strip()]
    
    # Validate we have at least a first name
    if not words:
        return ""
        
    # Special handling for Spanish/Latin names
    cleaned_name = ' '.join(words)
    
    # Handle common name issues
    cleaned_name = (cleaned_name
        .replace('Linkedin', '')
        .replace('Member', '')
        .replace('Profile', '')
        .strip())
    
    # Validate final name
    if len(cleaned_name.split()) < 1:  # At least one name part
        return ""
        
    logging.info(f"Cleaned name '{name}' to '{cleaned_name}'")
    return cleaned_name

def extract_name_from_profile(driver) -> str:
    """Try to extract name from LinkedIn profile page"""
    logging.info(f"\n{'='*50}\nSTART: Processing profile {driver.current_url}")
    
    # Wait for page load
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        logging.info(f"Current URL after navigation: {driver.current_url}")
    except:
        logging.error("Page load timeout")
        return ""

    # Log all buttons for debugging
    buttons = driver.find_elements(By.TAG_NAME, "button")
    logging.info(f"Found {len(buttons)} buttons on page")
    for button in buttons:
        logging.info(f"Button found - Text: '{button.text}', Aria-label: '{button.get_attribute('aria-label')}'")

    name_selectors = [
        'h1.text-heading-xlarge',
        'h1.top-card-layout__title',
        '.pv-text-details__left-panel h1',
        '.profile-topcard-person-entity__name',
        '.inline.t-24.t-black.t-normal',
        '.text-heading-xlarge',
        '[data-generated-cert-name]',
        '.profile-info div.identity-name'
    ]
    
    for selector in name_selectors:
        try:
            # Wait for element
            name_elem = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
            )
            if name_elem and name_elem.text.strip():
                raw_name = name_elem.text.strip()
                cleaned_name = clean_name(raw_name)
                if cleaned_name:
                    logging.info(f"Found name '{cleaned_name}' using selector '{selector}'")
                    return cleaned_name
        except:
            continue
    
    # Try to get name from page title as fallback
    try:
        title = driver.title
        if ' | ' in title:  # LinkedIn titles use pipe separator
            raw_name = title.split(' | ')[0].strip()
            cleaned_name = clean_name(raw_name)
            if cleaned_name:
                logging.info(f"Extracted name '{cleaned_name}' from title")
                return cleaned_name
    except:
        pass
        
    logging.warning("Could not extract valid name from profile")
    return ""

def is_mexico_location(driver) -> bool:
    """Check if profile is from Mexico"""
    try:
        # First check URL
        if 'mx.linkedin.com' in driver.current_url:
            logging.info("Found mx.linkedin.com domain")
            return True
            
        # Check page content for Mexico indicators
        page_text = driver.page_source.lower()
        mexico_indicators = [
            'mexico', 'méxico', 'cdmx', 'ciudad de méxico',
            'guadalajara', 'monterrey', 'tijuana'
        ]
        
        if any(indicator in page_text for indicator in mexico_indicators):
            logging.info("Found Mexico indicator in page content")
            return True
            
        # Try location elements last
        location_selectors = [
            ".pv-text-details__left-panel .text-body-small:not(.inline)",
            ".pb2 .text-body-small",
            ".top-card-layout__card .text-body-small",
            "[data-generated-cert-location]",
            ".profile-info .location"
        ]
        
        for selector in location_selectors:
            try:
                location_elem = driver.find_element(By.CSS_SELECTOR, selector)
                if location_elem:
                    location_text = location_elem.text.lower()
                    if any(indicator in location_text for indicator in mexico_indicators):
                        logging.info(f"Found Mexico location: {location_text}")
                        return True
            except:
                continue
                
        return False
        
    except Exception as e:
        logging.error(f"Error checking location: {str(e)}")
        return False

def is_valid_linkedin_url(url: str) -> bool:
    """Check if URL is a valid LinkedIn profile URL"""
    # Convert URL to www.linkedin.com format
    url = url.replace('mx.linkedin.com', 'www.linkedin.com')
    url = re.sub(r'https://[a-z]{2}\.linkedin\.com', 'https://www.linkedin.com', url)
    
    # Basic validation
    if not url.startswith('https://www.linkedin.com/in/'):
        logging.warning(f"Invalid LinkedIn URL format: {url}")
        return False
        
    # Remove any tracking parameters
    url = url.split('?')[0]
    
    # Remove language suffix if present
    url = re.sub(r'/[a-z]{2}$', '', url)
    
    return True

def can_message_profile(driver):
    """Check if we can message this profile without premium/connection"""
    try:
        # First check if there's a direct message button
        message_buttons = driver.find_elements(By.CSS_SELECTOR, 
            'button[aria-label*="Message"], button.message-anywhere-button')
        
        for button in message_buttons:
            if not button.is_displayed() or not button.is_enabled():
                continue
                
            # Check button and parent elements for connection/premium indicators
            elements_to_check = [button]
            parent = button
            for _ in range(3):  # Check up to 3 levels up
                try:
                    parent = parent.find_element(By.XPATH, "..")
                    elements_to_check.append(parent)
                except:
                    break
            
            html = ' '.join(elem.get_attribute('innerHTML').lower() for elem in elements_to_check)
            
            # Check for any text indicating restrictions
            restriction_indicators = [
                'premium', 'connect', 'connection', 
                'upgrade', 'join now', 'try premium',
                'add to network', 'invite'
            ]
            
            if any(indicator in html for indicator in restriction_indicators):
                logging.info(f"Found messaging restriction: {[ind for ind in restriction_indicators if ind in html]}")
                return False
                
            # If we found a valid message button with no restrictions, we can message
            return True
                
        # If we get here, no valid message button was found
        logging.info("No unrestricted message button found")
        return False
        
    except Exception as e:
        logging.error(f"Error checking if profile can be messaged: {e}")
        return False

def send_message(driver, profile, name, message_text):
    """Send a message to a LinkedIn profile"""
    try:
        # Quick check for connection/premium requirements - no logging of every button
        quick_check_selectors = [
            'button[aria-label*="Connect"]',
            'button[aria-label*="Invite"]',
            'button.connect-button',
            'button.artdeco-button--premium'
        ]
        
        # Fast check using JavaScript to avoid Selenium overhead
        has_restrictions = driver.execute_script("""
            return arguments[0].some(selector => 
                document.querySelector(selector) !== null
            );
        """, quick_check_selectors)
        
        if has_restrictions:
            logging.debug(f"Skipping {profile} - requires connection/premium")
            return False
            
        # Quick check for message button using JavaScript
        can_message = driver.execute_script("""
            const button = document.querySelector('button[aria-label*="Message"]:not([disabled])');
            if (!button) return false;
            
            const html = button.outerHTML.toLowerCase();
            const restrictions = ['premium', 'connect', 'connection', 'invite', 'upgrade'];
            return !restrictions.some(r => html.includes(r));
        """)
        
        if not can_message:
            logging.debug(f"Skipping {profile} - cannot message")
            return False
            
        # Look for message button
        message_button = None
        message_selectors = [
            f'button[aria-label="Message {name.split()[0]}"]',
            'button[aria-label*="Message"]',
            'button.message-anywhere-button'
        ]
        
        for selector in message_selectors:
            try:
                buttons = driver.find_elements(By.CSS_SELECTOR, selector)
                for button in buttons:
                    if button.is_displayed() and button.is_enabled():
                        # Quick check of button and immediate parent for restrictions
                        elements = [button, button.find_element(By.XPATH, "..")]
                        html = ' '.join(e.get_attribute('outerHTML').lower() for e in elements)
                        
                        restrictions = ['premium', 'connect', 'connection', 'invite', 'upgrade']
                        if any(r in html for r in restrictions):
                            logging.info("Cannot message - found restriction indicators")
                            return False
                            
                        message_button = button
                        break
                if message_button:
                    break
            except:
                continue
                
        if not message_button:
            logging.info("Could not find message button")
            return False
            
        # Click message button and wait for overlay
        try:
            driver.execute_script("arguments[0].click();", message_button)
            logging.info("Clicked message button")
            random_delay(2, 3)
            
            # Wait for messaging overlay
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'div.msg-form__contenteditable'))
            )
        except Exception as e:
            logging.error(f"Failed to open message overlay: {e}")
            return False
            
        # Find message input with retry
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Find input with multiple selectors
                message_input = None
                input_selectors = [
                    'div[contenteditable="true"][aria-label*="Write"]',
                    'div[contenteditable="true"][aria-label*="Escribir"]',
                    'div.msg-form__contenteditable',
                    'div[role="textbox"]'
                ]
                
                for selector in input_selectors:
                    try:
                        message_input = WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                        )
                        if message_input.is_displayed():
                            break
                    except:
                        continue
                        
                if not message_input:
                    raise Exception("Message input not found")
                    
                # Capture initial input state
                initial_state = driver.execute_script("""
                    return {
                        html: arguments[0].outerHTML,
                        isContentEditable: arguments[0].isContentEditable,
                        isFocused: document.activeElement === arguments[0],
                        attributes: Object.entries(arguments[0].attributes)
                            .map(([_, attr]) => `${attr.name}="${attr.value}"`)
                            .join(', '),
                        computedStyle: JSON.stringify({
                            display: getComputedStyle(arguments[0]).display,
                            visibility: getComputedStyle(arguments[0]).visibility,
                            opacity: getComputedStyle(arguments[0]).opacity,
                            zIndex: getComputedStyle(arguments[0]).zIndex,
                            pointerEvents: getComputedStyle(arguments[0]).pointerEvents
                        })
                    }
                """, message_input)
                
                logging.info("Initial input state:")
                logging.info(f"HTML: {initial_state['html']}")
                logging.info(f"Is contenteditable: {initial_state['isContentEditable']}")
                logging.info(f"Is focused: {initial_state['isFocused']}")
                logging.info(f"Attributes: {initial_state['attributes']}")
                logging.info(f"Computed style: {initial_state['computedStyle']}")
                
                # Aggressive focus and click
                driver.execute_script("""
                    // Scroll into view
                    arguments[0].scrollIntoView({block: 'center'});
                    
                    // Remove any overlay elements
                    document.querySelectorAll('[class*="overlay"]').forEach(e => e.remove());
                    
                    // Focus and click events
                    arguments[0].focus();
                    arguments[0].click();
                    
                    // Trigger all possible events
                    ['focus', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(eventType => {
                        arguments[0].dispatchEvent(new Event(eventType, {bubbles: true}));
                    });
                    
                    // Force contenteditable
                    arguments[0].contentEditable = 'true';
                    arguments[0].setAttribute('data-focused', 'true');
                """, message_input)
                
                random_delay(1, 2)
                
                # Verify focus state after click
                focus_state = driver.execute_script("""
                    return {
                        activeElement: document.activeElement === arguments[0],
                        contentEditable: arguments[0].isContentEditable,
                        hasSelection: window.getSelection().containsNode(arguments[0], true),
                        elementState: arguments[0].matches(':focus'),
                        overlayElements: Array.from(document.elementsFromPoint(
                            arguments[0].getBoundingClientRect().x + 10,
                            arguments[0].getBoundingClientRect().y + 10
                        )).map(e => ({
                            tag: e.tagName,
                            class: e.className,
                            zIndex: getComputedStyle(e).zIndex
                        }))
                    }
                """, message_input)
                
                logging.info("Focus state after click:")
                logging.info(f"Is active element: {focus_state['activeElement']}")
                logging.info(f"Is contenteditable: {focus_state['contentEditable']}")
                logging.info(f"Has selection: {focus_state['hasSelection']}")
                logging.info(f"Element focused: {focus_state['elementState']}")
                logging.info(f"Elements at input position: {focus_state['overlayElements']}")
                
                # Type message and capture final state
                driver.execute_script("""
                    // Clear content
                    arguments[0].innerHTML = '';
                    
                    // Set new content
                    arguments[0].innerHTML = arguments[1];
                    
                    // Trigger input events
                    ['input', 'change', 'keyup', 'keydown', 'keypress'].forEach(eventType => {
                        arguments[0].dispatchEvent(new Event(eventType, {bubbles: true}));
                    });
                """, message_input, message_text.replace('\n', '<br>'))
                
                # Verify input state before submit
                final_state = driver.execute_script("""
                    return {
                        content: arguments[0].innerHTML,
                        text: arguments[0].innerText,
                        isActive: document.activeElement === arguments[0],
                        events: arguments[0].__events || [],
                        submitButton: {
                            enabled: document.querySelector('button[type="submit"]')?.disabled === false,
                            visible: getComputedStyle(document.querySelector('button[type="submit"]')).display !== 'none'
                        }
                    }
                """, message_input)
                
                logging.info("Final state before submit:")
                logging.info(f"Content: {final_state['content']}")
                logging.info(f"Text: {final_state['text']}")
                logging.info(f"Is active: {final_state['isActive']}")
                logging.info(f"Event listeners: {final_state['events']}")
                logging.info(f"Submit button state: {final_state['submitButton']}")
                
                # Find and click send button
                send_button = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR,
                        'button[type="submit"], button.msg-form__send-button'
                    ))
                )
                
                if not send_button.is_enabled():
                    raise Exception("Send button not enabled")
                    
                driver.execute_script("arguments[0].click();", send_button)
                
                # Verify message was sent
                try:
                    WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, 
                            'div.msg-s-event-listitem__message-bubble'
                        ))
                    )
                    logging.info(f"Successfully sent message to {name}")
                    random_delay(4, 6)
                    return True
                except:
                    raise Exception("Message send not confirmed")
                    
            except Exception as e:
                logging.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    random_delay(2, 3)
                    continue
                else:
                    logging.error("Max retries reached")
                    return False
                    
    except Exception as e:
        logging.error(f"Error checking message ability: {e}")
        return False

def recover_driver(driver, max_attempts=3):
    """More sophisticated driver recovery"""
    for attempt in range(max_attempts):
        try:
            if driver:
                driver.quit()
            time.sleep(random.uniform(30, 60))  # Longer cooldown between attempts
            driver = setup_driver()
            driver.get("https://www.linkedin.com")
            login_to_linkedin(driver)
            return driver
        except Exception as e:
            logging.error(f"Recovery attempt {attempt + 1} failed: {e}")
            time.sleep(random.uniform(60, 120))  # Even longer wait after failure
    return None

def click_element(driver, element, description="element"):
    """Try multiple methods to click an element"""
    methods = [
        # Method 1: Regular click
        lambda: element.click(),
        
        # Method 2: JavaScript click
        lambda: driver.execute_script("arguments[0].click();", element),
        
        # Method 3: Move and click
        lambda: (
            driver.execute_script("arguments[0].scrollIntoView(true);", element),
            time.sleep(0.5),
            element.click()
        ),
        
        # Method 4: Remove overlay and click
        lambda: (
            driver.execute_script("""
                document.querySelectorAll('[class*="overlay"]').forEach(e => e.remove());
                arguments[0].click();
            """, element)
        ),
        
        # Method 5: Force click with JavaScript
        lambda: driver.execute_script("""
            var evt = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            arguments[0].dispatchEvent(evt);
        """, element)
    ]
    
    for i, method in enumerate(methods, 1):
        try:
            method()
            logging.info(f"Successfully clicked {description} using method {i}")
            return True
        except Exception as e:
            logging.debug(f"Click method {i} failed: {e}")
            continue
            
    logging.error(f"All click methods failed for {description}")
    return False

def wait_for_element(driver, selector, timeout=10, description="element"):
    """Wait for element with better error handling"""
    try:
        element = WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )
        
        # Wait for element to be visible and interactable
        WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
        )
        
        # Wait for any animations to complete
        time.sleep(1)
        
        return element
    except Exception as e:
        logging.error(f"Failed to find {description}: {e}")
        return None

def main():
    """Main execution function"""
    # Set up logging first
    setup_logging()
    
    try:
        logging.info("Starting LinkedIn messenger")
        driver = None
        retry_count = 0
        max_retries = 3
        
        while retry_count < max_retries:
            try:
                if driver:
                    try:
                        driver.quit()
                    except:
                        pass
                    time.sleep(5)
                
                logging.info(f"\n{'='*50}\nStarting attempt {retry_count + 1} of {max_retries}")
                
                try:
                    driver = setup_driver()
                    logging.info("Chrome driver initialized successfully")
                except Exception as e:
                    logging.error(f"Failed to initialize driver: {e}")
                    retry_count += 1
                    time.sleep(30)  # Wait longer before retrying
                    continue
                
                # Simple test to verify browser works
                try:
                    driver.get("https://www.google.com")
                    logging.info("Test page loaded successfully")
                except Exception as e:
                    logging.error(f"Failed to load test page: {e}")
                    raise
                
                logging.info("Logging into LinkedIn")
                login_to_linkedin(driver)
                
                # Verify login was successful
                if "feed" not in driver.current_url.lower():
                    logging.error("Login may have failed - not on feed page")
                    raise Exception("Login verification failed")
                
                logging.info("Loading profiles from CSV")
                df = pd.read_csv("mexico_english_freelancers.csv")
                
                # Filter for profiles without email addresses
                df_no_email = df[
                    (df['email'].isna()) | 
                    (df['email'] == '') | 
                    (df['email'] == 'No email found')
                ]
                total_profiles = len(df_no_email)
                logging.info(f"Found {total_profiles} profiles without email addresses")
                
                # Base message (without greeting)
                message_text = (
                    "I just wrote the book, Canva For Dummies, and wanted to share a special event I'm hosting just for residents of Mexico. "
                    "I'm hosting a live 2-day Canva training on March 6-7 where I'll teach how to make money using Canva—"
                    "selling templates, working with international clients, and using Canva for business.\n\n"
                    "If you're interested, you can check out more details here: "
                    "https://jessestay.com/makemoneyoncanvamexico\n\n"
                    "Let me know if you have any questions!"
                )

                successful_messages = 0
                max_messages_per_day = 20
                
                # Track failed profiles to skip them
                failed_profiles = set()
                if os.path.exists('failed_profiles.txt'):
                    with open('failed_profiles.txt', 'r') as f:
                        failed_profiles = set(f.read().splitlines())
                
                # Track messaged profiles
                messaged_profiles = set()
                if os.path.exists('messaged_profiles.txt'):
                    with open('messaged_profiles.txt', 'r') as f:
                        messaged_profiles = set(f.read().splitlines())
                
                for index, (_, row) in enumerate(df_no_email.iterrows(), 1):
                    try:
                        # Check driver health before each profile
                        try:
                            driver.current_url
                        except:
                            driver = recover_driver(driver)
                            if not driver:
                                raise Exception("Failed to recover driver")
                        
                        logging.info(f"\nProcessing profile {index} of {total_profiles}")
                        profile = row['profile_url']
                        logging.info(f"Profile URL: {profile}")
                        
                        # Convert URL to www.linkedin.com format
                        profile = re.sub(r'https://[a-z]{2}\.linkedin\.com', 'https://www.linkedin.com', profile)
                        profile = profile.split('?')[0]  # Remove tracking parameters
                        profile = re.sub(r'/[a-z]{2}$', '', profile)  # Remove language suffix
                        
                        # Skip invalid URLs
                        if not is_valid_linkedin_url(profile):
                            logging.error(f"Invalid LinkedIn URL: {profile}")
                            failed_profiles.add(profile)
                            with open('failed_profiles.txt', 'a') as f:
                                f.write(f"{profile}\n")
                            continue
                        
                        # Skip already messaged or failed profiles
                        if profile in messaged_profiles:
                            logging.info(f"Skipping already messaged profile: {profile}")
                            continue
                        if profile in failed_profiles:
                            logging.info(f"Skipping previously failed profile: {profile}")
                            continue
                        
                        # Navigate to profile with error handling
                        try:
                            driver.get(profile)
                            WebDriverWait(driver, 20).until(
                                EC.presence_of_element_located((By.TAG_NAME, "body"))
                            )
                            logging.info(f"Successfully loaded profile page: {profile}")
                        except Exception as e:
                            logging.error(f"Failed to load profile {profile}: {e}")
                            failed_profiles.add(profile)
                            with open('failed_profiles.txt', 'a') as f:
                                f.write(f"{profile}\n")
                            continue
                        
                        # Extract name with error handling
                        try:
                            name = extract_name_from_profile(driver)
                            if not name:
                                logging.warning(f"Could not extract name from {profile}")
                                failed_profiles.add(profile)
                                with open('failed_profiles.txt', 'a') as f:
                                    f.write(f"{profile}\n")
                                continue
                        except Exception as e:
                            logging.error(f"Error extracting name from {profile}: {e}")
                            failed_profiles.add(profile)
                            with open('failed_profiles.txt', 'a') as f:
                                f.write(f"{profile}\n")
                            continue
                            
                        # Create personalized message
                        personalized_message = f"Hi {name.split()[0]},\n\n{message_text}"
                        
                        # Send message with error handling
                        try:
                            if send_message(driver, profile, name, personalized_message):
                                successful_messages += 1
                                messaged_profiles.add(profile)
                                with open('messaged_profiles.txt', 'a') as f:
                                    f.write(f"{profile}\n")
                                logging.info(f"Progress: {successful_messages}/{max_messages_per_day} messages sent")
                            else:
                                logging.warning(f"Failed to send message to {profile}")
                                failed_profiles.add(profile)
                                with open('failed_profiles.txt', 'a') as f:
                                    f.write(f"{profile}\n")
                        except Exception as e:
                            logging.error(f"Error sending message to {profile}: {e}")
                            failed_profiles.add(profile)
                            with open('failed_profiles.txt', 'a') as f:
                                f.write(f"{profile}\n")
                            continue
                        
                        # Add longer delay every 5 messages
                        if successful_messages % 5 == 0 and successful_messages > 0:
                            logging.info("Taking a longer break between messages...")
                            random_delay(300, 600)  # 5-10 minute break
                            
                    except Exception as e:
                        logging.error(f"Error processing profile {profile}: {e}")
                        failed_profiles.add(profile)
                        with open('failed_profiles.txt', 'a') as f:
                            f.write(f"{profile}\n")
                        continue
                
                logging.info(f"Successfully sent {successful_messages} messages")
                logging.info(f"Failed to process {len(failed_profiles)} profiles")
                
                break  # If we get here, everything worked
                
            except Exception as e:
                retry_count += 1
                logging.error(f"Attempt {retry_count} failed: {str(e)}")
                if retry_count < max_retries:
                    logging.info("Waiting 60 seconds before retrying...")
                    time.sleep(60)
                else:
                    logging.error("Max retries reached, exiting")
                    break
            finally:
                if driver:
                    try:
                        driver.quit()
                    except:
                        pass

    except Exception as e:
        logging.error(f"Error in main execution: {e}")

if __name__ == "__main__":
    main()
