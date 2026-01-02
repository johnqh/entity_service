/**
 * @fileoverview Entity Permission Helper Class
 * @description Permission checking for entity operations
 */

import { eq, and } from 'drizzle-orm';
import {
  EntityRole,
  EntityType,
  ROLE_PERMISSIONS,
  type EntityPermissions,
  type EntityHelperConfig,
} from '../types';

/**
 * Helper class for entity permission checks.
 */
export class PermissionHelper {
  constructor(private readonly config: EntityHelperConfig) {}

  /**
   * Get a user's role in an entity.
   */
  async getUserRole(
    entityId: string,
    userId: string
  ): Promise<EntityRole | null> {
    const results = await this.config.db
      .select({ role: this.config.membersTable.role })
      .from(this.config.membersTable)
      .where(
        and(
          eq(this.config.membersTable.entity_id, entityId),
          eq(this.config.membersTable.user_id, userId)
        )
      )
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return results[0].role as EntityRole;
  }

  /**
   * Get permissions for a role.
   */
  getPermissionsForRole(role: EntityRole): EntityPermissions {
    return ROLE_PERMISSIONS[role];
  }

  /**
   * Get a user's permissions for an entity.
   */
  async getUserPermissions(
    entityId: string,
    userId: string
  ): Promise<EntityPermissions | null> {
    const role = await this.getUserRole(entityId, userId);
    if (!role) {
      return null;
    }
    return this.getPermissionsForRole(role);
  }

  /**
   * Check if user is a member of an entity.
   */
  async isMember(entityId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(entityId, userId);
    return role !== null;
  }

  /**
   * Check if user is an admin of an entity.
   */
  async isAdmin(entityId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(entityId, userId);
    return role === EntityRole.ADMIN;
  }

  /**
   * Check if user is the owner of an entity.
   */
  async isOwner(entityId: string, userId: string): Promise<boolean> {
    const results = await this.config.db
      .select({ ownerUserId: this.config.entitiesTable.owner_user_id })
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId))
      .limit(1);

    if (results.length === 0) {
      return false;
    }

    return results[0].ownerUserId === userId;
  }

  /**
   * Check if user can view an entity.
   */
  async canViewEntity(entityId: string, userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canViewEntity ?? false;
  }

  /**
   * Check if user can edit an entity.
   */
  async canEditEntity(entityId: string, userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canEditEntity ?? false;
  }

  /**
   * Check if user can delete an entity.
   */
  async canDeleteEntity(entityId: string, userId: string): Promise<boolean> {
    // First check if it's a personal entity (cannot be deleted)
    const entity = await this.config.db
      .select({ entityType: this.config.entitiesTable.entity_type })
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId))
      .limit(1);

    if (entity.length === 0) {
      return false;
    }

    if (entity[0].entityType === EntityType.PERSONAL) {
      return false;
    }

    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canDeleteEntity ?? false;
  }

  /**
   * Check if user can manage members.
   */
  async canManageMembers(entityId: string, userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canManageMembers ?? false;
  }

  /**
   * Check if user can invite members.
   */
  async canInviteMembers(entityId: string, userId: string): Promise<boolean> {
    // Check if it's a personal entity (no invitations allowed)
    const entity = await this.config.db
      .select({ entityType: this.config.entitiesTable.entity_type })
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId))
      .limit(1);

    if (entity.length === 0) {
      return false;
    }

    if (entity[0].entityType === EntityType.PERSONAL) {
      return false;
    }

    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canInviteMembers ?? false;
  }

  /**
   * Check if user can create projects.
   */
  async canCreateProjects(entityId: string, userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canCreateProjects ?? false;
  }

  /**
   * Check if user can manage projects.
   */
  async canManageProjects(entityId: string, userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canManageProjects ?? false;
  }

  /**
   * Check if user can view projects.
   */
  async canViewProjects(entityId: string, userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canViewProjects ?? false;
  }

  /**
   * Check if user can manage API keys.
   */
  async canManageApiKeys(entityId: string, userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canManageApiKeys ?? false;
  }

  /**
   * Check if user can view API keys.
   */
  async canViewApiKeys(entityId: string, userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(entityId, userId);
    return permissions?.canViewApiKeys ?? false;
  }

  /**
   * Assert that a user has a specific permission.
   * Throws an error if the user lacks the permission.
   */
  async assertPermission(
    entityId: string,
    userId: string,
    permission: keyof EntityPermissions,
    errorMessage?: string
  ): Promise<void> {
    const permissions = await this.getUserPermissions(entityId, userId);

    if (!permissions) {
      throw new Error(errorMessage ?? 'User is not a member of this entity');
    }

    if (!permissions[permission]) {
      throw new Error(
        errorMessage ?? `User lacks permission: ${permission}`
      );
    }
  }

  /**
   * Get the minimum role required for a permission.
   */
  getMinimumRoleForPermission(
    permission: keyof EntityPermissions
  ): EntityRole | null {
    // Check from lowest to highest privilege
    const roles = [EntityRole.VIEWER, EntityRole.MANAGER, EntityRole.ADMIN];

    for (const role of roles) {
      if (ROLE_PERMISSIONS[role][permission]) {
        return role;
      }
    }

    return null;
  }
}
