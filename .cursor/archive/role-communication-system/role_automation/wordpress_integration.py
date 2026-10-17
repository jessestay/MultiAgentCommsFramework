"""
WordPress Integration for AI Role Communication Automation System

This module provides integration capabilities with WordPress:
1. WordPress admin panel integration
2. Role communication via WordPress
3. Conversation display in WordPress
"""

import os
import json
import requests
from typing import Dict, List, Any, Optional

class WordPressIntegration:
    """Integrates the AI role communication system with WordPress."""
    
    def __init__(self, message_router, security_manager, config_path=None):
        """
        Initialize the WordPress integration with message router and configuration.
        
        Args:
            message_router: The MessageRouter instance for sending messages
            security_manager: The SecurityManager instance for access control
            config_path (str): Path to the WordPress configuration file
        """
        self.message_router = message_router
        self.security_manager = security_manager
        self.config_path = config_path or os.path.join('config', 'wordpress.json')
        
        # Load WordPress configuration
        self.config = self._load_config()
        
        # Initialize WordPress API client
        self.api_url = self.config.get('api_url')
        self.api_username = self.config.get('api_username')
        self.api_password = self.config.get('api_password')
        self.api_token = None
    
    def _load_config(self):
        """Load WordPress configuration from JSON file."""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    return json.load(f)
            else:
                # Create default configuration
                default_config = {
                    "api_url": "https://example.com/wp-json/",
                    "api_username": "",
                    "api_password": "",
                    "role_page_id": 0,
                    "conversation_post_type": "ai_conversation",
                    "user_role_mapping": {},
                    "webhook_secret": ""
                }
                
                # Ensure config directory exists
                os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
                
                # Save default configuration
                with open(self.config_path, 'w') as f:
                    json.dump(default_config, f, indent=4)
                
                return default_config
        except Exception as e:
            print(f"Error loading WordPress configuration: {e}")
            return {
                "api_url": "",
                "api_username": "",
                "api_password": ""
            }
    
    def authenticate(self):
        """
        Authenticate with the WordPress API.
        
        Returns:
            bool: True if authentication was successful, False otherwise
        """
        if not self.api_url or not self.api_username or not self.api_password:
            print("WordPress API credentials not configured")
            return False
        
        try:
            # Authenticate with WordPress REST API
            auth_url = f"{self.api_url.rstrip('/')}/jwt-auth/v1/token"
            response = requests.post(auth_url, data={
                "username": self.api_username,
                "password": self.api_password
            })
            
            if response.status_code == 200:
                data = response.json()
                self.api_token = data.get('token')
                return True
            else:
                print(f"WordPress authentication failed: {response.text}")
                return False
        except Exception as e:
            print(f"Error authenticating with WordPress: {e}")
            return False
    
    def create_conversation_post(self, conversation_id, title=None):
        """
        Create a WordPress post for a conversation.
        
        Args:
            conversation_id (str): The conversation identifier
            title (str, optional): Custom title for the post
            
        Returns:
            int: The post ID if successful, 0 otherwise
        """
        if not self.api_token:
            if not self.authenticate():
                return 0
        
        try:
            # Get conversation data
            conversation = self.message_router.storage_manager.get_conversation(conversation_id)
            if not conversation:
                return 0
            
            # Generate title if not provided
            if not title:
                roles = conversation.get("metadata", {}).get("roles", [])
                role_str = " and ".join(roles)
                title = f"Conversation between {role_str}"
            
            # Format conversation content
            content = self.message_router.format_conversation_for_display(conversation)
            
            # Create post
            post_type = self.config.get('conversation_post_type', 'post')
            posts_url = f"{self.api_url.rstrip('/')}/wp/v2/{post_type}"
            
            response = requests.post(
                posts_url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "title": title,
                    "content": content,
                    "status": "private",
                    "meta": {
                        "conversation_id": conversation_id
                    }
                }
            )
            
            if response.status_code in (200, 201):
                data = response.json()
                post_id = data.get('id', 0)
                
                # Update conversation metadata with post ID
                if post_id:
                    conversation["metadata"]["wordpress_post_id"] = post_id
                    self.message_router.storage_manager.add_message(
                        conversation_id,
                        {
                            "content": f"Conversation published to WordPress (Post ID: {post_id})",
                            "source_role": "SYSTEM",
                            "metadata": {
                                "wordpress_post_id": post_id
                            }
                        }
                    )
                
                return post_id
            else:
                print(f"Error creating WordPress post: {response.text}")
                return 0
        except Exception as e:
            print(f"Error creating conversation post: {e}")
            return 0
    
    def update_conversation_post(self, conversation_id):
        """
        Update a WordPress post for a conversation.
        
        Args:
            conversation_id (str): The conversation identifier
            
        Returns:
            bool: True if update was successful, False otherwise
        """
        if not self.api_token:
            if not self.authenticate():
                return False
        
        try:
            # Get conversation data
            conversation = self.message_router.storage_manager.get_conversation(conversation_id)
            if not conversation:
                return False
            
            # Check if post ID exists in metadata
            post_id = conversation.get("metadata", {}).get("wordpress_post_id")
            if not post_id:
                # Create new post instead
                return self.create_conversation_post(conversation_id) > 0
            
            # Format conversation content
            content = self.message_router.format_conversation_for_display(conversation)
            
            # Update post
            post_type = self.config.get('conversation_post_type', 'post')
            post_url = f"{self.api_url.rstrip('/')}/wp/v2/{post_type}/{post_id}"
            
            response = requests.post(
                post_url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "content": content
                }
            )
            
            if response.status_code == 200:
                return True
            else:
                print(f"Error updating WordPress post: {response.text}")
                return False
        except Exception as e:
            print(f"Error updating conversation post: {e}")
            return False
    
    def handle_webhook(self, request_data, request_headers):
        """
        Handle incoming webhook from WordPress.
        
        Args:
            request_data (dict): The webhook request data
            request_headers (dict): The webhook request headers
            
        Returns:
            dict: Response data
        """
        try:
            # Verify webhook secret
            webhook_secret = self.config.get('webhook_secret', '')
            if webhook_secret:
                header_secret = request_headers.get('X-Webhook-Secret', '')
                if header_secret != webhook_secret:
                    return {
                        "success": False,
                        "error": "Invalid webhook secret"
                    }
            
            # Process webhook action
            action = request_data.get('action')
            
            if action == 'send_message':
                # Extract message data
                source_role = request_data.get('source_role')
                target_role = request_data.get('target_role')
                content = request_data.get('content')
                conversation_id = request_data.get('conversation_id')
                
                if not source_role or not content:
                    return {
                        "success": False,
                        "error": "Missing required fields"
                    }
                
                # Format message
                if target_role:
                    message_text = f"[{source_role}]: @{target_role}: {content}"
                else:
                    message_text = f"[{source_role}]: {content}"
                
                # Route message
                result = self.message_router.route_message(
                    message_text,
                    conversation_id=conversation_id,
                    metadata={"source": "wordpress_webhook"}
                )
                
                # Update WordPress post if needed
                if result.get("success") and result.get("conversation_id"):
                    self.update_conversation_post(result["conversation_id"])
                
                return result
            
            elif action == 'get_conversation':
                # Extract conversation ID
                conversation_id = request_data.get('conversation_id')
                
                if not conversation_id:
                    return {
                        "success": False,
                        "error": "Missing conversation ID"
                    }
                
                # Get conversation
                conversation = self.message_router.storage_manager.get_conversation(conversation_id)
                
                if not conversation:
                    return {
                        "success": False,
                        "error": "Conversation not found"
                    }
                
                return {
                    "success": True,
                    "conversation": conversation
                }
            
            elif action == 'list_conversations':
                # Extract filter criteria
                filter_criteria = request_data.get('filter_criteria', {})
                
                # List conversations
                conversations = self.message_router.storage_manager.list_conversations(filter_criteria)
                
                return {
                    "success": True,
                    "conversations": conversations
                }
            
            else:
                return {
                    "success": False,
                    "error": f"Unknown action: {action}"
                }
        except Exception as e:
            print(f"Error handling webhook: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def create_role_admin_page(self):
        """
        Create or update the role administration page in WordPress.
        
        Returns:
            int: The page ID if successful, 0 otherwise
        """
        if not self.api_token:
            if not self.authenticate():
                return 0
        
        try:
            # Check if page already exists
            page_id = self.config.get('role_page_id', 0)
            
            # Prepare page content
            title = "AI Role Communication System"
            content = """
            <!-- wp:heading -->
            <h2>AI Role Communication System</h2>
            <!-- /wp:heading -->
            
            <!-- wp:paragraph -->
            <p>This page provides an interface to the AI Role Communication System.</p>
            <!-- /wp:paragraph -->
            
            <!-- wp:shortcode -->
            [ai_role_communication]
            <!-- /wp:shortcode -->
            """
            
            if page_id:
                # Update existing page
                page_url = f"{self.api_url.rstrip('/')}/wp/v2/pages/{page_id}"
                response = requests.post(
                    page_url,
                    headers={
                        "Authorization": f"Bearer {self.api_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "content": content
                    }
                )
            else:
                # Create new page
                pages_url = f"{self.api_url.rstrip('/')}/wp/v2/pages"
                response = requests.post(
                    pages_url,
                    headers={
                        "Authorization": f"Bearer {self.api_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "title": title,
                        "content": content,
                        "status": "private"
                    }
                )
            
            if response.status_code in (200, 201):
                data = response.json()
                page_id = data.get('id', 0)
                
                # Update configuration with page ID
                if page_id:
                    self.config['role_page_id'] = page_id
                    with open(self.config_path, 'w') as f:
                        json.dump(self.config, f, indent=4)
                
                return page_id
            else:
                print(f"Error creating WordPress page: {response.text}")
                return 0
        except Exception as e:
            print(f"Error creating role admin page: {e}")
            return 0
    
    def map_wordpress_user_to_role(self, user_id, role_id):
        """
        Map a WordPress user to an AI role.
        
        Args:
            user_id (int): The WordPress user ID
            role_id (str): The AI role identifier
            
        Returns:
            bool: True if mapping was successful, False otherwise
        """
        try:
            # Check if role is authorized
            if not self.security_manager.is_role_authorized(role_id):
                return False
            
            # Update user-role mapping
            user_role_mapping = self.config.get('user_role_mapping', {})
            user_role_mapping[str(user_id)] = role_id
            self.config['user_role_mapping'] = user_role_mapping
            
            # Save configuration
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=4)
            
            return True
        except Exception as e:
            print(f"Error mapping user to role: {e}")
            return False
    
    def get_role_for_wordpress_user(self, user_id):
        """
        Get the AI role for a WordPress user.
        
        Args:
            user_id (int): The WordPress user ID
            
        Returns:
            str: The role identifier, or None if not mapped
        """
        user_role_mapping = self.config.get('user_role_mapping', {})
        return user_role_mapping.get(str(user_id))
    
    def register_wordpress_hooks(self):
        """
        Register necessary WordPress hooks (to be called from WordPress plugin).
        
        This method is meant to be called from a WordPress plugin to register
        the necessary hooks for integration.
        
        Returns:
            dict: Hook registration information
        """
        return {
            "shortcodes": [
                {
                    "tag": "ai_role_communication",
                    "callback": "render_ai_role_communication"
                }
            ],
            "rest_routes": [
                {
                    "route": "/ai-roles/v1/send-message",
                    "methods": ["POST"],
                    "callback": "handle_send_message"
                },
                {
                    "route": "/ai-roles/v1/get-conversation",
                    "methods": ["GET"],
                    "callback": "handle_get_conversation"
                },
                {
                    "route": "/ai-roles/v1/list-conversations",
                    "methods": ["GET"],
                    "callback": "handle_list_conversations"
                }
            ],
            "admin_pages": [
                {
                    "title": "AI Role Communication",
                    "menu_title": "AI Roles",
                    "capability": "manage_options",
                    "menu_slug": "ai-role-communication",
                    "callback": "render_admin_page"
                }
            ]
        } 