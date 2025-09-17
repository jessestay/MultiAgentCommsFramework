/**
 * roleManager.ts
 * Core role management system for the Multi-agent Communications Framework
 */

import { EventEmitter } from 'events';
import { RoleDefinition } from '../types/roleTypes';
import { RoleStorage } from '../integration/storageProvider';

/**
 * Singleton class that manages role registration, activation, and context switching
 */
export class RoleManager {
  private static instance: RoleManager;
  private roles: Map<string, RoleDefinition> = new Map();
  private activeRoleId: string | null = null;
  private roleHistory: string[] = [];
  private maxHistoryLength = 10;
  private roleChangeEmitter = new EventEmitter();

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of RoleManager
   */
  public static getInstance(): RoleManager {
    if (!RoleManager.instance) {
      RoleManager.instance = new RoleManager();
    }
    return RoleManager.instance;
  }

  /**
   * Initialize the RoleManager with default roles and restore previous state
   */
  public async initialize(): Promise<void> {
    // Load default roles from configuration
    await this.loadDefaultRoles();
    
    // Restore previous session state if available
    const previousState = await RoleStorage.getState();
    if (previousState && previousState.activeRoleId && this.roles.has(previousState.activeRoleId)) {
      this.activeRoleId = previousState.activeRoleId;
      this.roleHistory = previousState.roleHistory || [];
    } else {
      // Activate default role if no previous state
      const defaultRoleId = this.getDefaultRoleId();
      if (defaultRoleId) {
        this.activateRole(defaultRoleId);
      }
    }
  }

  /**
   * Load default roles from configuration
   */
  private async loadDefaultRoles(): Promise<void> {
    try {
      const defaultRoles = await RoleStorage.getDefaultRoles();
      defaultRoles.forEach(role => this.registerRole(role));
      
      // Load custom roles if any
      const customRoles = await RoleStorage.getCustomRoles();
      customRoles.forEach(role => this.registerRole(role));
    } catch (error) {
      console.error('Error loading default roles:', error);
    }
  }

  /**
   * Register a new role or update an existing one
   */
  public registerRole(role: RoleDefinition): void {
    this.roles.set(role.id, role);
    this.roleChangeEmitter.emit('roleRegistered', role);
  }

  /**
   * Unregister a role by ID
   */
  public unregisterRole(roleId: string): boolean {
    const result = this.roles.delete(roleId);
    if (result) {
      this.roleChangeEmitter.emit('roleUnregistered', roleId);
      
      // If the active role was removed, activate the default role
      if (this.activeRoleId === roleId) {
        const defaultRoleId = this.getDefaultRoleId();
        if (defaultRoleId) {
          this.activateRole(defaultRoleId);
        } else {
          this.activeRoleId = null;
        }
      }
    }
    return result;
  }

  /**
   * Get a role by ID
   */
  public getRole(roleId: string): RoleDefinition | undefined {
    return this.roles.get(roleId);
  }

  /**
   * Get all registered roles
   */
  public getAllRoles(): RoleDefinition[] {
    return Array.from(this.roles.values());
  }

  /**
   * Get the currently active role
   */
  public getActiveRole(): RoleDefinition | null {
    if (!this.activeRoleId) return null;
    return this.roles.get(this.activeRoleId) || null;
  }

  /**
   * Get the ID of the active role
   */
  public getActiveRoleId(): string | null {
    return this.activeRoleId;
  }

  /**
   * Activate a role by ID
   */
  public activateRole(roleId: string): boolean {
    if (!this.roles.has(roleId)) {
      console.warn(`Role with ID '${roleId}' does not exist`);
      return false;
    }

    const previousRoleId = this.activeRoleId;
    this.activeRoleId = roleId;
    
    // Add to history, avoiding duplicates at the end
    if (previousRoleId !== roleId) {
      // Remove if already in history to avoid duplicates
      this.roleHistory = this.roleHistory.filter(id => id !== roleId);
      
      // Add to the end of history
      this.roleHistory.push(roleId);
      
      // Trim history if it exceeds max length
      if (this.roleHistory.length > this.maxHistoryLength) {
        this.roleHistory = this.roleHistory.slice(-this.maxHistoryLength);
      }
    }

    // Persist the state change
    this.persistState();
    
    // Emit role activation event
    this.roleChangeEmitter.emit('roleActivated', {
      roleId,
      previousRoleId
    });
    
    return true;
  }

