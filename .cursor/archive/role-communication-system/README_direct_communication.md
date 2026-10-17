# Direct Communication System

This is a simple file-based communication system that allows direct communication between roles without requiring user intervention. It was created as a temporary solution to streamline workflow between roles.

## Overview

The Direct Communication System consists of:

1. **DirectCommunicationChannel**: Core class that handles message storage and retrieval
2. **DirectCommunicationClient**: Interactive client for sending and receiving messages
3. **Command-line interface**: For basic operations from the terminal

Messages are stored in JSON files in a directory structure, with separate queues for each role and a history of all messages.

## Installation

No installation is required. The system is self-contained within the `role_automation` package.

## Usage

### Interactive Client

The easiest way to use the system is through the interactive client:

```bash
python -m role_automation.direct_communication_client ES
```

Replace `ES` with your role identifier (e.g., `ES` for Executive Secretary, `SET` for Software Engineering Team).

This will start an interactive session where you can:
- Send messages to other roles
- Receive messages in real-time
- View conversation history
- And more

Type `help` in the interactive client to see all available commands.

### Command-line Interface

For scripting or one-off operations, you can use the command-line interface:

```bash
# Send a message
python -m role_automation.direct_communication send ES SET "This is a test message"

# Get messages for a role
python -m role_automation.direct_communication get SET

# Get only unread messages
python -m role_automation.direct_communication get SET --unread

# View conversation history
python -m role_automation.direct_communication history ES SET --limit 10

# Poll for new messages
python -m role_automation.direct_communication poll SET --interval 5
```

### Programmatic Usage

You can also use the system programmatically in your Python code:

```python
from role_automation.direct_communication import DirectCommunicationChannel

# Initialize the channel
channel = DirectCommunicationChannel()

# Send a message
channel.send_message("ES", "SET", "This is a test message")

# Get messages
messages = channel.get_messages("SET")

# Get unread messages
unread_messages = channel.get_unread_messages("SET")

# Get conversation history
history = channel.get_conversation_history("ES", "SET", limit=10)
```

## Directory Structure

By default, messages are stored in the `direct_communication` directory with the following structure:

```
direct_communication/
├── queues/
│   ├── es_queue.json
│   ├── set_queue.json
│   └── ...
└── history/
    ├── history_2023-01-01.json
    ├── history_2023-01-02.json
    └── ...
```

You can specify a different base directory when initializing the channel:

```python
channel = DirectCommunicationChannel(base_dir="/path/to/custom/directory")
```

## Message Format

Messages are stored as JSON objects with the following structure:

```json
{
  "id": "unique-message-id",
  "source_role": "ES",
  "target_role": "SET",
  "content": "Message content",
  "metadata": {},
  "timestamp": "2023-01-01T12:00:00",
  "read": false
}
```

## Security Considerations

This system is designed for temporary use in a trusted environment. It does not include:

- Authentication
- Encryption
- Access control

Do not use this system for sensitive information or in production environments.

## Troubleshooting

### Messages Not Appearing

If messages are not appearing in the queue:

1. Check that you're using the correct role identifier
2. Verify that the message was sent to the correct target role
3. Check the file permissions on the `direct_communication` directory

### File Corruption

If a JSON file becomes corrupted:

1. Stop all clients
2. Delete the corrupted file
3. Restart the clients

## Limitations

- No real-time push notifications (polling is used instead)
- No authentication or access control
- Limited scalability (not designed for high message volumes)
- No message persistence guarantees

## Future Improvements

This is a temporary solution. Future improvements could include:

1. Integration with the main role communication system
2. Real-time notifications using WebSockets
3. Message encryption
4. Authentication and access control 