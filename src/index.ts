/**
 * @fileoverview Entity Service Library
 * @description Shared backend library for multi-tenant entity/organization management
 *
 * @example
 * ```typescript
 * import {
 *   createEntityHelpers,
 *   createEntityContextMiddleware,
 *   entities,
 *   entityMembers,
 *   entityInvitations,
 * } from '@shapeshyft/entity-service';
 *
 * // Create helpers with your database config
 * const helpers = createEntityHelpers({
 *   db: drizzleDb,
 *   entitiesTable: mySchema.entities,
 *   membersTable: mySchema.entityMembers,
 *   invitationsTable: mySchema.entityInvitations,
 *   usersTable: mySchema.users,
 * });
 *
 * // Use in your routes
 * const entity = await helpers.entity.getOrCreatePersonalEntity(userId, email);
 * const members = await helpers.members.getMembers(entityId);
 * ```
 */

// Schema exports
export {
  // Table factory functions
  createEntitiesTable,
  createEntitiesTablePublic,
  createEntityMembersTable,
  createEntityMembersTablePublic,
  createEntityInvitationsTable,
  createEntityInvitationsTablePublic,
  // Default tables (public schema)
  entities,
  entityMembers,
  entityInvitations,
  // Type exports
  type EntityRecord,
  type NewEntityRecord,
  type EntityMemberRecord,
  type NewEntityMemberRecord,
  type EntityInvitationRecord,
  type NewEntityInvitationRecord,
  // Initialization
  initEntityTables,
} from './schema/entities';

// Helper exports
export {
  EntityHelper,
  EntityMemberHelper,
  InvitationHelper,
  PermissionHelper,
} from './helpers';

// Middleware exports
export {
  createEntityContextMiddleware,
  createRequirePermissionMiddleware,
  createRequireRoleMiddleware,
  createEntityHelpers,
  type EntityContext,
  type EntityContextMiddlewareOptions,
} from './middleware';

// Utility exports
export {
  generateEntitySlug,
  generateInvitationToken,
  normalizeSlug,
  validateSlug,
  calculateInvitationExpiry,
} from './utils';

// Migration exports
export {
  runEntityMigration,
  rollbackEntityMigration,
  type MigrationConfig,
} from './migrations';

// Type exports (re-exported from @sudobility/types)
export {
  EntityType,
  EntityRole,
  InvitationStatus,
  OWNER_PERMISSIONS,
  MANAGER_PERMISSIONS,
  MEMBER_PERMISSIONS,
  getPermissionsForRole,
  hasPermission,
  type Entity,
  type EntityWithRole,
  type EntityMember,
  type EntityInvitation,
  type EntityPermissions,
  type CreateEntityRequest,
  type UpdateEntityRequest,
  type InviteMemberRequest,
  type UpdateMemberRoleRequest,
} from './types';

// Internal config types
export type {
  EntityHelperConfig,
  InvitationHelperConfig,
  EntityOperationResult,
  ListEntitiesOptions,
  ListMembersOptions,
  ListInvitationsOptions,
} from './types';
