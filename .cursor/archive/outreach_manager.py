import sqlite3
import pandas as pd
import os
from datetime import datetime
import random
from nameparser import HumanName

class OutreachManager:
    def __init__(self, prospects_db='prospects.db'):
        self.db_path = prospects_db
        
    def get_prospects_for_outreach(self, limit=20, status="not_contacted"):
        """Get prospects that haven't been contacted yet"""
        conn = sqlite3.connect(self.db_path)
        
        query = f"""
        SELECT * FROM prospects 
        WHERE outreach_status = ? 
        ORDER BY viewed_date DESC
        LIMIT ?
        """
        
        df = pd.read_sql_query(query, conn, params=(status, limit))
        conn.close()
        
        return df
        
    def export_prospects_to_csv(self, filename="prospects_for_outreach.csv", limit=20):
        """Export prospects to CSV for manual outreach"""
        prospects = self.get_prospects_for_outreach(limit)
        
        if prospects.empty:
            print("No prospects available for outreach")
            return False
            
        # Add personalized message templates
        prospects['first_name'] = prospects['name'].apply(self.extract_first_name)
        prospects['message_template'] = prospects.apply(self.create_personalized_template, axis=1)
        
        # Export to CSV
        os.makedirs("outreach", exist_ok=True)
        file_path = f"outreach/{filename}"
        prospects.to_csv(file_path, index=False)
        
        print(f"Exported {len(prospects)} prospects to {file_path}")
        return file_path
        
    def extract_first_name(self, full_name):
        """Extract first name from full name using nameparser"""
        if not full_name:
            return ""
            
        try:
            name = HumanName(full_name)
            if name.first:
                return name.first
        except:
            pass
            
        # Fallback to simple extraction
        parts = full_name.split()
        if parts:
            return parts[0]
        return ""
        
    def create_personalized_template(self, row):
        """Create a personalized message template based on prospect data"""
        templates = [
            f"""Hi {row['first_name']},

I just wrote the book, Canva For Dummies, and wanted to share a special event I'm hosting just for residents of Mexico. I'm hosting a live 2-day Canva training on March 6-7 where I'll teach how to make money using Canva—selling templates, working with international clients, and using Canva for business.

If you're interested, you can check out more details here: 
https://jessestay.com/makemoneyoncanvamexico

Let me know if you have any questions!""",
            
            f"""Hello {row['first_name']},

I noticed your background in {row['title'] or 'design'} and wanted to reach out. I recently authored Canva For Dummies and am hosting a specialized 2-day workshop for Mexico-based professionals on March 6-7.

The focus will be on monetizing Canva skills through template sales, international client work, and business applications.

Details are available at: https://jessestay.com/makemoneyoncanvamexico

Would this be relevant to your work?"""
        ]
        
        # Select a random template
        return random.choice(templates)
        
    def mark_as_contacted(self, linkedin_url, notes=""):
        """Mark a prospect as contacted"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
        UPDATE prospects
        SET outreach_status = 'contacted', 
            notes = CASE WHEN ? != '' THEN ? ELSE notes END,
            last_updated = ?
        WHERE linkedin_url = ?
        ''', (notes, notes, datetime.now(), linkedin_url))
        
        conn.commit()
        conn.close()
        
    def update_response_status(self, linkedin_url, status, notes=""):
        """Update the response status of a prospect"""
        valid_statuses = ['not_contacted', 'contacted', 'responded', 'meeting_scheduled', 'not_interested']
        
        if status not in valid_statuses:
            print(f"Invalid status. Must be one of: {valid_statuses}")
            return False
            
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
        UPDATE prospects
        SET outreach_status = ?,
            notes = CASE WHEN ? != '' THEN ? ELSE notes END,
            last_updated = ?
        WHERE linkedin_url = ?
        ''', (status, notes, notes, datetime.now(), linkedin_url))
        
        conn.commit()
        conn.close()
        return True 