#!/usr/bin/env python3
import os
import json
import datetime
import argparse

class RoleManager:
    def __init__(self, base_dir="roles"):
        self.base_dir = base_dir
        self.roles_dir = os.path.join(base_dir, "data")
        self.ensure_directories()
        
    def ensure_directories(self):
        """Ensure all necessary directories exist"""
        os.makedirs(self.roles_dir, exist_ok=True)
        
    def update_role(self, role_name, context_update):
        """Update a specific role's context file"""
        role_file = os.path.join(self.roles_dir, f"{role_name.lower().replace(' ', '_')}.json")
        
        # Load existing data or create new
        if os.path.exists(role_file):
            with open(role_file, 'r') as f:
                role_data = json.load(f)
        else:
            role_data = {
                "name": role_name,
                "created": datetime.datetime.now().isoformat(),
                "context": [],
                "interactions": []
            }
        
        # Update with new context
        role_data["updated"] = datetime.datetime.now().isoformat()
        role_data["context"].append({
            "timestamp": datetime.datetime.now().isoformat(),
            "update": context_update
        })
        
        # Save updated data
        with open(role_file, 'w') as f:
            json.dump(role_data, f, indent=2)
            
        print(f"Role '{role_name}' updated with context: {context_update[:50]}...")
        
        return role_data
    
    def log_interaction(self, role_name, interaction_data):
        """Log an interaction with a specific role"""
        role_file = os.path.join(self.roles_dir, f"{role_name.lower().replace(' ', '_')}.json")
        
        # Load existing data
        if os.path.exists(role_file):
            with open(role_file, 'r') as f:
                role_data = json.load(f)
        else:
            role_data = {
                "name": role_name,
                "created": datetime.datetime.now().isoformat(),
                "context": [],
                "interactions": []
            }
        
        # Add interaction
        role_data["updated"] = datetime.datetime.now().isoformat()
        role_data["interactions"].append({
            "timestamp": datetime.datetime.now().isoformat(),
            "data": interaction_data
        })
        
        # Save updated data
        with open(role_file, 'w') as f:
            json.dump(role_data, f, indent=2)
        
        print(f"Interaction logged for role '{role_name}'")
        
        return role_data
    
    def initialize_all_roles(self):
        """Initialize all predefined roles with basic context"""
        roles = [
            "Executive Secretary",
            "Business Income Coach",
            "Marketing Director",
            "Social Media Manager",
            "Copy Technical Writer",
            "Utah Family Lawyer",
            "Debt Consumer Law Coach",
            "Software Engineering Scrum Master",
            "Dating Relationship Coach"
        ]
        
        for role in roles:
            self.update_role(role, f"Initial context for {role} role")
            print(f"Initialized role: {role}")

def main():
    parser = argparse.ArgumentParser(description="Manage AI role context and interactions")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Initialize command
    init_parser = subparsers.add_parser("init", help="Initialize all roles")
    
    # Update role command
    update_parser = subparsers.add_parser("update", help="Update a role's context")
    update_parser.add_argument("role", help="Name of the role to update")
    update_parser.add_argument("context", help="Context update to add")
    
    # Log interaction command
    log_parser = subparsers.add_parser("log", help="Log an interaction with a role")
    log_parser.add_argument("role", help="Name of the role")
    log_parser.add_argument("topic", help="Topic of interaction")
    log_parser.add_argument("outcome", help="Outcome of interaction")
    
    args = parser.parse_args()
    manager = RoleManager()
    
    if args.command == "init":
        manager.initialize_all_roles()
    elif args.command == "update":
        manager.update_role(args.role, args.context)
    elif args.command == "log":
        manager.log_interaction(args.role, {
            "topic": args.topic,
            "outcome": args.outcome
        })
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 