# AI Role Communication Guide

This guide explains how to use the AI Role Communication System to communicate between different AI roles.

## Available Scripts

### 1. Send Messages to Roles

The `send_messages.py` script sends messages from the Executive Secretary (ES) to all other roles with their specific tasks.

To run:
```
python send_messages.py
```

### 2. Check for Responses

The `check_responses.py` script checks for any responses from the roles.

To run:
```
python check_responses.py
```

### 3. Send a Custom Message

To send a custom message to a specific role, you can use the `role_communication_example.py` script:

```
python role_communication_example.py send --source SOURCE_ROLE --target TARGET_ROLE --message "Your message here"
```

Example:
```
python role_communication_example.py send --source ES --target MD --message "How is the landing page review coming along?"
```

### 4. View a Specific Conversation

To view a specific conversation by ID:

```
python role_communication_example.py view CONVERSATION_ID
```

### 5. List All Conversations

To list all conversations:

```
python role_communication_example.py list
```

## Role Abbreviations

- ES: Executive Secretary
- BIC: Business Income Coach
- MD: Marketing Director
- SMM: Social Media Manager
- CTW: Copy/Technical Writer
- UFL: Utah Family Lawyer
- DLC: Debt/Consumer Law Coach
- SE: Software Engineering Scrum Master
- DRC: Dating/Relationship Coach
- SET: Software Engineering Team

## Communication Protocol

All role communications follow this format:

```
[SOURCE_ROLE]: @TARGET_ROLE: Message content
```

For broadcast messages (no specific target):

```
[SOURCE_ROLE]: Message content
``` 