#!/usr/bin/env python
"""
Script to send messages to all roles
"""

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter

def main():
    """Send messages to all roles."""
    print("Initializing system components...")
    
    # Initialize components
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Messages to send
    messages = [
        {
            "source": "ES",
            "target": "MD",
            "message": "Please review and finalize the landing page content and WooCommerce product description for the Premium Signed Book Offer. Also provide input on specific marketing angles to emphasize. You can use this app to communicate back to me."
        },
        {
            "source": "ES",
            "target": "CTW",
            "message": "Please review all written content for the landing page, product description, and email templates. Also, I need your assistance in finalizing the documentation for the AI Communication System. You can use this app to communicate back to me."
        },
        {
            "source": "ES",
            "target": "SMM",
            "message": "Please prepare social media announcements for the Premium Signed Book Offer and provide input on how to leverage social channels for the product launch. You can use this app to communicate back to me."
        },
        {
            "source": "ES",
            "target": "SE",
            "message": "Please review the testing strategy for the AI Communication System and assist in coordinating the final development tasks and deployment. You can use this app to communicate back to me."
        },
        {
            "source": "ES",
            "target": "BIC",
            "message": "Please provide input on the pricing strategy and value proposition for the Premium Signed Book Offer and suggest how to position the offer for maximum conversion. You can use this app to communicate back to me."
        }
    ]
    
    # Send all messages
    for msg in messages:
        formatted_message = f"[{msg['source']}]: @{msg['target']}: {msg['message']}"
        print(f"Sending message: {formatted_message}")
        result = message_router.route_message(formatted_message)
        print(f"Result: {result}")
        print("-" * 50)

if __name__ == "__main__":
    main() 