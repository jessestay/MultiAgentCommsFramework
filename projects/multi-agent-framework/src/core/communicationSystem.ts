/**
 * communicationSystem.ts
 * Core communication system for the Multi-agent Communications Framework
 */

import { EventEmitter } from 'events';
import { RoleManager } from './roleManager';
import { MessageFormatOptions, FormattedMessage, MessageType } from '../types/messageTypes';

/**
 * Manages the flow of messages between roles and between the user and roles
 */
export class CommunicationSystem {
  private static instance: CommunicationSystem;
  private roleManager: RoleManager;
  private messageEmitter: EventEmitter = new EventEmitter();
  private conversationHistory: FormattedMessage[] = [];
  private maxHistoryLength: number = 100;

  private constructor() {
    // Private constructor to enforce singleton pattern
    this.roleManager = RoleManager.getInstance();
  }

  /**
   * Get the singleton instance of CommunicationSystem
   */
  public static getInstance(): CommunicationSystem {
    if (!CommunicationSystem.instance) {
      CommunicationSystem.instance = new CommunicationSystem();
    }
    return CommunicationSystem.instance;
  }

  /**
   * Initialize the communication system
   */
  public initialize(): void {
    // Set up event listeners for role changes
    this.roleManager.onRoleChange(this.handleRoleChange.bind(this));
  }

  /**
   * Handle role changes to update communication context
   */
  private handleRoleChange(event: { roleId: string, previousRoleId: string | null }): void {
    // Emit an event that can be used by UI components to update
    this.messageEmitter.emit('roleChanged', event);
  }

  /**
   * Format a message according to role-specific styling
   */
  public formatMessage(
    message: string,
    options: MessageFormatOptions = {}
  ): FormattedMessage {
    const {
      roleId = this.roleManager.getActiveRoleId(),
      targetRoleId = null,
      messageType = MessageType.UserToRole
    } = options;

    // Get role information
    const role = roleId ? this.roleManager.getRole(roleId) : null;
    const targetRole = targetRoleId ? this.roleManager.getRole(targetRoleId) : null;

    if (!role && messageType !== MessageType.UserToUser) {
      throw new Error(`Cannot format message: Role with ID '${roleId}' does not exist`);
    }

    // Create base formatted message
    const formattedMessage: FormattedMessage = {
      originalMessage: message,
      formattedMessage: message,
      timestamp: new Date(),
      messageType,
      roleId: role?.id || null,
      roleName: role?.name || null,
      targetRoleId: targetRole?.id || null,
      targetRoleName: targetRole?.name || null,
      style: {
        color: role?.color || '#000000',
        targetColor: targetRole?.color || '#000000',
        icon: role?.icon || '',
        targetIcon: targetRole?.icon || ''
      }
    };

    // Apply styling based on message type
    switch (messageType) {
      case MessageType.RoleToUser:
        formattedMessage.formattedMessage = this.formatRoleToUserMessage(message, role!);
        break;
      case MessageType.UserToRole:
        formattedMessage.formattedMessage = this.formatUserToRoleMessage(message, role!);
        break;
      case MessageType.RoleToRole:
        if (!targetRole) {
          throw new Error(`Cannot format role-to-role message: Target role with ID '${targetRoleId}' does not exist`);
        }
        formattedMessage.formattedMessage = this.formatRoleToRoleMessage(message, role!, targetRole);
        break;
      case MessageType.UserToUser:
        // No special formatting for user-to-user messages
        break;
    }

    // Add message to history
    this.addToHistory(formattedMessage);

    return formattedMessage;
  }

  /**
   * Format a message from a role to the user
   */
  private formatRoleToUserMessage(message: string, role: any): string {
    return `@${role.abbreviation}: ${message}`;
  }

  /**
   * Format a message from the user to a role
   */
  private formatUserToRoleMessage(message: string, role: any): string {
    return `@${role.abbreviation}: ${message}`;
  }

  /**
   * Format a message from one role to another
   */
  private formatRoleToRoleMessage(message: string, sourceRole: any, targetRole: any): string {
    return `@${sourceRole.abbreviation} to @${targetRole.abbreviation}: ${message}`;
  }

