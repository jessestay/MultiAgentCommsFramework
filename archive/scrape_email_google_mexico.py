from googleapiclient.discovery import build
import pandas as pd
import re
import time
from typing import List, Tuple, Dict
import os
from dotenv import load_dotenv
from datetime import datetime
import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import random
from fake_useragent import UserAgent
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import undetected_chromedriver as uc
import requests
from pathlib import Path
import logging
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut
from functools import lru_cache
from geopy.extra.rate_limiter import RateLimiter
from google_sheets_handler import GoogleSheetsHandler
import signal
import sys

# Load environment variables
load_dotenv()

USAGE_FILE = "api_usage.json"
MAX_DAILY_QUERIES = 100

def setup_logging():
    """Setup logging configuration"""
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = f'logs/linkedin_scraper_{timestamp}.log'
    
    # Remove any existing handlers
    root = logging.getLogger()
    if root.handlers:
        for handler in root.handlers:
            root.removeHandler(handler)
            
    # Configure file handler to capture everything
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.DEBUG)  # Capture all levels
    file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(file_formatter)
    
    # Configure console handler for less verbose output
    console_handler = logging.StreamHandler(sys.stdout)  # Use stdout for normal output
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter('%(message)s')
    console_handler.setFormatter(console_formatter)
    
    # Configure error handler for stderr
    error_handler = logging.StreamHandler(sys.stderr)
    error_handler.setLevel(logging.ERROR)
    error_formatter = logging.Formatter('ERROR: %(message)s')
    error_handler.setFormatter(error_formatter)
    
    # Add all handlers to root logger
    root.setLevel(logging.DEBUG)  # Capture all levels
    root.addHandler(file_handler)
    root.addHandler(console_handler)
    root.addHandler(error_handler)
    
    # Capture uncaught exceptions
    sys.excepthook = lambda *ex: logging.error('Uncaught exception:', exc_info=ex)
    
    return log_file

def load_api_usage():
    """Load API usage data from file"""
    try:
        with open(USAGE_FILE, 'r') as f:
            usage = json.load(f)
            # Convert stored date string back to datetime
            usage['date'] = datetime.fromisoformat(usage['date'])
            return usage
    except FileNotFoundError:
        return {'date': datetime.now(), 'count': 0}

def save_api_usage(usage):
    """Save API usage data to file"""
    usage_to_save = {
        'date': usage['date'].isoformat(),
        'count': usage['count']
    }
    with open(USAGE_FILE, 'w') as f:
        json.dump(usage_to_save, f)

def check_api_quota():
    """Check remaining API quota for the day"""
    try:
        usage = load_api_usage()
        queries_today = usage.get('queries_today', 0)
        queries_remaining = MAX_DAILY_QUERIES - queries_today
        
        if queries_remaining <= 0:
            logging.warning("Daily API quota exceeded. Stopping scraper.")
            return usage, 0
            
        return usage, queries_remaining
    except Exception as e:
        logging.error(f"Error checking API quota: {e}")
        return {'queries_today': 0, 'last_reset': None}, MAX_DAILY_QUERIES

def increment_api_usage(usage):
    """Increment the API usage counter"""
    usage['count'] += 1
    save_api_usage(usage)

def setup_google_search():
    """Initialize Google Custom Search API client"""
    api_key = os.getenv('GOOGLE_API_KEY')
    search_engine_id = os.getenv('GOOGLE_CSE_ID')
    
    if not api_key or not search_engine_id:
        raise ValueError("Please set GOOGLE_API_KEY and GOOGLE_CSE_ID in .env file")
    
    return build("customsearch", "v1", developerKey=api_key), search_engine_id

def get_proxies() -> List[str]:
    """Get a list of free proxies (you should replace this with paid proxies for production)"""
    proxy_list = []
    try:
        # Get free proxies (replace with your paid proxy service)
        response = requests.get('https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt')
        if response.status_code == 200:
            proxy_list = [line.strip() for line in response.text.split('\n') if line.strip()]
    except:
        print("Failed to fetch proxies, will proceed without proxy")
    return proxy_list

