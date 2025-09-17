import argparse
import time
import random
from account_manager import LinkedInAccountManager
from safe_profile_viewer import SafeProfileViewer
from outreach_manager import OutreachManager

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Safe LinkedIn Research Tool')
    parser.add_argument('--mode', choices=['add_account', 'view_profiles', 'export_outreach'],
                      help='Operation mode', required=True)
    parser.add_argument('--email', help='Account email (for add_account mode)')
    parser.add_argument('--username', help='Account username (for add_account mode)')
    parser.add_argument('--password', help='Account password (for add_account mode)')
    parser.add_argument('--urls', help='File with LinkedIn profile URLs (for view_profiles mode)')
    parser.add_argument('--limit', type=int, default=10, 
                      help='Number of profiles to view/export')
    parser.add_argument('--headless', action='store_true', 
                      help='Run in headless mode')
    
    args = parser.parse_args()
    
    # Initialize components
    account_manager = LinkedInAccountManager()
    
    if args.mode == 'add_account':
        if not args.email or not args.username or not args.password:
            print("Error: Email, username and password are required for add_account mode")
            return
            
        success = account_manager.add_account(args.email, args.username, args.password)
        if success:
            print(f"Account {args.username} added successfully")
        
    elif args.mode == 'view_profiles':
        if not args.urls:
            print("Error: File with LinkedIn profile URLs is required for view_profiles mode")
            return
            
        # Load URLs from file
        with open(args.urls, 'r') as f:
            urls = [line.strip() for line in f if line.strip()]
            
        # Limit the number of URLs
        urls = urls[:args.limit]
        
        # Initialize the profile viewer
        viewer = SafeProfileViewer(account_manager, headless=args.headless)
        
        # View profiles with delays between each
        for url in urls:
            print(f"\nViewing profile: {url}")
            success = viewer.view_profile(url)
            
            if success:
                # Random delay between profile views (3-8 minutes)
                delay = random.uniform(180, 480)
                print(f"Waiting {delay:.1f} seconds before next profile...")
                time.sleep(delay)
            else:
                print("Failed to view profile, continuing to next...")
                time.sleep(60)  # Wait a minute before trying the next one
                
    elif args.mode == 'export_outreach':
        outreach = OutreachManager()
        file_path = outreach.export_prospects_to_csv(limit=args.limit)
        if file_path:
            print(f"Successfully exported prospects to {file_path}")
            print("Use this file to manually contact prospects on LinkedIn")
    
    print("Operation completed!")

if __name__ == "__main__":
    main() 