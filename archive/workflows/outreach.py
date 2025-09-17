"""Outreach workflow for LinkedIn contacts"""
import logging
import pandas as pd
import os
from datetime import datetime
import random
from nameparser import HumanName
from utils.config import get_config

class LinkedInOutreachWorkflow:
    """Manages the outreach process for LinkedIn contacts"""
    
    def __init__(self, db_manager):
        self.db_manager = db_manager
        self.templates_file = get_config('messaging', 'templates_file')
        
    def export_for_outreach(self, limit=20, status="not_contacted", filename=None):
        """Export prospects for manual outreach"""
        prospects = self.db_manager.get_prospects_for_outreach(limit, status)
        
        if not prospects:
            logging.warning("No prospects available for outreach")
            return False
            
        # Add personalized message templates
        prospects_df = pd.DataFrame(prospects)
        prospects_df['first_name'] = prospects_df['name'].apply(self.extract_first_name)
        prospects_df['message_template'] = prospects_df.apply(self.create_personalized_template, axis=1)
        
        # Export to CSV
        os.makedirs("outreach", exist_ok=True)
        if not filename:
            filename = f"outreach_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        file_path = os.path.join("outreach", filename)
        
        prospects_df.to_csv(file_path, index=False)
        
        logging.info(f"Exported {len(prospects)} prospects to {file_path}")
        return file_path
        
    def extract_first_name(self, full_name):
        """Extract first name from full name using nameparser"""
        if not full_name:
            return ""
            
        try:
            name = HumanName(full_name)
            if name.first:
                return name.first
        except Exception as e:
            logging.warning(f"Error parsing name '{full_name}': {e}")
            
        # Fallback to simple extraction
        parts = full_name.split()
        if parts:
            return parts[0]
        return ""
        
    def create_personalized_template(self, row):
        """Create a personalized message template based on prospect data"""
        # Load templates from file
        try:
            import json
            with open(self.templates_file, 'r') as f:
                templates = json.load(f)
                
            # Select a random template
            template = random.choice(templates)
            
            # Personalize the message
            message = template['body']
            
            # Replace placeholders
            for key, value in row.items():
                if isinstance(value, str):
                    placeholder = f"{{{key}}}"
                    if placeholder in message:
                        message = message.replace(placeholder, value)
            
            return message
            
        except Exception as e:
            logging.error(f"Error creating personalized template: {e}")
            # Fallback to a simple template
            return f"Hi {row.get('first_name', 'there')},\n\nI noticed your profile and wanted to connect."
            
    def update_outreach_status(self, profile_url, status, notes=""):
        """Update the outreach status of a profile"""
        return self.db_manager.update_outreach_status(profile_url, status, notes) 