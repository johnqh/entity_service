/**
 * @fileoverview Internal Type Definitions for Entity Service
 * @description Types used internally by the entity service helpers
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Re-export enums as values (not just types) so they can be used at runtime
export {
  EntityType,
  EntityRole,
  InvitationStatus,
  OWNER_PERMISSIONS,
  MANAGER_PERMISSIONS,
  MEMBER_PERMISSIONS,
  getPermissionsForRole,
  hasPermission,
} from "@sudobility/types";

// Re-export interfaces as types
export type {
  Entity,
  EntityWithRole,
  EntityMember,
  EntityInvitation,
  EntityPermissions,
  CreateEntityRequest,
  UpdateEntityRequest,
  InviteMemberRequest,
  UpdateMemberRoleRequest,
} from "@sudobility/types";

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
 * Configuration for the API key helper.
 * Extends entity config with the key table and the issuer prefix applied to
 * newly minted keys.
 */
export interface ApiKeyHelperConfig extends EntityHelperConfig {
  /** Entity API keys table reference */
  apiKeysTable: any;
  /** Short lowercase tag prefixed to generated keys (default "sk") */
  keyPrefix?: string;
}

/**
 * An entity API key as returned to clients.
 * Never carries the secret -- only the display prefix.
 */
export interface EntityApiKey {
  id: string;
  entityId: string;
  keyName: string;
  /** Leading characters of the key, e.g. "shyft_a1b2c3" */
  keyPrefix: string;
  createdByUserId: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * A newly created API key, including the plaintext secret.
 * The secret is returned exactly once and cannot be recovered afterwards.
 */
export interface CreatedEntityApiKey extends EntityApiKey {
  /** Plaintext key -- show once, never stored */
  key: string;
}

/**
 * Identity resolved from a valid API key on an incoming request.
 */
export interface EntityApiKeyIdentity {
  /** The key's own id */
  keyId: string;
  /** Entity the key authenticates as */
  entityId: string;
  /** User who created the key */
  createdByUserId: string;
}

/**
 * Options for listing API keys.
 */
export interface ListApiKeysOptions {
  /** Filter by active status */
  isActive?: boolean;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
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
  entityType?: "personal" | "organization";
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
  role?: "owner" | "manager" | "member";
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
  status?: "pending" | "accepted" | "declined" | "expired";
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}
