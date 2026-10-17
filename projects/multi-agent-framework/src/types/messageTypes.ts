/**
 * messageTypes.ts
 * Type definitions for the communication system
 */

/**
 * Enum defining the types of messages in the system
 */
export enum MessageType {
  /** Message from a role to the user */
  RoleToUser = 'role-to-user',
  
  /** Message from the user to a role */
  UserToRole = 'user-to-role',
  
  /** Message from one role to another role */
  RoleToRole = 'role-to-role',
  
  /** Regular message from user to user (no role context) */
  UserToUser = 'user-to-user'
}

/**
 * Interface for message formatting options
 */
export interface MessageFormatOptions {
  /** The ID of the role sending the message */
  roleId?: string | null;
  
  /** The ID of the target role (for role-to-role messages) */
  targetRoleId?: string | null;
  
  /** The type of message being sent */
  messageType?: MessageType;
  
  /** Additional styling options */
  style?: {
    /** Whether to use bold formatting */
    bold?: boolean;
    
    /** Whether to use italic formatting */
    italic?: boolean;
    
    /** Whether to include role icon */
    showIcon?: boolean;
  };
}

/**
 * Interface for a formatted message
 */
export interface FormattedMessage {
  /** The original unformatted message */
  originalMessage: string;
  
  /** The formatted message text */
  formattedMessage: string;
  
  /** Timestamp when the message was created */
  timestamp: Date;
  
  /** The type of message */
  messageType: MessageType;
  
  /** The ID of the role that sent the message (null for user messages) */
  roleId: string | null;
  
  /** The name of the role that sent the message */
  roleName: string | null;
  
  /** The ID of the target role (for role-to-role messages) */
  targetRoleId: string | null;
  
  /** The name of the target role */
  targetRoleName: string | null;
  
  /** Styling information for the message */
  style: {
    /** Primary color for the message (from role) */
    color: string;
    
    /** Secondary color for the message (from target role) */
    targetColor: string;
    
    /** Icon for the source role */
    icon: string;
    
    /** Icon for the target role */
    targetIcon: string;
  };
}

/**
 * Interface for a message in the conversation history
 */
export interface ConversationMessage extends FormattedMessage {
  /** Unique identifier for the message */
  id: string;
  
  /** Reference to parent message ID if this is a reply */
  parentId?: string;
  
  /** Whether the message has been read */
  read: boolean;
}

/**
 * Interface for a thread of conversation messages
 */
export interface ConversationThread {
  /** Root message of the thread */
  rootMessage: ConversationMessage;
  
  /** Child messages in the thread */
  replies: ConversationMessage[];
} 