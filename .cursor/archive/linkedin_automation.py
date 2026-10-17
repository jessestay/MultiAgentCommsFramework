#!/usr/bin/env python3
"""LinkedIn Safe Research & Outreach System - Main CLI"""
import argparse
import logging
import os
import sys
from datetime import datetime

# Import core components
from core.account_manager import LinkedInAccountManager
from core.database_manager import DatabaseManager

# Import workflows
from workflows.research import LinkedInResearchWorkflow
from workflows.outreach import LinkedInOutreachWorkflow

# Import utilities
from utils.config import get_config, Config

def setup_logging():
    """Set up logging configuration"""
    logs_dir = get_config('paths', 'logs_dir')
    os.makedirs(logs_dir, exist_ok=True)
    
    log_file = os.path.join(logs_dir, f"linkedin_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )
    
    logging.info("LinkedIn Automation Tool started")

def main():
    """Main entry point with command-line argument handling"""
    # Set up logging
    setup_logging()
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='LinkedIn Safe Research & Outreach System')
    
    # Mode selection
    subparsers = parser.add_subparsers(dest='mode', help='Operation mode')
    
    # Account manager mode
    account_parser = subparsers.add_parser('account', help='Account management')
    account_subparsers = account_parser.add_subparsers(dest='account_action')
    
    # Add account
    add_account_parser = account_subparsers.add_parser('add', help='Add LinkedIn account')
    add_account_parser.add_argument('--email', required=True, help='Account email')
    add_account_parser.add_argument('--username', required=True, help='Account username')
    add_account_parser.add_argument('--password', required=True, help='Account password')
    
    # List accounts
    list_accounts_parser = account_subparsers.add_parser('list', help='List all accounts')
    
    # Research mode
    research_parser = subparsers.add_parser('research', help='Profile research')
    research_parser.add_argument('--urls', required=True, help='File with LinkedIn profile URLs')
    research_parser.add_argument('--limit', type=int, default=10, help='Number of profiles to view')
    research_parser.add_argument('--headless', action='store_true', help='Run in headless mode')
    
    # Outreach mode
    outreach_parser = subparsers.add_parser('outreach', help='Outreach management')
    outreach_subparsers = outreach_parser.add_subparsers(dest='outreach_action')
    
    # Export prospects
    export_parser = outreach_subparsers.add_parser('export', help='Export prospects for manual outreach')
    export_parser.add_argument('--limit', type=int, default=20, help='Number of prospects to export')
    export_parser.add_argument('--filename', help='Output filename')
    
    # Update status
    update_parser = outreach_subparsers.add_parser('update', help='Update prospect status')
    update_parser.add_argument('--url', required=True, help='LinkedIn profile URL')
    update_parser.add_argument('--status', required=True, 
                              choices=['contacted', 'responded', 'meeting_scheduled', 'not_interested'],
                              help='New status')
    update_parser.add_argument('--notes', default='', help='Optional notes')
    
    # Database management command
    db_parser = subparsers.add_parser('database', help='Database management')
    db_subparsers = db_parser.add_subparsers(dest='db_action')
    
    # Initialize database
    init_db_parser = db_subparsers.add_parser('init', help='Initialize database')
    
    # Export database
    export_db_parser = db_subparsers.add_parser('export', help='Export database')
    export_db_parser.add_argument('--format', choices=['csv', 'json'], default='csv', help='Export format')
    export_db_parser.add_argument('--file', help='Output file')
    
    # Config command
    config_parser = subparsers.add_parser('config', help='Configuration management')
    config_subparsers = config_parser.add_subparsers(dest='config_action')
    
    # Generate default config
    gen_config_parser = config_subparsers.add_parser('generate', help='Generate default config file')
    
    # Update config
    update_config_parser = config_subparsers.add_parser('update', help='Update config value')
    update_config_parser.add_argument('--section', required=True, help='Config section')
    update_config_parser.add_argument('--key', required=True, help='Config key')
    update_config_parser.add_argument('--value', required=True, help='New value')
    
    args = parser.parse_args()
    
    if not args.mode:
        parser.print_help()
        return
    
    # Initialize components
    account_manager = LinkedInAccountManager()
    db_manager = DatabaseManager()
    
    # Handle different modes
    if args.mode == 'account':
        if args.account_action == 'add':
            success = account_manager.add_account(args.email, args.username, args.password)
            if success:
                logging.info(f"Account {args.username} added successfully")
                print(f"Account {args.username} added successfully")
            else:
                logging.error(f"Failed to add account {args.username}")
                print(f"Failed to add account {args.username}")
                
        elif args.account_action == 'list':
            accounts = account_manager.list_accounts()
            print("\nLinkedIn Accounts:")
            print("=" * 50)
            for account in accounts:
                print(f"ID: {account['id']}, Email: {account['email']}, " 
                      f"Username: {account['username']}, "
                      f"Status: {account['status']}, "
                      f"Daily Views: {account['daily_views']}")
            print("=" * 50)
        else:
            print("Please specify an account action")
            
    elif args.mode == 'research':
        workflow = LinkedInResearchWorkflow(headless=args.headless)
        results = workflow.run(args.urls, args.limit)
        
        # Print summary
        print("\nResearch Summary:")
        print("=" * 50)
        print(f"Total profiles: {len(results['profiles'])}")
        print(f"Successful: {results['success']}")
        print(f"Failed: {results['failure']}")
        print("=" * 50)
                
    elif args.mode == 'outreach':
        workflow = LinkedInOutreachWorkflow(db_manager)
        
        if args.outreach_action == 'export':
            file_path = workflow.export_for_outreach(
                limit=args.limit, 
                filename=args.filename
            )
            if file_path:
                print(f"\nProspects exported to: {file_path}")
                print("Use this file to manually contact prospects on LinkedIn")
                
        elif args.outreach_action == 'update':
            success = workflow.update_outreach_status(
                args.url, 
                args.status,
                args.notes
            )
            if success:
                print(f"Successfully updated status for {args.url}")
            else:
                print(f"Failed to update status for {args.url}")
        else:
            print("Please specify an outreach action")
    
    elif args.mode == 'database':
        if args.db_action == 'init':
            db_manager = DatabaseManager()
            print("Database initialized")
            
        elif args.db_action == 'export':
            # Implement database export functionality
            pass
        else:
            print("Please specify a database action")
    
    elif args.mode == 'config':
        if args.config_action == 'generate':
            Config.save_default()
            print("Default configuration saved to config.json")
            
        elif args.config_action == 'update':
            # Implement config update functionality
            pass
        else:
            print("Please specify a config action")
    
    logging.info("Operation completed!")

if __name__ == "__main__":
    main() 