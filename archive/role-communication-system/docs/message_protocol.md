# Message Protocol

## Standard Message Formats

### Direct Messages
```
[SOURCE_ROLE]: @TARGET_ROLE: Message content
```
Example:
```
[ES]: @SET: Please implement the storage system with SQLite backend
[SET]: @ES: Starting implementation. Will coordinate with CTW for documentation.
```

### Broadcast Messages
```
[SOURCE_ROLE]: Message content
```
Example:
```
[ES]: System maintenance scheduled for tonight at 20:00 UTC
```

### Urgent Messages
```
[SOURCE_ROLE]: @TARGET_ROLE: [URGENT] Message content
```
Example:
```
[SET]: @ES: [URGENT] Security vulnerability detected in communication system
```

### Message Threading/Replies
```
[SOURCE_ROLE]: @TARGET_ROLE: Re: [conversation_id] Message content
```
Example:
```
[CTW]: @SET: Re: storage-docs-123 Documentation draft ready for review
``` 