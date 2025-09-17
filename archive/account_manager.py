import json
import os
import random
from datetime import datetime, timedelta
import sqlite3
from imap_tools import MailBox, AND  # For email verification
import logging

class LinkedInAccountManager:
    def __init__(self, db_path='linkedin_accounts.db'):
        """Initialize the account manager with a database"""
        self.db_path = db_path
        self._setup_database()
        
    def _setup_database(self):
        """Create the accounts database if it doesn't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create accounts table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            email TEXT UNIQUE,
            username TEXT,
            password TEXT,
            last_used TIMESTAMP,
            daily_views INTEGER DEFAULT 0,
            last_view_reset TIMESTAMP,
            status TEXT DEFAULT 'active',
            notes TEXT
        )
        ''')
        
        conn.commit()
        conn.close()
        
    def add_account(self, email, username, password, notes=""):
        """Add a new LinkedIn account to the system"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
            INSERT INTO accounts (email, username, password, last_used, last_view_reset, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            ''', (email, username, password, datetime.now(), datetime.now(), notes))
            
            conn.commit()
            print(f"Account {username} added successfully")
            return True
        except sqlite3.IntegrityError:
            print(f"Account with email {email} already exists")
            return False
        finally:
            conn.close()
    
    def get_available_account(self, max_daily_views=15):
        """Get an account that hasn't exceeded daily view limits"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Reset view counts for accounts that haven't been used in 24 hours
        cursor.execute('''
        UPDATE accounts 
        SET daily_views = 0, last_view_reset = CURRENT_TIMESTAMP
        WHERE datetime(last_view_reset) < datetime('now', '-1 day')
        ''')
        
        # Get accounts with available view capacity
        cursor.execute('''
        SELECT * FROM accounts
        WHERE status = 'active' AND daily_views < ?
        ORDER BY last_used ASC
        LIMIT 1
        ''', (max_daily_views,))
        
        account = cursor.fetchone()
        
        if account:
            # Update last used time
            cursor.execute('''
            UPDATE accounts
            SET last_used = CURRENT_TIMESTAMP
            WHERE id = ?
            ''', (account['id'],))
            
            conn.commit()
            account_dict = dict(account)
            conn.close()
            return account_dict
        else:
            conn.close()
            return None
            
    def increment_view_count(self, account_id):
        """Increment the daily view count for an account"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
        UPDATE accounts
        SET daily_views = daily_views + 1
        WHERE id = ?
        ''', (account_id,))
        
        conn.commit()
        conn.close()
        
    def update_account_status(self, account_id, status, notes=""):
        """Update account status (active, suspended, etc.)"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
        UPDATE accounts
        SET status = ?, notes = CASE WHEN ? != '' THEN ? ELSE notes END
        WHERE id = ?
        ''', (status, notes, notes, account_id))
        
        conn.commit()
        conn.close()
        
    def list_accounts(self):
        """List all accounts and their status"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM accounts ORDER BY status, daily_views')
        accounts = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        return accounts 
    
    def check_account_health(self, account_id):
        """Check account health through email monitoring"""
        account = self.get_account_by_id(account_id)
        if not account or not account.get('email_password'):
            return {'status': 'unknown', 'reason': 'Missing account or email credentials'}
            
        try:
            security_issues = self.check_linkedin_emails(
                account['email'], 
                account['email_password']
            )
            
            if security_issues:
                self.update_account_status(
                    account_id, 
                    'warning', 
                    f"Security issues detected: {', '.join([i['subject'] for i in security_issues])}"
                )
                return {'status': 'warning', 'issues': security_issues}
            
            return {'status': 'healthy'}
            
        except Exception as e:
            logging.error(f"Error checking account health: {e}")
            return {'status': 'error', 'reason': str(e)}
    
    def check_linkedin_emails(self, email, password, days=7):
        """Check for LinkedIn emails to verify account status"""
        with MailBox('imap.gmail.com').login(email, password) as mailbox:
            # Search for recent LinkedIn emails
            emails = mailbox.fetch(
                criteria=AND(from_='linkedin.com', seen=False, date_gte=datetime.now() - timedelta(days=days)),
                mark_seen=False
            )
            
            security_issues = []
            for msg in emails:
                if any(kw in msg.subject.lower() for kw in ['unusual', 'security', 'verify', 'confirm']):
                    security_issues.append({
                        'date': msg.date,
                        'subject': msg.subject
                    })
                    
            return security_issues 