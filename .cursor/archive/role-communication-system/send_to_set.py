#!/usr/bin/env python
from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter

def main():
    print('Initializing system components...')
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    message = '[ES]: @SET: Thank you for implementing the improvements to the StorageManager class. Can you confirm receipt of this message?'
    print(f'Sending message: {message}')
    result = message_router.route_message(message)
    print(f'Result: {result}')

if __name__ == '__main__':
    main() 