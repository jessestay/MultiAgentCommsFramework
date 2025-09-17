"""Enhanced core LinkedIn functionality using open source components"""
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium_stealth import stealth  # From selenium-stealth
import time
import random
import os
import logging
from datetime import datetime

class LinkedInCore:
    """Core LinkedIn functionality with enhanced anti-detection"""
    
    @staticmethod
    def setup_driver(headless=False, user_data_dir=None):
        """Set up a browser with advanced anti-detection measures"""
        options = Options()
        if headless:
            options.add_argument('--headless')
            
        # Anti-detection measures
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Random window size within normal ranges
        width = random.randint(1200, 1600)
        height = random.randint(800, 1000)
        options.add_argument(f'--window-size={width},{height}')
        
        # Reuse user data directory if provided
        if user_data_dir:
            os.makedirs(user_data_dir, exist_ok=True)
            options.add_argument(f'--user-data-dir={user_data_dir}')
        
        driver = webdriver.Chrome(options=options)
        
        # Apply selenium-stealth protections
        stealth(driver,
            languages=["en-US", "en"],
            vendor="Google Inc.",
            platform="Win32",
            webgl_vendor="Intel Inc.",
            renderer="Intel Iris OpenGL Engine",
            fix_hairline=True,
        )
        
        return driver
    
    @staticmethod
    def type_like_human(element, text):
        """Type text into an element with human-like delays between keypresses"""
        for char in text:
            element.send_keys(char)
            time.sleep(random.uniform(0.05, 0.25))
    
    @staticmethod
    def scroll_naturally(driver):
        """Scroll the page in a natural human-like pattern"""
        total_height = driver.execute_script("return document.body.scrollHeight")
        viewport_height = driver.execute_script("return window.innerHeight")
        
        current_position = 0
        
        while current_position < total_height:
            # Random scroll amount
            scroll_amount = random.randint(100, 300)
            current_position += scroll_amount
            
            driver.execute_script(f"window.scrollTo(0, {current_position});")
            
            # Random pause between scrolls
            time.sleep(random.uniform(0.5, 2.5))
            
            # Occasionally scroll back up a bit
            if random.random() < 0.2:
                scroll_up = random.randint(40, 100)
                current_position -= scroll_up
                driver.execute_script(f"window.scrollTo(0, {current_position});")
                time.sleep(random.uniform(0.5, 1.5))
    
    @staticmethod
    def wait_random_time(min_sec=2, max_sec=7):
        """Wait a random amount of time"""
        delay = random.uniform(min_sec, max_sec)
        time.sleep(delay)
        
    @staticmethod
    def find_chrome_path():
        """Find Chrome installation path"""
        chrome_path = None
        paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.join(os.environ.get('LOCALAPPDATA', ''), r"Google\Chrome\Application\chrome.exe"),
        ]
        
        for path in paths:
            if os.path.exists(path):
                chrome_path = path
                logging.info(f"Found Chrome at: {path}")
                break
                
        if not chrome_path:
            # Try to find Chrome in PATH
            try:
                import shutil
                chrome_in_path = shutil.which('chrome')
                if chrome_in_path:
                    chrome_path = chrome_in_path
                    logging.info(f"Found Chrome in PATH: {chrome_path}")
            except Exception as e:
                logging.error(f"Error finding Chrome in PATH: {e}")
        
        return chrome_path
    
    @staticmethod
    def clean_name(name):
        """Clean and normalize a name"""
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
        import re
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
            
        # Rejoin the clean words
        cleaned_name = ' '.join(words)
        
        return cleaned_name 