/**
 * @fileoverview Entity Member Helper Class
 * @description Operations for managing entity members and their roles
 */

import { eq, and } from 'drizzle-orm';
import {
  EntityRole,
  EntityType,
  type EntityMember,
  type EntityMemberUser,
  type EntityHelperConfig,
  type ListMembersOptions,
} from '../types';

/**
 * Helper class for entity member operations.
 */
export class EntityMemberHelper {
  constructor(private readonly config: EntityHelperConfig) {}

  /**
   * Get all members of an entity.
   */
  async getMembers(
    entityId: string,
    options?: ListMembersOptions
  ): Promise<EntityMember[]> {
    // Build conditions
    const conditions = [eq(this.config.membersTable.entity_id, entityId)];
    if (options?.role) {
      conditions.push(eq(this.config.membersTable.role, options.role));
    }

    let query = this.config.db
      .select({
        member: this.config.membersTable,
        user: {
          id: this.config.usersTable.uuid,
          email: this.config.usersTable.email,
          displayName: this.config.usersTable.display_name,
        },
      })
      .from(this.config.membersTable)
      .leftJoin(
        this.config.usersTable,
        eq(this.config.membersTable.user_id, this.config.usersTable.uuid)
      )
      .where(and(...conditions))
      .$dynamic();

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const results = await query;

    return results.map(({ member, user }) =>
      this.mapRecordToMember(member, user)
    );
  }

  /**
   * Get a specific member by user ID.
   */
  async getMember(
    entityId: string,
    userId: string
  ): Promise<EntityMember | null> {
    const results = await this.config.db
      .select({
        member: this.config.membersTable,
        user: {
          id: this.config.usersTable.uuid,
          email: this.config.usersTable.email,
          displayName: this.config.usersTable.display_name,
        },
      })
      .from(this.config.membersTable)
      .leftJoin(
        this.config.usersTable,
        eq(this.config.membersTable.user_id, this.config.usersTable.uuid)
      )
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

    return this.mapRecordToMember(results[0].member, results[0].user);
  }

  /**
   * Get user's role in an entity.
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
   * Add a member to an entity.
   */
  async addMember(
    entityId: string,
    userId: string,
    role: EntityRole
  ): Promise<EntityMember> {
    const [member] = await this.config.db
      .insert(this.config.membersTable)
      .values({
        entity_id: entityId,
        user_id: userId,
        role,
      })
      .returning();

    // Fetch user info for response
    const users = await this.config.db
      .select({
        id: this.config.usersTable.uuid,
        email: this.config.usersTable.email,
        displayName: this.config.usersTable.display_name,
      })
      .from(this.config.usersTable)
      .where(eq(this.config.usersTable.uuid, userId))
      .limit(1);

    return this.mapRecordToMember(member, users[0] ?? null);
  }

  /**
   * Update a member's role.
   */
  async updateMemberRole(
    entityId: string,
    userId: string,
    role: EntityRole
  ): Promise<EntityMember> {
    // Check constraints for personal entities
    const entity = await this.config.db
      .select()
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId))
      .limit(1);

    if (entity.length > 0 && entity[0].entity_type === EntityType.PERSONAL) {
      throw new Error('Cannot change roles in personal entities');
    }

    // Ensure at least one admin remains
    if (role !== EntityRole.ADMIN) {
      const admins = await this.config.db
        .select()
        .from(this.config.membersTable)
        .where(
          and(
            eq(this.config.membersTable.entity_id, entityId),
            eq(this.config.membersTable.role, EntityRole.ADMIN)
          )
        );

      const isOnlyAdmin =
        admins.length === 1 && admins[0].user_id === userId;
      if (isOnlyAdmin) {
        throw new Error('Cannot demote the only admin');
      }
    }

    const [updated] = await this.config.db
      .update(this.config.membersTable)
      .set({
        role,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(this.config.membersTable.entity_id, entityId),
          eq(this.config.membersTable.user_id, userId)
        )
      )
      .returning();

    // Fetch user info for response
    const users = await this.config.db
      .select({
        id: this.config.usersTable.uuid,
        email: this.config.usersTable.email,
        displayName: this.config.usersTable.display_name,
      })
      .from(this.config.usersTable)
      .where(eq(this.config.usersTable.uuid, userId))
      .limit(1);

    return this.mapRecordToMember(updated, users[0] ?? null);
  }

  /**
   * Remove a member from an entity.
   */
  async removeMember(entityId: string, userId: string): Promise<void> {
    // Check constraints for personal entities
    const entity = await this.config.db
      .select()
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId))
      .limit(1);

    if (entity.length > 0 && entity[0].entity_type === EntityType.PERSONAL) {
      throw new Error('Cannot remove members from personal entities');
    }

    // Check if user is the owner
    if (entity.length > 0 && entity[0].owner_user_id === userId) {
      throw new Error('Cannot remove the entity owner');
    }

    // Ensure at least one admin remains
    const member = await this.getMember(entityId, userId);
    if (member?.role === EntityRole.ADMIN) {
      const admins = await this.config.db
        .select()
        .from(this.config.membersTable)
        .where(
          and(
            eq(this.config.membersTable.entity_id, entityId),
            eq(this.config.membersTable.role, EntityRole.ADMIN)
          )
        );

      if (admins.length === 1) {
        throw new Error('Cannot remove the only admin');
      }
    }

    await this.config.db
      .delete(this.config.membersTable)
      .where(
        and(
          eq(this.config.membersTable.entity_id, entityId),
          eq(this.config.membersTable.user_id, userId)
        )
      );
  }

  /**
   * Check if a user is a member of an entity.
   */
  async isMember(entityId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(entityId, userId);
    return role !== null;
  }

  /**
   * Map database record to EntityMember type.
   */
  private mapRecordToMember(
    record: any,
    user: { id: string; email: string | null; displayName: string | null } | null
  ): EntityMember {
    const member: EntityMember = {
      id: record.id,
      entityId: record.entity_id,
      userId: record.user_id,
      role: record.role as EntityRole,
      joinedAt: record.joined_at?.toISOString() ?? new Date().toISOString(),
      createdAt: record.created_at?.toISOString() ?? new Date().toISOString(),
      updatedAt: record.updated_at?.toISOString() ?? new Date().toISOString(),
    };

    if (user) {
      member.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      };
    }

    return member;
  }
}
