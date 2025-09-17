"""Database manager for LinkedIn research"""
import sqlite3
import json
import os

class DatabaseManager:
    def __init__(self, db_path='linkedin_research.db'):
        self.db_path = db_path
        self._setup_database()
        
    def _setup_database(self):
        """Create enhanced database schema"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create enhanced prospects table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS prospects (
            id INTEGER PRIMARY KEY,
            linkedin_url TEXT UNIQUE,
            name TEXT,
            title TEXT,
            company TEXT,
            location TEXT,
            about TEXT,
            experiences TEXT,  -- JSON array
            education TEXT,    -- JSON array
            skills TEXT,       -- JSON array
            notes TEXT,
            viewed_date TIMESTAMP,
            viewed_by INTEGER,
            outreach_status TEXT DEFAULT 'not_contacted',
            last_contacted TIMESTAMP,
            last_updated TIMESTAMP,
            FOREIGN KEY (viewed_by) REFERENCES accounts(id)
        )
        ''')
        
        # Create tags table for better organization
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE,
            color TEXT
        )
        ''')
        
        # Create prospect_tags table for many-to-many relationship
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS prospect_tags (
            prospect_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (prospect_id, tag_id),
            FOREIGN KEY (prospect_id) REFERENCES prospects(id),
            FOREIGN KEY (tag_id) REFERENCES tags(id)
        )
        ''')
        
        # Create interaction_history table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS interaction_history (
            id INTEGER PRIMARY KEY,
            prospect_id INTEGER,
            type TEXT,  -- 'view', 'message', 'connection', etc.
            date TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (prospect_id) REFERENCES prospects(id)
        )
        ''')
        
        conn.commit()
        conn.close()
        
    def save_prospect(self, data, account_id):
        """Save enhanced prospect data"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Convert complex objects to JSON strings
            experiences = json.dumps(data.get('experiences', []))
            education = json.dumps(data.get('education', []))
            skills = json.dumps(data.get('skills', []))
            
            cursor.execute('''
            INSERT OR REPLACE INTO prospects 
            (linkedin_url, name, title, company, location, about, experiences, education, skills, viewed_date, viewed_by, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
            ''', (
                data.get('linkedin_url', ''),
                data.get('name', ''),
                data.get('title', ''),
                data.get('company', ''),
                data.get('location', ''),
                data.get('about', ''),
                experiences,
                education,
                skills,
                account_id
            ))
            
            # Log the interaction
            prospect_id = cursor.lastrowid
            cursor.execute('''
            INSERT INTO interaction_history (prospect_id, type, date, notes)
            VALUES (?, 'view', datetime('now'), ?)
            ''', (prospect_id, f"Viewed by account {account_id}"))
            
            conn.commit()
            return prospect_id
            
        except Exception as e:
            conn.rollback()
            logging.error(f"Error saving prospect: {e}")
            return None
            
        finally:
            conn.close() 