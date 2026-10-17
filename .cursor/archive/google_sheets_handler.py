from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import os.path
import pandas as pd
from datetime import datetime
import logging
from google.oauth2 import service_account
from urllib.parse import quote
import time
import json

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

class GoogleSheetsHandler:
    def __init__(self, spreadsheet_id):
        self.spreadsheet_id = spreadsheet_id
        try:
            self.creds = self._get_credentials()
            self.service = build('sheets', 'v4', credentials=self.creds)
            self.sheet_name = "Emails"
            self.encoded_sheet_name = quote(self.sheet_name, safe='')
            # Define column structure to match sheet
            self.columns = [
                'profile_url',
                'email',
                'name',
                'title',
                'location',
                'is_mexico',
                'language',
                'about',
                'speaks_english',
                'skills',
                'sent'
            ]
            
            # Verify access immediately
            if not self.verify_sheet_access():
                raise Exception("Failed to verify sheet access")
            
        except Exception as e:
            logging.error(f"Failed to initialize Google Sheets handler: {e}")
            raise
        
    def _get_credentials(self):
        """Get service account credentials for Google Sheets"""
        try:
            creds = service_account.Credentials.from_service_account_file(
                'service-account.json',
                scopes=SCOPES
            )
            # Log the service account email
            info = json.load(open('service-account.json'))
            logging.info(f"Using service account: {info.get('client_email')}")
            return creds
        except Exception as e:
            logging.error(f"Error loading service account credentials: {e}")
            raise
    
    def get_existing_profiles(self):
        """Get list of already scraped profiles"""
        try:
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=f"'{self.sheet_name}'!A:A"  # Only get profile URLs column
            ).execute()
            values = result.get('values', [])
            # Skip header row and empty cells
            return [url[0] for url in values[1:] if url and url[0]] if values else []
        except Exception as e:
            logging.error(f"Error getting existing profiles: {e}")
            raise
    
    def append_leads(self, leads_df):
        """Append new leads to the sheet"""
        try:
            logging.info(f"Starting to append {len(leads_df)} leads to Google Sheet")
            logging.info(f"Input DataFrame columns: {leads_df.columns.tolist()}")
            
            # Reorder columns to match sheet structure
            ordered_df = leads_df.reindex(columns=self.columns)
            logging.info(f"Reordered DataFrame columns: {ordered_df.columns.tolist()}")
            logging.info(f"First few rows of data to append: \n{ordered_df.head()}")
            
            values = ordered_df.values.tolist()
            logging.info(f"Converted DataFrame to {len(values)} rows for upload")
            
            # Add header row if sheet is empty
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=f"{self.sheet_name}!A1:K1"  # Remove quotes
            ).execute()
            logging.info(f"Current sheet header check result: {result}")
            
            if not result.get('values'):
                logging.info("Sheet appears empty, adding header row")
                values.insert(0, self.columns)
            
            body = {
                'values': values
            }
            
            logging.info(f"Attempting to append to sheet '{self.sheet_name}'")
            logging.info(f"Using range: '{self.sheet_name}'!A:K")
            
            try:
                result = self.service.spreadsheets().values().append(
                    spreadsheetId=self.spreadsheet_id,
                    range=f"{self.sheet_name}!A:K",  # Remove quotes
                    valueInputOption='RAW',
                    insertDataOption='INSERT_ROWS',
                    body=body
                ).execute()
                
                rows_appended = result.get('updates', {}).get('updatedRows', 0)
                logging.info(f"API Response: {result}")
                logging.info(f"Successfully appended {rows_appended} rows to Google Sheet")
                
                # Verify the append
                verification = self.service.spreadsheets().values().get(
                    spreadsheetId=self.spreadsheet_id,
                    range=f"{self.sheet_name}!A:K"
                ).execute()
                logging.info(f"Post-append row count: {len(verification.get('values', []))}")
                
                return result
            except Exception as e:
                logging.error(f"Google Sheets API error: {str(e)}")
                logging.error(f"Request body was: {body}")
                raise
            
        except Exception as e:
            logging.error(f"Error appending leads: {str(e)}")
            logging.error(f"Full error context: {str(e.__class__.__name__)}: {str(e)}")
            logging.error("Error traceback:", exc_info=True)
            raise
        
    def update_message_status(self, profile_url, status, response=None):
        """Update message status for a profile with rate limiting"""
        max_retries = 3
        base_delay = 2  # Base delay in seconds
        
        for attempt in range(max_retries):
            try:
                result = self.service.spreadsheets().values().get(
                    spreadsheetId=self.spreadsheet_id,
                    range=f"{self.sheet_name}!A:K"  # Get all columns
                ).execute()
                
                values = result.get('values', [])
                row_idx = None
                
                for idx, row in enumerate(values):
                    if row[0] == profile_url:  # profile_url is in first column
                        row_idx = idx
                        break
                        
                if row_idx is not None:
                    # Update sent and responded columns
                    updates = [status]
                    if response:
                        updates.append(response)
                    
                    # Update the 'sent' column
                    range_name = f"{self.sheet_name}!K{row_idx + 1}"  # Column K is 'sent'
                    if response:
                        range_name = f"{self.sheet_name}!K{row_idx + 1}:L{row_idx + 1}"  # Include response column
                    
                    body = {
                        'values': [updates]
                    }
                    
                    try:
                        result = self.service.spreadsheets().values().update(
                            spreadsheetId=self.spreadsheet_id,
                            range=range_name,
                            valueInputOption='RAW',
                            body=body
                        ).execute()
                        return result
                    except Exception as e:
                        if 'RATE_LIMIT_EXCEEDED' in str(e):
                            if attempt < max_retries - 1:
                                delay = (attempt + 1) * base_delay
                                logging.warning(f"Rate limit hit, waiting {delay} seconds before retry {attempt + 1}")
                                time.sleep(delay)
                                continue
                        raise
                        
            except Exception as e:
                if attempt == max_retries - 1:
                    logging.error(f"Error updating message status: {e}")
                    raise
                else:
                    delay = (attempt + 1) * base_delay
                    logging.warning(f"Error on attempt {attempt + 1}, retrying in {delay} seconds: {e}")
                    time.sleep(delay)

    def get_unmessaged_profiles(self):
        """Get profiles that haven't been messaged yet and don't have email addresses"""
        try:
            logging.info("Getting unmessaged profiles without email addresses...")
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=f"{self.sheet_name}!A:K"  # Get all columns
            ).execute()
            
            values = result.get('values', [])
            if not values:
                logging.info("No profiles found in sheet")
                return []
            
            # Get header row and find column indices
            headers = values[0]
            logging.info(f"Sheet headers: {headers}")
            
            try:
                url_idx = headers.index('profile_url')
                name_idx = headers.index('name')
                email_idx = headers.index('email')
                sent_idx = headers.index('sent')
            except ValueError as e:
                logging.error(f"Required column not found: {e}")
                logging.error(f"Available columns: {headers}")
                raise
            
            # Get profiles without a sent status AND without an email address
            unmessaged = []
            for row in values[1:]:  # Skip header row
                try:
                    # Ensure row has enough columns
                    while len(row) <= max(sent_idx, email_idx):
                        row.append('')  # Pad with empty strings if needed
                    
                    # Check if the sent column doesn't contain "Sent" or "Failed"
                    # AND email column is empty or "No email found"
                    sent_value = row[sent_idx].strip() if sent_idx < len(row) else ""
                    email_value = row[email_idx].strip() if email_idx < len(row) else ""
                    
                    if (sent_value == "" and 
                        not sent_value.lower() in ["sent", "failed"] and
                        (not email_value or email_value == "No email found")):
                        
                        profile = {
                            'url': row[url_idx],
                            'name': row[name_idx] if len(row) > name_idx else '',
                            'message': ''  # Message will be set by linkedin_dmer
                        }
                        unmessaged.append(profile)
                        
                except Exception as e:
                    logging.error(f"Error processing row: {row}")
                    logging.error(f"Error details: {e}")
                    continue
            
            logging.info(f"Found {len(unmessaged)} unmessaged profiles without email addresses")
            return unmessaged
            
        except Exception as e:
            logging.error(f"Error getting unmessaged profiles: {e}")
            logging.error("Full error details:", exc_info=True)
            raise

    def setup_sheet_headers(self):
        """Setup or verify sheet headers"""
        try:
            # Match your existing column structure
            headers = [
                'profile_url',
                'name', 
                'email',
                'location',
                'industry',
                'sent',
                'responded',
                'notes'
            ]
            
            # Update headers in sheet
            body = {
                'values': [headers]
            }
            
            result = self.service.spreadsheets().values().update(
                spreadsheetId=self.spreadsheet_id,
                range=f"'{self.sheet_name}'!A1:H1",  # Use correct sheet name
                valueInputOption='RAW',
                body=body
            ).execute()
            
            logging.info("Successfully set up sheet headers")
            return result
        except Exception as e:
            logging.error(f"Error setting up sheet headers: {e}")
            raise

    def init_sheet(self):
        """Initialize sheet with proper structure"""
        try:
            # Check if sheet exists and get metadata
            sheet_metadata = self.service.spreadsheets().get(
                spreadsheetId=self.spreadsheet_id
            ).execute()
            
            # Verify sheet exists
            sheets = sheet_metadata.get('sheets', '')
            sheet_exists = False
            for sheet in sheets:
                if sheet.get('properties', {}).get('title', '') == self.sheet_name:
                    sheet_exists = True
                    break
                    
            if not sheet_exists:
                logging.error(f"Sheet '{self.sheet_name}' not found")
                raise Exception(f"Sheet '{self.sheet_name}' not found")
            
            # Setup headers
            self.setup_sheet_headers()
            logging.info(f"Successfully initialized sheet '{self.sheet_name}'")
            
        except Exception as e:
            logging.error(f"Error initializing sheet: {e}")
            raise

    def verify_sheet_access(self):
        """Verify access to the sheet and log details"""
        try:
            # First verify we can access the spreadsheet
            metadata = self.service.spreadsheets().get(
                spreadsheetId=self.spreadsheet_id
            ).execute()
            
            logging.info("\n=== Spreadsheet Access Verification ===")
            logging.info(f"Spreadsheet Title: {metadata.get('properties', {}).get('title')}")
            
            # Get all sheets
            sheets = metadata.get('sheets', [])
            logging.info(f"\nFound {len(sheets)} sheets:")
            
            found_target_sheet = False
            for sheet in sheets:
                properties = sheet.get('properties', {})
                title = properties.get('title', '')
                sheet_id = properties.get('sheetId')
                logging.info(f"- '{title}' (ID: {sheet_id})")
                
                if title == self.sheet_name:
                    found_target_sheet = True
                    logging.info(f"\nFound target sheet: '{title}'")
                    
                    # Try reading the target sheet
                    try:
                        result = self.service.spreadsheets().values().get(
                            spreadsheetId=self.spreadsheet_id,
                            range=f"{title}!A1:K1"
                        ).execute()
                        headers = result.get('values', [['No headers']])[0]
                        logging.info(f"Successfully read headers: {headers}")
                        return True
                    except Exception as e:
                        logging.error(f"Error reading target sheet: {e}")
                        return False
            
            if not found_target_sheet:
                logging.error(f"\nTarget sheet '{self.sheet_name}' not found!")
                logging.info("Available sheets:")
                for sheet in sheets:
                    logging.info(f"- '{sheet.get('properties', {}).get('title', '')}'")
                return False
            
        except Exception as e:
            logging.error(f"Sheet access verification failed: {str(e)}")
            logging.error("Full error details:", exc_info=True)
            return False 

    def save_results(self, df, timestamp=None):
        """Save results to both CSV and Google Sheets"""
        if df is None or df.empty:
            logging.info("No new results to save")
            return
        
        try:
            logging.info("\n=== Saving Results ===")
            logging.info(f"Number of records to save: {len(df)}")
            
            # Deep copy to avoid modifying original
            df_copy = df.copy()
            
            # Replace NaN/None with empty strings
            df_copy = df_copy.fillna('')
            
            # Convert boolean values to strings
            for col in df_copy.select_dtypes(include=['bool']).columns:
                df_copy[col] = df_copy[col].map({True: 'TRUE', False: 'FALSE'})
            
            # Convert all values to strings and replace 'nan' with empty string
            for col in df_copy.columns:
                df_copy[col] = df_copy[col].astype(str)
                df_copy[col] = df_copy[col].replace('nan', '')
                df_copy[col] = df_copy[col].replace('None', '')
            
            # Reorder columns to match sheet structure
            ordered_df = df_copy.reindex(columns=self.columns)
            
            # Convert to list of lists and clean any remaining NaN/None
            values = ordered_df.values.tolist()
            values = [['' if pd.isna(cell) or cell == 'nan' or cell == 'None' else str(cell) 
                      for cell in row] for row in values]
            
            logging.info(f"Prepared {len(values)} rows for upload")
            logging.info(f"Sample row: {values[0] if values else None}")
            
            # Always try to save to Google Sheets
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    body = {
                        'values': values
                    }
                    
                    logging.info(f"Attempting to append {len(values)} rows to Google Sheet (attempt {attempt + 1}/{max_retries})")
                    logging.info(f"Sheet: {self.sheet_name}")
                    logging.info(f"Spreadsheet ID: {self.spreadsheet_id}")
                    
                    result = self.service.spreadsheets().values().append(
                        spreadsheetId=self.spreadsheet_id,
                        range=f"{self.sheet_name}!A:K",
                        valueInputOption='RAW',
                        insertDataOption='INSERT_ROWS',
                        body=body
                    ).execute()
                    
                    rows_appended = result.get('updates', {}).get('updatedRows', 0)
                    logging.info(f"Successfully appended {rows_appended} rows to Google Sheet")
                    return result
                    
                except Exception as e:
                    if '403' in str(e):
                        logging.error("Permission denied. Please ensure the service account has Editor access to the sheet")
                        info = json.load(open('service-account.json'))
                        logging.error(f"Service account email: {info.get('client_email')}")
                    if attempt == max_retries - 1:
                        raise
                    else:
                        logging.warning(f"Google Sheets upload attempt {attempt + 1} failed, retrying in 5 seconds: {e}")
                        time.sleep(5)
                    
        except Exception as e:
            logging.error(f"Error in save_results: {e}")
            logging.error("Full error details:", exc_info=True)
            raise

    def compare_data_sources(self):
        """Compare data between CSV and Google Sheets"""
        try:
            logging.info("\n=== Comparing Data Sources ===")
            
            # Read CSV data
            csv_data = None
            if os.path.exists("mexico_english_freelancers.csv"):
                csv_data = pd.read_csv("mexico_english_freelancers.csv")
                logging.info(f"CSV Records: {len(csv_data)}")
                logging.info(f"CSV Columns: {csv_data.columns.tolist()}")
            else:
                logging.info("No CSV file found")
                
            # Read Google Sheets data
            try:
                sheet_data = self.service.spreadsheets().values().get(
                    spreadsheetId=self.spreadsheet_id,
                    range=f"{self.sheet_name}!A:K"
                ).execute()
                values = sheet_data.get('values', [])
                if values:
                    headers = values[0]
                    data = values[1:]
                    sheet_df = pd.DataFrame(data, columns=headers)
                    logging.info(f"Google Sheet Records: {len(sheet_df)}")
                    logging.info(f"Google Sheet Columns: {sheet_df.columns.tolist()}")
                    
                    if csv_data is not None:
                        # Compare records
                        csv_urls = set(csv_data['profile_url'])
                        sheet_urls = set(sheet_df['profile_url'])
                        
                        missing_in_sheet = csv_urls - sheet_urls
                        missing_in_csv = sheet_urls - csv_urls
                        
                        logging.info(f"\nRecords in CSV but not in Sheet: {len(missing_in_sheet)}")
                        if missing_in_sheet:
                            logging.info("First 5 missing URLs:")
                            for url in list(missing_in_sheet)[:5]:
                                logging.info(f"- {url}")
                                
                        logging.info(f"\nRecords in Sheet but not in CSV: {len(missing_in_csv)}")
                        if missing_in_csv:
                            logging.info("First 5 missing URLs:")
                            for url in list(missing_in_csv)[:5]:
                                logging.info(f"- {url}")
                        
                        return missing_in_sheet, missing_in_csv
                else:
                    logging.info("Google Sheet is empty")
                    
            except Exception as e:
                logging.error(f"Error reading Google Sheet: {e}")
                
        except Exception as e:
            logging.error(f"Error comparing data sources: {e}")
            logging.error("Full error details:", exc_info=True) 

    def sync_missing_records(self):
        """Sync any missing records from CSV to Google Sheet"""
        try:
            logging.info("Starting data sync...")
            missing_in_sheet, _ = self.compare_data_sources()
            
            if missing_in_sheet:
                logging.info(f"Found {len(missing_in_sheet)} records to sync")
                # Read the CSV
                csv_data = pd.read_csv("mexico_english_freelancers.csv")
                # Filter for missing records
                missing_records = csv_data[csv_data['profile_url'].isin(missing_in_sheet)]
                
                if not missing_records.empty:
                    # Save missing records
                    self.save_results(missing_records)
                    logging.info(f"Successfully synced {len(missing_records)} records")
                else:
                    logging.info("No records to sync after filtering")
            else:
                logging.info("No missing records found")
            
        except Exception as e:
            logging.error(f"Error syncing records: {e}")
            logging.error("Full error details:", exc_info=True) 