# Error Codes Reference

This document provides a comprehensive reference for error codes in the role communication system. Each error code is categorized and includes information about the error, potential causes, and recommended recovery procedures.

## Error Categories

The error codes are organized into four main categories:

1. **Authorization Errors (1xxx)**: Related to role permissions and access control
2. **Format Errors (2xxx)**: Related to message format and syntax validation
3. **State Errors (3xxx)**: Related to role and conversation state management
4. **System Errors (4xxx)**: Related to underlying system and infrastructure issues

## 1. Authorization Errors (1xxx)

### 1001 - Unauthorized Role Access

**Description**: A role attempted to access a conversation or resource it's not authorized for.

**Potential Causes**:
- Role not included in the conversation's authorized roles list
- Security policy preventing access to specific workspace
- Attempt to access a restricted conversation

**Recovery Procedure**:
- Log the unauthorized access attempt
- Deny access to the unauthorized role
- Maintain system stability for authorized roles
- Notify system administrator if repeated attempts occur

### 1002 - Role Permission Boundary Violation

**Description**: A role attempted to perform an action beyond its permissions.

**Potential Causes**:
- Role attempting to delete a conversation without delete permission
- Role attempting to modify another role's state
- Role attempting to send a message on behalf of another role

**Recovery Procedure**:
- Reject the unauthorized action
- Maintain the integrity of the affected resource
- Log the permission boundary violation
- Allow the action if performed by an authorized role

## 2. Format Errors (2xxx)

### 2001 - Malformed Message Format

**Description**: A message with missing required fields or invalid structure was detected.

**Potential Causes**:
- Missing required fields (source_role, target_role, content)
- Invalid message structure
- Corrupted message data

**Recovery Procedure**:
- Reject the malformed message
- Log the format error with details
- Maintain valid communication channels
- Notify the sender of the format issue

### 2002 - Invalid Message Syntax

**Description**: A message with invalid syntax in the content field was detected.

**Potential Causes**:
- Missing or mismatched brackets in role mention format
- Incorrect role mention syntax
- Malformed special commands or directives

**Recovery Procedure**:
- Flag the message as having invalid syntax
- Reject the message if syntax is critical for routing
- Maintain system stability for valid messages
- Provide feedback on correct syntax

## 3. State Errors (3xxx)

### 3001 - Invalid State Transition

**Description**: A role attempted an invalid state transition.

**Potential Causes**:
- Transitioning from "available" directly to "completed" without intermediate states
- Attempting to set an invalid state value
- State transition violates the defined state machine

**Recovery Procedure**:
- Reject the invalid state transition
- Maintain the previous valid state
- Log the attempted invalid transition
- Allow valid state transitions to proceed

### 3002 - Conversation State Corruption

**Description**: A conversation's state has become corrupted or invalid.

**Potential Causes**:
- Database corruption
- Concurrent modification conflicts
- Invalid metadata format

**Recovery Procedure**:
- Attempt to restore from backup
- Initialize a clean state if restoration fails
- Preserve message history if possible
- Log the corruption event and recovery action

## 4. System Errors (4xxx)

### 4001 - Database Connection Failure

**Description**: Connection to the database was lost or failed.

**Potential Causes**:
- Database server unavailable
- Connection timeout
- Database locked by another process

**Recovery Procedure**:
- Attempt to reconnect automatically
- Use exponential backoff for retry attempts
- Maintain in-memory state during reconnection
- Log connection failures and successful reconnections

### 4002 - Resource Exhaustion

**Description**: System resources (memory, disk space, etc.) have been exhausted.

**Potential Causes**:
- Disk space full
- Memory limit reached
- Too many open connections or files

**Recovery Procedure**:
- Free resources by cleaning up old conversations
- Implement resource usage limits
- Prioritize critical operations
- Notify administrator of resource constraints

### 4003 - Concurrent Access Conflict

**Description**: Multiple processes attempted to modify the same data simultaneously.

**Potential Causes**:
- High concurrency without proper locking
- Long-running transactions
- Deadlock situations

**Recovery Procedure**:
- Implement proper locking mechanisms
- Use transaction isolation levels appropriately
- Retry failed operations with backoff
- Maintain data integrity during conflicts

## Error Handling Best Practices

1. **Log All Errors**: Ensure all errors are logged with sufficient context for debugging.
2. **Graceful Degradation**: System should continue functioning with reduced capabilities rather than failing completely.
3. **User Feedback**: Provide clear error messages to users when appropriate.
4. **Automatic Recovery**: Implement automatic recovery procedures where possible.
5. **Monitoring**: Set up monitoring for error rates and patterns to detect systemic issues.

## Implementation Guidelines

When implementing error handling:

1. Use specific error codes rather than generic exceptions
2. Include error category in the error message
3. Provide context-specific recovery suggestions
4. Maintain consistent error format across the system
5. Document all error codes and their handling procedures 