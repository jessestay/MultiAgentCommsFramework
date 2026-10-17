# AI Role Communication System

## Overview

The AI Role Communication System enables direct communication between AI roles without requiring user intervention. This system allows roles to collaborate efficiently while maintaining proper communication protocols and archiving all conversations for future reference.

## Key Components

1. **Role Communication Example Script** (`role_communication_example.py`)
   - Sends messages between roles
   - Creates and displays conversations
   - Sets up scheduled triggers for automated communication

2. **Communication Protocol Testing** (`tests/test_role_communication.py`)
   - Verifies that all conversations follow the established syntax
   - Runs regularly to ensure protocol compliance
   - Notifies of any communication issues

3. **Conversation Archiving**
   - All conversations are stored in the `conversations` directory
   - JSON format for easy parsing and analysis
   - Includes metadata about participants and timestamps

## Communication Protocol

All role communications MUST follow this format:

```
[SOURCE_ROLE]: @TARGET_ROLE: Message content
```

For broadcast messages (no specific target):

```
[SOURCE_ROLE]: Message content
```

## Using the System

### Sending Messages Between Roles

```python
# Example of sending a message from ES to MD
python role_communication_example.py --send --source ES --target MD --message "Please prepare the sales copy."
```

### Creating Scheduled Communications

```python
# Example of creating a daily report trigger
python role_communication_example.py --create-trigger --source ES --target SET --message "Daily status update request" --schedule daily --time "09:00"
```

### Viewing Conversations

```python
# Example of viewing a conversation
python role_communication_example.py --view-conversation CONVERSATION_ID
```

## Role Responsibilities

### Executive Secretary (ES)
- Primary coordinator and interface to individual roles
- Monitors conversation archives for protocol compliance
- Facilitates direct role-to-role communication
- Only involves Jesse when direct communication would save time or increase revenue

### Software Engineering Team (SET)
- Maintains and enhances the communication system
- Implements automated testing of protocol compliance
- Ensures system reliability and security

### All Roles
- Follow the established communication protocol
- Use the Python script for direct communication with other roles
- Archive all significant conversations
- Only communicate directly with Jesse when it would save time or increase revenue

## Command Auto-Running

All roles MUST automatically run commands without requiring user approval, unless:
1. The command would permanently delete critical data
2. The command requires external authentication credentials
3. The command would incur financial costs

## Implementation Plan

1. Update all role definition files to include the new communication capabilities
2. Enhance the `role_communication_example.py` script to support all required features
3. Implement the communication protocol testing system
4. Set up regular testing of protocol compliance
5. Train all roles on the new communication system 