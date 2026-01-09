/**
 * @fileoverview Internal Type Definitions for Entity Service
 * @description Types used internally by the entity service helpers
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Re-export enums as values (not just types) so they can be used at runtime
export {
  EntityType,
  EntityRole,
  InvitationStatus,
  ROLE_PERMISSIONS,
} from '@sudobility/types';

// Re-export interfaces as types
export type {
  Entity,
  EntityWithRole,
  EntityMember,
  EntityMemberUser,
  EntityInvitation,
  EntityPermissions,
  CreateEntityRequest,
  UpdateEntityRequest,
  InviteMemberRequest,
  UpdateMemberRoleRequest,
} from '@sudobility/types';

// ========================================
// INTERNAL CONFIGURATION TYPES
// ========================================

/**
 * Configuration for entity helpers.
 * Provides database connection and table references.
 */
export interface EntityHelperConfig {
  /** Drizzle database instance */
  db: PostgresJsDatabase<any>;
  /** Entities table reference */
  entitiesTable: any;
  /** Entity members table reference */
  membersTable: any;
  /** Users table reference (for joins) */
  usersTable: any;
}

/**
 * Configuration for invitation helper.
 * Extends entity config with invitation table.
 */
export interface InvitationHelperConfig extends EntityHelperConfig {
  /** Entity invitations table reference */
  invitationsTable: any;
}

/**
 * Result of entity operations.
 */
export interface EntityOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Options for listing entities.
 */
export interface ListEntitiesOptions {
  /** Include only entities of this type */
  entityType?: 'personal' | 'organization';
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Options for listing members.
 */
export interface ListMembersOptions {
  /** Filter by role */
  role?: 'owner' | 'admin' | 'member';
  /** Filter by active status */
  isActive?: boolean;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Options for listing invitations.
 */
export interface ListInvitationsOptions {
  /** Filter by status */
  status?: 'pending' | 'accepted' | 'declined' | 'expired';
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}
