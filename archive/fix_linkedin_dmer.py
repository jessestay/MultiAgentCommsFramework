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
            
    def get_message_text(self, name):
        """Generate message text based on recipient's name"""
        if not name:
            name = "there"
            
        message = f"""Hi {name},

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
                print("Could not find message button on profile page")
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