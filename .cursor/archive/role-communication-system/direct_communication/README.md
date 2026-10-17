# Direct Communication System

A simple file-based communication system for direct role-to-role communication without going through the user.

## Overview

The Direct Communication System allows different AI roles to communicate with each other directly by sending and receiving messages through a file-based queue system. Each role has its own message queue, and messages are stored in JSON files.

## Features

- Send and receive messages between roles
- Store message history for future reference
- Command-line interface for basic operations
- Utilities for handling encoding issues
- Polling for new messages

## Directory Structure

```
direct_communication/
├── __init__.py           # Package initialization
├── channel.py            # DirectCommunicationChannel class
├── client.py             # DirectCommunicationClient class
├── utils.py              # Utility functions
├── fix_encoding.py       # Script to fix encoding issues
├── clear_queue.py        # Script to clear a role's queue
├── send_test_message.py  # Script to send a test message
├── read_messages.py      # Script to read messages
├── create_test_message.py # Script to create a test message directly
├── queues/               # Message queues for each role
│   ├── es_queue.json     # Executive Secretary queue
│   └── set_queue.json    # Software Engineering Team queue
├── history/              # Conversation history
│   └── history_YYYY-MM-DD.json # History files by date
├── logs/                 # Log files
│   ├── channel.log       # Channel logs
│   └── client.log        # Client logs
└── archives/             # Archived queues
```

## Usage

### Sending a Message

```python
from direct_communication.channel import DirectCommunicationChannel

# Create a channel instance
channel = DirectCommunicationChannel()

# Send a message from SET to ES
channel.send_message("SET", "ES", "Hello, this is a test message.")
```

### Reading Messages

```python
from direct_communication.channel import DirectCommunicationChannel

# Create a channel instance
channel = DirectCommunicationChannel()

# Get messages for ES
messages = channel.get_messages("ES")

# Print messages
for message in messages:
    print(f"From: {message['source_role']}")
    print(f"Content: {message['content']}")
    print()
```

### Using the Command-Line Interface

```bash
# Send a message
python -m direct_communication.client SET send ES "Hello, this is a test message."

# Get messages
python -m direct_communication.client ES get

# Poll for new messages
python -m direct_communication.client ES poll
```

### Utility Scripts

- `fix_encoding.py`: Fix encoding issues in message queues
- `clear_queue.py`: Clear a role's message queue
- `send_test_message.py`: Send a test message
- `read_messages.py`: Read messages from a queue
- `create_test_message.py`: Create a test message directly in a queue

## Known Issues

- There may be encoding issues with UTF-16 encoded messages
- The queue file may not be properly updated when using the channel's save_queue method
- The channel may not properly read the queue file if it was modified outside the channel

## Troubleshooting

If you encounter encoding issues, run the `fix_encoding.py` script:

```bash
python fix_encoding.py
```

If the queue file is not being properly updated, try using the `create_test_message.py` script to directly create a message:

```bash
python create_test_message.py
```

## License

This project is licensed under the MIT License - see the LICENSE file for details. 