  /**
   * Parse a message to identify role addressing
   * Returns the parsed information including target roles and message content
   */
  public parseMessage(message: string): {
    targetRoleIds: string[];
    messageContent: string;
    isInterRoleCommunication: boolean;
    sourceRoleId?: string;
  } {
    // Check for inter-role communication pattern: @ROLE1 to @ROLE2: message
    const interRolePattern = /@([A-Za-z]+)\s+to\s+@([A-Za-z]+):\s*(.*)/;
    const interRoleMatch = message.match(interRolePattern);

    if (interRoleMatch) {
      const sourceRoleAbbr = interRoleMatch[1];
      const targetRoleAbbr = interRoleMatch[2];
      const messageContent = interRoleMatch[3];

      // Validate that roles exist
      const sourceRole = this.findRoleByAbbreviation(sourceRoleAbbr);
      const targetRole = this.findRoleByAbbreviation(targetRoleAbbr);

      if (!sourceRole || !targetRole) {
        // Return empty if roles don't exist
        return {
          targetRoleIds: [],
          messageContent: message,
          isInterRoleCommunication: false
        };
      }

      return {
        targetRoleIds: [targetRole.id],
        messageContent,
        isInterRoleCommunication: true,
        sourceRoleId: sourceRole.id
      };
    }

    // Check for direct role addressing: @ROLE: message
    const directAddressPattern = /@([A-Za-z]+)(?:,\s*@([A-Za-z]+))*:\s*(.*)/;
    const directMatch = message.match(directAddressPattern);

    if (directMatch) {
      // Extract all role mentions
      const roleMatches = message.match(/@([A-Za-z]+)/g) || [];
      const roleAbbreviations = roleMatches.map(match => match.substring(1));
      const messageContent = message.replace(directAddressPattern, '$3');

      // Validate that roles exist and get their IDs
      const targetRoleIds = roleAbbreviations
        .map(abbr => this.findRoleByAbbreviation(abbr))
        .filter(role => role !== null)
        .map(role => role!.id);

      return {
        targetRoleIds,
        messageContent,
        isInterRoleCommunication: false
      };
    }

    // No role addressing found
    return {
      targetRoleIds: [],
      messageContent: message,
      isInterRoleCommunication: false
    };
  }

  /**
   * Find a role by its abbreviation
   */
  private findRoleByAbbreviation(abbreviation: string): any | null {
    const allRoles = this.roleManager.getAllRoles();
    return allRoles.find(role => role.abbreviation.toLowerCase() === abbreviation.toLowerCase()) || null;
  }

  /**
   * Add a message to the conversation history
   */
  private addToHistory(message: FormattedMessage): void {
    this.conversationHistory.push(message);
    
    // Trim history if it exceeds max length
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
    
    // Emit event for history update
    this.messageEmitter.emit('messageAdded', message);
  }

  /**
   * Get the conversation history
   */
  public getConversationHistory(options: {
    roleId?: string;
    limit?: number;
    offset?: number;
  } = {}): FormattedMessage[] {
    const { roleId, limit = this.maxHistoryLength, offset = 0 } = options;
    
    let filteredHistory = this.conversationHistory;
    
    // Filter by role if specified
    if (roleId) {
      filteredHistory = filteredHistory.filter(
        msg => msg.roleId === roleId || msg.targetRoleId === roleId
      );
    }
    
    // Apply pagination
    return filteredHistory
      .slice(Math.max(0, filteredHistory.length - offset - limit), filteredHistory.length - offset);
  }

  /**
   * Clear the conversation history
   */
  public clearHistory(): void {
    this.conversationHistory = [];
    this.messageEmitter.emit('historyCleared');
  }

  /**
   * Subscribe to message events
   */
  public onMessage(event: string, listener: (message: FormattedMessage) => void): void {
    this.messageEmitter.on(event, listener);
  }

  /**
   * Unsubscribe from message events
   */
  public offMessage(event: string, listener: (message: FormattedMessage) => void): void {
    this.messageEmitter.off(event, listener);
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.messageEmitter.removeAllListeners();
  }
} 