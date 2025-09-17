/**
 * roleTypes.ts
 * Type definitions for roles in the Multi-agent Communications Framework
 */

/**
 * Core role definition interface
 */
export interface RoleDefinition {
  /** Unique identifier for the role */
  id: string;
  
  /** Short form abbreviation (e.g., "ES" for Executive Secretary) */
  abbreviation: string;
  
  /** Display name for the role */
  name: string;
  
  /** Detailed description of the role and its purpose */
  description: string;
  
  /** Primary color for visual identity (hex code) */
  color: string;
  
  /** Path to role icon */
  icon: string;
  
  /** Key areas of responsibility for this role */
  responsibilities: string[];
  
  /** Communication style characteristics */
  communicationStyle: {
    /** Overall tone of communication (e.g., formal, friendly, technical) */
    tone: string;
    
    /** Level of formality in communication */
    formality: string;
    
    /** Primary areas of focus in communication */
    focus: string[];
  };
  
  /** Template IDs associated with this role */
  templates: string[];
  
  /** Special capabilities of this role */
  capabilities: string[];
  
  /** Visual styling for the role */
  visualIdentity?: {
    /** Secondary color palette */
    secondaryColors?: string[];
    
    /** Typography settings */
    typography?: {
      /** Font family */
      fontFamily?: string;
      
      /** Font weight for headings */
      headingWeight?: number;
      
      /** Font style */
      fontStyle?: string;
    };
    
    /** Visual elements associated with the role */
    elements?: {
      /** Patterns to use in backgrounds, etc. */
      patterns?: string[];
      
      /** Shapes associated with the role */
      shapes?: string[];
    };
  };
  
  /** Default settings for this role */
  defaultSettings?: {
    [key: string]: any;
  };
  
  /** Version information for this role definition */
  version?: string;
  
  /** Whether this role is built-in or custom */
  isCustom?: boolean;
}

/**
 * Interface for role context - the current state of an active role
 */
export interface RoleContext {
  /** The active role definition */
  roleDefinition: RoleDefinition;
  
  /** When the role was activated */
  activatedAt: Date;
  
  /** Previous active role ID, if any */
  previousRoleId?: string;
  
  /** Current context-specific settings */
  settings: {
    [key: string]: any;
  };
  
  /** Recent templates used with this role */
  recentTemplates: string[];
}

/**
 * Interface for serialized role state in storage
 */
export interface RoleState {
  /** Currently active role ID */
  activeRoleId: string | null;
  
  /** History of recently used roles (in order of most recent first) */
  roleHistory: string[];
  
  /** Role-specific settings */
  roleSettings?: {
    [roleId: string]: {
      [key: string]: any;
    };
  };
}

/**
 * Enum for predefined roles
 */
export enum PredefinedRoleId {
  ExecutiveSecretary = 'ES',
  SoftwareEngineeringTeam = 'SET',
  CopyTechnicalWriter = 'CTW',
  Designer = 'DES',
  DatingRelationshipCoach = 'DRC'
}

/**
 * Interface for role creation options
 */
export interface RoleCreationOptions {
  /** Role ID (will be generated if not provided) */
  id?: string;
  
  /** Base role to inherit properties from */
  baseRoleId?: string;
  
  /** Whether to mark as custom (defaults to true) */
  isCustom?: boolean;
}

/**
 * Interface for role capability definition
 */
export interface RoleCapability {
  /** Unique identifier for the capability */
  id: string;
  
  /** Display name for the capability */
  name: string;
  
  /** Description of what the capability does */
  description: string;
  
  /** Command ID associated with this capability */
  commandId?: string;
  
  /** Whether this capability is enabled by default */
  enabledByDefault: boolean;
}

/**
 * Interface for role capabilities
 */
export interface ICapability {
  /** Unique identifier for the capability */
  id: string;
  
  /** Display name for the capability */
  name: string;
  
  /** Description of what this capability entails */
  description: string;
  
  /** Whether this capability is enabled for the role */
  isEnabled: boolean;
}

/**
 * Interface for role communication style
 */
export interface ICommunicationStyle {
  /** Overall tone (e.g., formal, casual, technical) */
  tone: string;
  
  /** Level of formality in communications */
  formality: 'formal' | 'semi-formal' | 'casual';
  
  /** Characteristic phrases or language patterns */
  patterns: string[];
  
  /** Focus areas in communication */
  focus: string[];
}

/**
 * Interface for role visual identity settings
 */
export interface IVisualIdentity {
  /** Primary color for the role (hex code) */
  primaryColor: string;
  
  /** Secondary colors for the role */
  secondaryColors: string[];
  
  /** Color for role text */
  textColor: string;
  
  /** Emoji or icon identifier */
  icon: string;
  
  /** Typography settings */
  typography?: {
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: number;
  };
}

/**
 * Interface for core role definition
 */
export interface IRole {
  /** Unique identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Short abbreviation (e.g., ES for Executive Secretary) */
  abbreviation: string;
  
  /** Description of role purpose and function */
  description: string;
  
  /** Areas of responsibility */
  responsibilities: string[];
  
  /** Role communication style */
  communicationStyle: ICommunicationStyle;
  
  /** Role visual identity */
  visualIdentity: IVisualIdentity;
  
  /** Role capabilities */
  capabilities: ICapability[];
  
  /** Whether this is a built-in or custom role */
  isCustom: boolean;
  
  /** Role version */
  version: string;
}

/**
 * Interface for role registration options
 */
export interface IRoleRegistrationOptions {
  /** Override the default ID */
  id?: string;
  
  /** Whether to persist the role */
  persist?: boolean;
  
  /** Whether to make this the active role */
  makeActive?: boolean;
}

/**
 * Interface for role context
 */
export interface IRoleContext {
  /** The current active role */
  role: IRole;
  
  /** When the role was activated */
  activatedAt: Date;
  
  /** Previous active role ID */
  previousRoleId: string | null;
  
  /** Role-specific settings */
  settings: Record<string, unknown>;
}

/**
 * Interface for role state in storage
 */
export interface IRoleState {
  /** Currently active role ID */
  activeRoleId: string | null;
  
  /** History of recently used roles */
  roleHistory: string[];
  
  /** All registered custom roles */
  customRoles: IRole[];
  
  /** Role-specific settings */
  roleSettings: Record<string, Record<string, unknown>>;
}

/**
 * Interface for role state change event
 */
export interface IRoleChangeEvent {
  /** Type of role change */
  type: 'activation' | 'registration' | 'unregistration' | 'update';
  
  /** ID of the affected role */
  roleId: string;
  
  /** Previous role ID (for activation events) */
  previousRoleId?: string;
  
  /** The affected role */
  role?: IRole;
  
  /** Timestamp of the event */
  timestamp: Date;
} 