"""
Message encryption for secure role-based communication.
Provides encryption and decryption of messages.
"""

import base64
import json
import os
import logging
from typing import Dict, Any, Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("message_encryption.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("MessageEncryption")

class MessageEncryption:
    """
    Handles encryption and decryption of messages.
    """
    
    def __init__(self, key: Optional[str] = None, salt: Optional[bytes] = None):
        """
        Initialize the message encryption.
        
        Args:
            key: Encryption key (if None, a new key will be generated)
            salt: Salt for key derivation (if None, a new salt will be generated)
        """
        # Generate or use provided salt
        self.salt = salt or os.urandom(16)
        
        # Generate or use provided key
        if key:
            self.key = self._derive_key(key.encode(), self.salt)
        else:
            # Generate a random key
            self.key = Fernet.generate_key()
        
        # Initialize Fernet cipher
        self.cipher = Fernet(self.key)
        
        logger.info("MessageEncryption initialized")
    
    def _derive_key(self, password: bytes, salt: bytes) -> bytes:
        """
        Derive a key from a password and salt.
        
        Args:
            password: Password bytes
            salt: Salt bytes
            
        Returns:
            Derived key bytes
        """
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000
        )
        key = base64.urlsafe_b64encode(kdf.derive(password))
        return key
    
    def encrypt_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Encrypt a message.
        
        Args:
            message: Message object to encrypt
            
        Returns:
            Encrypted message object
        """
        try:
            # Convert message to JSON string
            message_json = json.dumps(message)
            
            # Encrypt the JSON string
            encrypted_data = self.cipher.encrypt(message_json.encode())
            
            # Create encrypted message object
            encrypted_message = {
                "id": message.get("id", ""),
                "encrypted": True,
                "data": base64.b64encode(encrypted_data).decode(),
                "source_role": message.get("source_role", ""),
                "target_role": message.get("target_role", "")
            }
            
            logger.debug(f"Encrypted message {message.get('id', '')}")
            return encrypted_message
        except Exception as e:
            logger.error(f"Error encrypting message: {e}")
            return message  # Return original message on error
    
    def decrypt_message(self, encrypted_message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Decrypt an encrypted message.
        
        Args:
            encrypted_message: Encrypted message object
            
        Returns:
            Decrypted message object
        """
        # Check if message is actually encrypted
        if not encrypted_message.get("encrypted", False):
            return encrypted_message
        
        try:
            # Get encrypted data
            encrypted_data = base64.b64decode(encrypted_message.get("data", ""))
            
            # Decrypt the data
            decrypted_json = self.cipher.decrypt(encrypted_data).decode()
            
            # Parse JSON to get original message
            message = json.loads(decrypted_json)
            
            logger.debug(f"Decrypted message {encrypted_message.get('id', '')}")
            return message
        except Exception as e:
            logger.error(f"Error decrypting message: {e}")
            # Return a minimal valid message on error
            return {
                "id": encrypted_message.get("id", ""),
                "source_role": encrypted_message.get("source_role", ""),
                "target_role": encrypted_message.get("target_role", ""),
                "content": "Error: Could not decrypt message",
                "timestamp": 0,
                "read": False,
                "decryption_error": True
            }


# Example usage
if __name__ == "__main__":
    # Create encryption instance
    encryption = MessageEncryption(key="test_key")
    
    # Example message
    message = {
        "id": "test_message",
        "source_role": "ES",
        "target_role": "SET",
        "content": "This is a secret message",
        "timestamp": 1234567890,
        "read": False
    }
    
    # Encrypt message
    encrypted = encryption.encrypt_message(message)
    print("Encrypted message:", encrypted)
    
    # Decrypt message
    decrypted = encryption.decrypt_message(encrypted)
    print("Decrypted message:", decrypted)
    
    # Verify decryption was successful
    assert decrypted["content"] == message["content"]
    print("Encryption/decryption successful!") 