def find_chrome_executable():
    """Find Chrome executable path"""
    import sys
    import os
    from pathlib import Path

    possible_paths = {
        "win32": [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            str(Path.home() / "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
            "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
        ],
        "darwin": [  # macOS
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        ],
        "linux": [
            "/usr/bin/google-chrome",
            "/usr/bin/chrome",
            "/usr/bin/brave-browser",
            "/usr/bin/microsoft-edge"
        ]
    }

    platform = sys.platform
    for path in possible_paths.get(platform, []):
        if os.path.exists(path):
            print(f"Found browser at: {path}")
            return path
            
    print("No compatible browser found in standard locations")
    return None

def setup_browser(proxy: str = None):
    """Initialize undetected-chromedriver with anti-detection measures"""
    try:
        options = uc.ChromeOptions()
        
        # Find and set browser binary location
        browser_path = find_chrome_executable()
        if not browser_path:
            logging.error("Please install Chrome, Brave, or Edge browser")
            return None
            
        options.binary_location = browser_path
        
        # Add proxy if provided
        if proxy:
            options.add_argument(f'--proxy-server={proxy}')
            
        driver = uc.Chrome(options=options)
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        # Add cleanup handler
        def cleanup_driver():
            try:
                if driver:
                    driver.close()
                    driver.quit()
            except Exception as e:
                logging.error(f"Error cleaning up driver: {e}")
                
        import atexit
        atexit.register(cleanup_driver)
        
        return driver
        
    except Exception as e:
        logging.error(f"Error setting up browser: {e}")
        return None

def random_delay():
    """More human-like random delay"""
    # Random base delay
    time.sleep(random.uniform(2, 5))
    
    # Occasionally add longer delay to seem more human
    if random.random() < 0.2:  # 20% chance
        time.sleep(random.uniform(5, 8))

def extract_email(text: str) -> str:
    """Extract email from text using regex"""
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    matches = re.findall(email_pattern, text)
    return matches[0] if matches else "No email found"

@lru_cache(maxsize=1000)
def is_coordinates_in_mexico(location_text: str) -> bool:
    """Validate if coordinates are within Mexico's boundaries (with caching)"""
    try:
        # Add rate limiting
        if not hasattr(is_coordinates_in_mexico, '_geolocator'):
            is_coordinates_in_mexico._geolocator = Nominatim(user_agent="linkedin_scraper")
            is_coordinates_in_mexico._geocode = RateLimiter(
                is_coordinates_in_mexico._geolocator.geocode,
                min_delay_seconds=1
            )
        
        location = is_coordinates_in_mexico._geocode(location_text, timeout=10)
        
        if not location:
            return False
            
        # Mexico's rough boundaries
        MEXICO_BOUNDS = {
            'north': 32.7187629,  # Northern border
            'south': 14.5329000,  # Southern border
            'east': -86.7105800,  # Eastern border
            'west': -118.3644000  # Western border
        }
        
        # Check if coordinates fall within Mexico's boundaries
        in_bounds = (
            MEXICO_BOUNDS['south'] <= location.latitude <= MEXICO_BOUNDS['north'] and
            MEXICO_BOUNDS['west'] <= location.longitude <= MEXICO_BOUNDS['east']
        )
        
        if in_bounds:
            # Verify country is Mexico
            address = is_coordinates_in_mexico._geolocator.reverse((location.latitude, location.longitude), language='en')
            country = address.raw.get('address', {}).get('country', '')
            return country.lower() in ['mexico', 'méxico']
            
        return False
        
    except (GeocoderTimedOut, Exception) as e:
        logging.error(f"Geocoding error: {str(e)}")
        return False

def is_mexico_location(driver) -> bool:
    """More robust check for Mexico location with coordinate validation"""
    try:
        location_text = None
        logging.debug("Starting location check")
        
        # Try multiple selectors for location
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
                    logging.debug(f"Checking location text: {location_text}")
                    
                    # First check with text-based indicators
                    mexico_indicators = [
                        'mexico', 'méxico', 
                        'cdmx', 'ciudad de méxico',
                        'guadalajara', 'monterrey', 'tijuana',
                        'cancún', 'cancun', 'mexicali',
                        'mérida', 'merida', 'puebla',
                        'querétaro', 'queretaro',
                        'jalisco', 'nuevo león', 'nuevo leon',
                        'baja california', 'yucatán', 'yucatan',
                        'quintana roo', 'aguascalientes',
                        'san luis potosí', 'san luis potosi',
                        'estado de méxico', 'estado de mexico'
                    ]
                    
                    if any(indicator in location_text for indicator in mexico_indicators):
                        logging.debug("Found Mexico indicator in text")
                        # Verify with coordinates
                        if is_coordinates_in_mexico(location_text):
                            logging.info(f"Location verified via coordinates: {location_text}")
                            return True
                        else:
                            logging.debug(f"Location failed coordinate verification: {location_text}")
            except Exception as e:
                logging.debug(f"Failed to check selector {selector}: {str(e)}")
                continue
        
        # Check URL for mx subdomain as fallback
        if 'mx.linkedin.com' in driver.current_url:
            logging.debug("Found mx.linkedin.com domain")
            return True
            
        logging.debug("No Mexico location indicators found")
        return False
        
    except Exception as e:
        logging.error(f"Error checking location: {str(e)}")
        return False

def is_english_speaker(profile_data: Dict[str, str]) -> bool:
    """Check if profile indicates English language skills"""
    english_indicators = [
        'english', 'bilingual', 'fluent', 'native',
        'language: english', 'languages: english',
        'esl', 'toefl', 'ielts'
    ]
    
    # Check profile language
    if profile_data['language'].lower() == 'english':
        return True
        
    # Check about section for English indicators
    about_text = profile_data['about'].lower()
    if any(indicator in about_text for indicator in english_indicators):
        return True
        
    # Check title/description for English indicators
    title_text = profile_data['title'].lower()
    return any(indicator in title_text for indicator in english_indicators)

def can_message_without_restrictions(driver):
    """Check if profile can be messaged directly without connection/premium - fail fast"""
    try:
        # First check for connection/premium buttons which indicate we can't message
        quick_check_selectors = [
            'button[aria-label*="Connect"]',
            'button[aria-label*="Invite"]',
            'button.connect-button',
            'button.artdeco-button--premium',
            'a[data-control-name="premium_highlight_upsell"]'
        ]
        
        # If any of these exist, we know immediately we can't message
        for selector in quick_check_selectors:
            if driver.find_elements(By.CSS_SELECTOR, selector):
                logging.debug("Found connection/premium requirement, skipping profile")
                return False
        
        # Look for an unrestricted message button
        message_button = WebDriverWait(driver, 3).until(  # Reduced timeout to 3 seconds
            EC.presence_of_element_located((By.CSS_SELECTOR, 
                'button[aria-label^="Message"]:not([disabled])'
            ))
        )
        
        # Quick check of immediate parent for restrictions
        parent = message_button.find_element(By.XPATH, "./..")
        html = parent.get_attribute('outerHTML').lower()
        
        restrictions = ['premium', 'connect', 'connection', 'invite', 'upgrade']
        if any(r in html for r in restrictions):
            logging.debug("Found messaging restriction in parent element")
            return False
            
        return True

    except:
        logging.debug("No message button found or other error")
        return False

def process_profile(driver, profile_url):
    """Process a single LinkedIn profile - skip quickly if can't message"""
    try:
        # Quick check for messaging ability before doing any other processing
        if not can_message_without_restrictions(driver):
            logging.debug(f"Skipping {profile_url} - cannot message directly")
            return None
            
        # Only continue with full profile processing if we can actually message them
        # ... rest of profile processing code ...
        
    except Exception as e:
        logging.error(f"Error processing profile {profile_url}: {e}")
        return None

def scrape_profile(driver: webdriver.Chrome, url: str, proxies: List[str]) -> Dict[str, str]:
    """Scrape individual LinkedIn profile with retry logic"""
    if not driver:
        logging.error("No valid browser instance provided")
        return None
        
    max_retries = 3
    current_try = 0
    local_driver = driver
    
    while current_try < max_retries:
        try:
            result = {
                'profile_url': url,
                'email': "No email found",
                'name': "",
                'title': "",
                'location': "",
                'is_mexico': False,
                'language': "",
                'about': "",
                'speaks_english': False,
                'skills': ""
            }
            
            logging.info(f"Attempting to scrape profile: {url} (attempt {current_try + 1}/{max_retries})")
            
            # Load the page
            local_driver.get(url)
            random_delay()
            
            # Try multiple name selectors in order of reliability
            name_selectors = [
                'h1.text-heading-xlarge',
                'h1.top-card-layout__title',
                '.pv-text-details__left-panel h1',
                '.profile-topcard-person-entity__name',
                '.inline.t-24.t-black.t-normal',
                '.text-heading-xlarge',
                '[data-generated-cert-name]',
                '.profile-info div.identity-name',
                '.profile-overview-content .profile-name'
            ]
            
            # Get name from page
            for selector in name_selectors:
                try:
                    name_elem = local_driver.find_element(By.CSS_SELECTOR, selector)
                    if name_elem and name_elem.text.strip():
                        result['name'] = name_elem.text.strip()
                        logging.info(f"Found name using selector {selector}: {result['name']}")
                        break
                except Exception as e:
                    continue
            
            # Fallback: Try to get name from URL if we couldn't find it on page
            if not result['name']:
                try:
                    # Extract name from URL and clean it up
                    name_from_url = url.split('/in/')[-1].split('/')[0]
                    name_from_url = name_from_url.replace('-', ' ').replace('.', ' ').title()
                    # Remove any numbers or special characters
                    name_from_url = re.sub(r'[0-9_]', '', name_from_url).strip()
                    if name_from_url and len(name_from_url.split()) >= 2:  # Ensure it looks like a real name
                        result['name'] = name_from_url
                        logging.info(f"Using name from URL: {result['name']}")
                except Exception as e:
                    logging.error(f"Could not extract name from URL: {e}")
            
            # Try to get name from page title as last resort
            if not result['name']:
                try:
                    title = local_driver.title
                    # LinkedIn titles usually follow the pattern: "Name - Title | LinkedIn"
                    if ' - ' in title and '|' in title:
                        name = title.split(' - ')[0].strip()
                        if name and len(name.split()) >= 2:  # Ensure it looks like a real name
                            result['name'] = name
                            logging.info(f"Using name from page title: {result['name']}")
                except Exception as e:
                    logging.error(f"Could not extract name from page title: {e}")
            
            # Try multiple selectors for location
            location_selectors = [
                '.text-body-small',
                '.pv-text-details__left-panel .text-body-small',
                '.profile-topcard__location-data',
                '[data-generated-cert-location]'
            ]
            
            for selector in location_selectors:
                try:
                    location_elem = local_driver.find_element(By.CSS_SELECTOR, selector)
                    if location_elem:
                        result['location'] = location_elem.text
                        break
                except:
                    continue
            
            # Extract email from the entire page content
            email = extract_email(local_driver.page_source)
            if email != "No email found":
                result['email'] = email
                logging.info(f"Found email: {email}")
            else:
                logging.debug(f"No email found in profile: {url}")
            
            # Check location from URL and content
            result['is_mexico'] = is_mexico_location(local_driver)
            
            if result['is_mexico']:
                logging.info(f"Profile confirmed to be from Mexico: {url}")
            else:
                logging.debug(f"Profile not confirmed from Mexico: {url}")
            
            # Check for English indicators in content
            english_indicators = ['english', 'bilingual', 'fluent', 'native', 'toefl', 'ielts']
            result['speaks_english'] = any(indicator in local_driver.page_source.lower() for indicator in english_indicators)
            
            if result['speaks_english']:
                logging.info(f"Profile indicates English language skills: {url}")
            else:
                logging.debug(f"No English language indicators found: {url}")
            
            if not result['name']:
                logging.warning(f"Could not find name for profile: {url}")
            
            logging.info(f"Successfully scraped profile: {url}")
            return result
            
        except Exception as e:
            logging.error(f"Error on try {current_try + 1} for {url}: {str(e)}")
            current_try += 1
            if "unusual traffic" in str(e).lower() or "denied" in str(e).lower():
                wait_time = random.uniform(30, 60)
                logging.warning(f"Rate limit detected, waiting {wait_time:.2f} seconds")
                time.sleep(wait_time)
    
    logging.error(f"Failed to scrape profile after {max_retries} attempts: {url}")
    return None

def search_profiles(service, search_engine_id, query):
    """Search for LinkedIn profiles using Custom Search API"""
    try:
        # Check quota before making request
        _, queries_remaining = check_api_quota()
        if queries_remaining <= 0:
            logging.error("API quota exceeded. Stopping search and saving results...")
            
            # Read the CSV file
            if os.path.exists("mexico_english_freelancers.csv"):
                csv_df = pd.read_csv("mexico_english_freelancers.csv")
                logging.info(f"Found {len(csv_df)} profiles in CSV")
                
                # Process and sync the data
                sheets_handler = GoogleSheetsHandler(os.getenv('GOOGLE_SHEETS_ID'))
                
                # Compare data sources
                missing_in_sheet, _ = sheets_handler.compare_data_sources()
                if missing_in_sheet:
                    logging.info(f"Found {len(missing_in_sheet)} records missing from Google Sheet")
                    # Filter for missing records
                    missing_records = csv_df[csv_df['profile_url'].isin(missing_in_sheet)]
                    if not missing_records.empty:
                        logging.info(f"Syncing {len(missing_records)} missing records to Google Sheet")
                        sheets_handler.save_results(missing_records)
                        logging.info("Sync complete")
                else:
                    logging.info("No missing records to sync")
            else:
                logging.warning("No CSV file found to sync")
                
            logging.info("Results saved. Exiting...")
            os._exit(0)  # Force exit when quota is exceeded
            
        logging.info(f"Executing query: {query}")
        result = service.cse().list(
            q=query,
            cx=search_engine_id,
            num=10
        ).execute()
        
        # Update usage after successful request
        update_api_usage()
        
        return result.get('items', [])
        
    except Exception as e:
        if "quota" in str(e).lower():
            logging.error("API quota exceeded. Stopping search and saving results...")
            # Same sync logic as above
            if os.path.exists("mexico_english_freelancers.csv"):
                csv_df = pd.read_csv("mexico_english_freelancers.csv")
                sheets_handler = GoogleSheetsHandler(os.getenv('GOOGLE_SHEETS_ID'))
                sheets_handler.sync_missing_records()
            logging.info("Results saved. Exiting...")
            os._exit(0)
        logging.error(f"Error searching profiles: {e}")
        return []

def load_previous_results() -> set:
    """Load previously scraped profile URLs"""
    previous_urls = set()
    try:
        # Check all possible CSV files
        csv_files = ['mexico_english_freelancers.csv', 'all_freelancer_emails.csv', 'freelancer_emails.csv']
        for file in csv_files:
            if os.path.exists(file):
                df = pd.read_csv(file)
                if 'profile_url' in df.columns:
                    previous_urls.update(df['profile_url'].tolist())
        logging.info(f"Loaded {len(previous_urls)} previously scraped profiles")
    except Exception as e:
        logging.error(f"Error loading previous results: {e}")
    return previous_urls

def get_rotating_queries() -> List[str]:
    base_queries = [
        'site:mx.linkedin.com/in/ "{job}"',  # Only mx subdomain
        'site:linkedin.com/in/ "{job}" "location * Mexico"',
        'site:linkedin.com/in/ "{job}" "Mexico City" OR "Ciudad de México" OR "CDMX"'
    ]
    
    jobs = [
        # Design roles
        'freelance graphic designer', 'diseñador gráfico freelance',
        'diseñador independiente', 'freelance illustrator',
        'ilustrador freelance', 'remote designer',
        'diseñador remoto', 'creative freelancer',
        'canva designer', 'diseñador de canva',
        
        # Small Business / Entrepreneur
        'small business owner', 'dueño de negocio',
        'emprendedor', 'entrepreneur',
        'business owner', 'propietario de negocio',
        'startup founder', 'fundador',
        
        # Marketing / Social Media
        'social media manager', 'community manager',
        'marketing digital', 'digital marketing',
        'content creator', 'creador de contenido',
        'influencer', 'blogger',
        
        # Creative Business
        'etsy seller', 'vendedor en etsy',
        'handmade business', 'negocio artesanal',
        'creative entrepreneur', 'emprendedor creativo',
        'artesano independiente', 'independent artist',
        
        # Event Planning
        'event planner', 'organizador de eventos',
        'wedding planner', 'coordinador de bodas',
        'party planner', 'planificador de eventos',
        
        # Teaching / Coaching
        'online teacher', 'profesor online',
        'coach', 'business coach',
        'mentor', 'consultor independiente'
    ]
    
    # Add some very specific queries
    specific_queries = [
        'site:mx.linkedin.com/in/ "small business" "Mexico" "English"',
        'site:mx.linkedin.com/in/ "emprendedor" "México" "bilingual"',
        'site:linkedin.com/in/ "business owner" "Ciudad de México"',
        'site:linkedin.com/in/ "marketing digital" location:"Mexico City"',
        'site:mx.linkedin.com/in/ "content creator" "social media"',
        'site:mx.linkedin.com/in/ "etsy seller" OR "handmade"',
        'site:linkedin.com/in/ "coach" OR "mentor" "México"'
    ]
    
    queries = []
    for base in base_queries:
        for job in jobs:
            query = base.format(job=job)
            queries.append(query)
    
    queries.extend(specific_queries)
    random.shuffle(queries)
    return queries[:20]

def save_results(df, timestamp=None):
    """Save results to both CSV and Google Sheets"""
    if df is None or df.empty:
        logging.info("No new results to save")
        return
        
    try:
        # Process the profiles into correct format
        processed_df = process_profiles(df)
        
        # Get Google Sheets handler
        sheets_handler = GoogleSheetsHandler(os.getenv('GOOGLE_SHEETS_ID'))
        
        # Save using the handler
        sheets_handler.save_results(processed_df, timestamp)
        
    except Exception as e:
        logging.error(f"Error in save_results wrapper: {e}")
        logging.error("Full error details:", exc_info=True)

def signal_handler(signum, frame):
    """Handle termination signals gracefully"""
    logging.info("Received termination signal. Saving current results...")
    try:
        if 'current_results' in globals() and current_results is not None:
            logging.info(f"Current results type: {type(current_results)}")
            logging.info(f"Current results content: {current_results}")
            
            # Process the profiles into correct format
            processed_df = process_profiles(current_results)
            logging.info(f"Processed DataFrame shape: {processed_df.shape}")
            logging.info(f"Processed DataFrame columns: {processed_df.columns.tolist()}")
            logging.info(f"First few rows:\n{processed_df.head()}")
            
            # Get Google Sheets handler
            sheets_handler = GoogleSheetsHandler(os.getenv('GOOGLE_SHEETS_ID'))
            
            # Compare before saving
            logging.info("Checking current state before saving...")
            before_missing, _ = sheets_handler.compare_data_sources()
            if before_missing:
                logging.info(f"Found {len(before_missing)} records missing before save")
            
            # Save current results
            sheets_handler.save_results(processed_df)
            
            # Compare after saving
            logging.info("Checking state after saving...")
            after_missing, _ = sheets_handler.compare_data_sources()
            if after_missing:
                logging.info(f"Found {len(after_missing)} records still missing after save")
                logging.info("Attempting to sync missing records...")
                sheets_handler.sync_missing_records()
            
            logging.info("Results saved successfully")
        else:
            logging.info("No results to save")
            if 'current_results' in globals():
                logging.info(f"current_results exists but is {current_results}")
            else:
                logging.info("current_results does not exist in globals")
    except Exception as e:
        logging.error(f"Error saving results during termination: {e}")
        logging.error("Full error details:", exc_info=True)
    finally:
        logging.info("Cleanup complete. Exiting...")
        os._exit(0)  # Force exit after save attempt

def process_profiles(profiles):
    """Process scraped profiles into DataFrame"""
    logging.info(f"Processing profiles of type: {type(profiles)}")
    
    if isinstance(profiles, pd.DataFrame):
        logging.info("Input is already a DataFrame")
        profiles_list = profiles.to_dict('records')
    else:
        logging.info("Converting input to list of dictionaries")
        profiles_list = profiles if isinstance(profiles, list) else [profiles]
    
    processed = []
    for profile in profiles_list:
        processed.append({
            'profile_url': profile.get('url', ''),
            'email': profile.get('email', 'No email found'),
            'name': profile.get('name', ''),
            'title': profile.get('title', ''),
            'location': profile.get('location', ''),
            'is_mexico': profile.get('is_mexico', False),
            'language': profile.get('language', ''),
            'about': profile.get('about', ''),
            'speaks_english': profile.get('speaks_english', False),
            'skills': profile.get('skills', ''),
            'sent': ''  # Empty sent status for new profiles
        })
    
    result_df = pd.DataFrame(processed)
    logging.info(f"Created DataFrame with shape: {result_df.shape}")
    logging.info(f"Columns: {result_df.columns.tolist()}")
    return result_df

def main():
    """Main execution function"""
    global current_results
    current_results = None
    
    # Set up logging first
    setup_logging()
    
    # Set up signal handler for Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        logging.info("Starting LinkedIn profile scraper")
        
        # Initialize empty DataFrame for results
        current_results = pd.DataFrame()
        
        # Initialize logging
        log_file = setup_logging()
        logging.info("Starting script execution")
        
        # Load previously scraped profiles
        previous_urls = load_previous_results()
        
        # Initialize search service
        service, search_engine_id = setup_google_search()
        logging.info("Successfully initialized Google Search API")
        
        # Get rotating queries
        queries = get_rotating_queries()
        logging.info(f"Generated {len(queries)} search queries")
        
        for query in queries:
            try:
                # Check quota
                _, queries_remaining = check_api_quota()
                if queries_remaining <= 0:
                    logging.info("API quota reached. Saving current results...")
                    break
                    
                # Process query and get new profiles
                new_profiles = search_profiles(service, search_engine_id, query)
                if new_profiles:
                    current_results = pd.concat([current_results, pd.DataFrame(new_profiles)])
                    # Save incrementally every N profiles
                    if len(current_results) % 10 == 0:  # Save every 10 profiles
                        save_results(current_results)
                        
            except KeyboardInterrupt:
                logging.info("Received keyboard interrupt. Saving current results...")
                if not current_results.empty:
                    save_results(current_results)
                logging.info("Cleanup complete. Exiting...")
                os._exit(0)  # Force exit
            except Exception as e:
                logging.error(f"Error processing query: {e}")
                # Save what we have so far
                if not current_results.empty:
                    save_results(current_results)
                continue
                
        # Final save
        if not current_results.empty:
            save_results(current_results)
            
    except KeyboardInterrupt:
        logging.info("Received keyboard interrupt. Saving current results...")
        if not current_results.empty:
            save_results(current_results)
        logging.info("Cleanup complete. Exiting...")
        os._exit(0)  # Force exit
    except Exception as e:
        logging.error(f"Fatal error: {e}")
        if not current_results.empty:
            save_results(current_results)
        raise
    finally:
        logging.info("Script finished")

if __name__ == "__main__":
    main()