  /**
   * Switch to the next role in the registered roles list
   */
  public activateNextRole(): boolean {
    const roles = this.getAllRoles();
    if (roles.length === 0) return false;
    
    const currentIndex = this.activeRoleId 
      ? roles.findIndex(role => role.id === this.activeRoleId)
      : -1;
    
    const nextIndex = (currentIndex + 1) % roles.length;
    return this.activateRole(roles[nextIndex].id);
  }

  /**
   * Switch to the previous role in the registered roles list
   */
  public activatePreviousRole(): boolean {
    const roles = this.getAllRoles();
    if (roles.length === 0) return false;
    
    const currentIndex = this.activeRoleId 
      ? roles.findIndex(role => role.id === this.activeRoleId)
      : 0;
    
    const previousIndex = (currentIndex - 1 + roles.length) % roles.length;
    return this.activateRole(roles[previousIndex].id);
  }

  /**
   * Get the role history (most recent roles)
   */
  public getRoleHistory(): string[] {
    return [...this.roleHistory].reverse();
  }

  /**
   * Activate the previously active role (go back in history)
   */
  public activatePreviousHistoryRole(): boolean {
    // Need at least 2 items in history to go back
    if (this.roleHistory.length < 2) return false;
    
    // The current role should be the last item in history
    // So we want the second-to-last item
    const previousRoleId = this.roleHistory[this.roleHistory.length - 2];
    return this.activateRole(previousRoleId);
  }

  /**
   * Get the default role ID (first registered role or ES if available)
   */
  private getDefaultRoleId(): string | null {
    // Prefer Executive Secretary role if available
    if (this.roles.has('ES')) {
      return 'ES';
    }
    
    // Otherwise use the first registered role
    const roles = this.getAllRoles();
    return roles.length > 0 ? roles[0].id : null;
  }

  /**
   * Persist the current state to storage
   */
  private persistState(): void {
    RoleStorage.setState({
      activeRoleId: this.activeRoleId,
      roleHistory: this.roleHistory
    });
  }

  /**
   * Subscribe to role change events
   */
  public onRoleChange(listener: (event: any) => void): void {
    this.roleChangeEmitter.on('roleActivated', listener);
  }

  /**
   * Subscribe to role registration events
   */
  public onRoleRegistered(listener: (role: RoleDefinition) => void): void {
    this.roleChangeEmitter.on('roleRegistered', listener);
  }

  /**
   * Subscribe to role unregistration events
   */
  public onRoleUnregistered(listener: (roleId: string) => void): void {
    this.roleChangeEmitter.on('roleUnregistered', listener);
  }

  /**
   * Unsubscribe from role change events
   */
  public offRoleChange(listener: (event: any) => void): void {
    this.roleChangeEmitter.off('roleActivated', listener);
  }

  /**
   * Suggest a role based on the current context
   */
  public suggestRoleForContext(context: {
    fileType?: string;
    fileName?: string;
    content?: string;
  }): string | null {
    // Simple rule-based suggestions
    const { fileType, fileName, content } = context;
    
    if (fileType === 'markdown' || fileType === 'text') {
      return 'CTW'; // Copy/Technical Writer for documentation
    }
    
    if (fileType === 'typescript' || fileType === 'javascript' || fileType === 'python') {
      return 'SET'; // Software Engineering Team for code
    }
    
    if (fileType === 'css' || fileType === 'svg' || fileName?.includes('design')) {
      return 'DES'; // Designer for visual assets
    }
    
    if (fileName?.includes('sprint') || fileName?.includes('planning')) {
      return 'ES'; // Executive Secretary for project management
    }
    
    // Default to the current role if no match
    return this.activeRoleId;
  }

  /**
   * Clean up resources and persist state before extension deactivation
   */
  public dispose(): void {
    this.persistState();
    this.roleChangeEmitter.removeAllListeners();
  }
} 