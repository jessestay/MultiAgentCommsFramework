"""
Token storage module for secure management of OAuth tokens.

This module handles secure storage and retrieval of OAuth tokens,
including encryption and decryption.
"""

import os
import json
import base64
from typing import Dict, Any, Optional
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class TokenStorage:
    """
    Handles secure storage and retrieval of OAuth tokens.
    """

    def __init__(self):
        """
        Initialize the TokenStorage instance.
        """
        self.encryption_key = os.environ.get('TOKEN_ENCRYPTION_KEY')
        self.storage_path = os.environ.get('TOKEN_STORAGE_PATH', './tokens')
        
        # Create storage directory if it doesn't exist
        if not os.path.exists(self.storage_path):
            os.makedirs(self.storage_path)
            
        # Initialize Fernet cipher for encryption/decryption
        self.cipher = self._create_cipher()

    def _create_cipher(self) -> Fernet:
        """
        Create a Fernet cipher for encryption/decryption.

        Returns:
            Fernet cipher instance.
        """
        # Use PBKDF2 to derive a key from the encryption key
        salt = b'calendar_integration_salt'  # Fixed salt for reproducibility
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(self.encryption_key.encode()))
        return Fernet(key)

    def _get_token_path(self, user_id: str) -> str:
        """
        Get the file path for a user's token.

        Args:
            user_id: The ID of the user.

        Returns:
            The file path for the user's token.
        """
        return os.path.join(self.storage_path, f"{user_id}.json")

    def encrypt_token(self, token_data: Dict[str, Any]) -> bytes:
        """
        Encrypt token data.

        Args:
            token_data: The token data to encrypt.

        Returns:
            Encrypted token data as bytes.
        """
        token_json = json.dumps(token_data).encode()
        return self.cipher.encrypt(token_json)

    def decrypt_token(self, encrypted_token: bytes) -> Dict[str, Any]:
        """
        Decrypt token data.

        Args:
            encrypted_token: The encrypted token data.

        Returns:
            Decrypted token data as a dictionary.
        """
        decrypted_json = self.cipher.decrypt(encrypted_token)
        return json.loads(decrypted_json)

    def save_token(self, user_id: str, token_data: Dict[str, Any]) -> bool:
        """
        Save a token for a user.

        Args:
            user_id: The ID of the user.
            token_data: The token data to save.

        Returns:
            True if the token was saved successfully, False otherwise.
        """
        try:
            token_path = self._get_token_path(user_id)
            
            # Create directory if it doesn't exist
            token_dir = os.path.dirname(token_path)
            if not os.path.exists(token_dir):
                os.makedirs(token_dir)
                
            # Encrypt and save the token
            encrypted_token = self.encrypt_token(token_data)
            with open(token_path, 'w') as f:
                json.dump({'encrypted_token': encrypted_token.decode()}, f)
                
            return True
        except Exception as e:
            print(f"Error saving token: {e}")
            return False

    def load_token(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Load a token for a user.

        Args:
            user_id: The ID of the user.

        Returns:
            The token data if found and decrypted successfully, None otherwise.
        """
        try:
            token_path = self._get_token_path(user_id)
            
            if not os.path.exists(token_path):
                return None
                
            # Load and decrypt the token
            with open(token_path, 'r') as f:
                data = json.load(f)
                encrypted_token = data['encrypted_token'].encode()
                
            return self.decrypt_token(encrypted_token)
        except Exception as e:
            print(f"Error loading token: {e}")
            return None

    def delete_token(self, user_id: str) -> bool:
        """
        Delete a token for a user.

        Args:
            user_id: The ID of the user.

        Returns:
            True if the token was deleted successfully, False otherwise.
        """
        try:
            token_path = self._get_token_path(user_id)
            
            if os.path.exists(token_path):
                os.remove(token_path)
                
            return True
        except Exception as e:
            print(f"Error deleting token: {e}")
            return False 