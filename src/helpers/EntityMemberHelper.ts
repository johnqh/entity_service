/**
 * @fileoverview Entity Member Helper Class
 * @description Operations for managing entity members and their roles
 */

import { eq, and } from 'drizzle-orm';
import {
  EntityRole,
  EntityType,
  type EntityMember,
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
   * By default, only returns active members.
   */
  async getMembers(
    entityId: string,
    options?: ListMembersOptions
  ): Promise<EntityMember[]> {
    // Build conditions - default to active members only
    const conditions = [eq(this.config.membersTable.entity_id, entityId)];
    if (options?.role) {
      conditions.push(eq(this.config.membersTable.role, options.role));
    }
    // Filter by is_active (default to true if not specified)
    const isActive = options?.isActive ?? true;
    conditions.push(eq(this.config.membersTable.is_active, isActive));

    let query = this.config.db
      .select({
        member: this.config.membersTable,
        user: {
          id: this.config.usersTable.firebase_uid,
          email: this.config.usersTable.email,
          displayName: this.config.usersTable.display_name,
        },
      })
      .from(this.config.membersTable)
      .leftJoin(
        this.config.usersTable,
        eq(this.config.membersTable.user_id, this.config.usersTable.firebase_uid)
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
   * Only returns active members by default.
   */
  async getMember(
    entityId: string,
    userId: string,
    includeInactive = false
  ): Promise<EntityMember | null> {
    const conditions = [
      eq(this.config.membersTable.entity_id, entityId),
      eq(this.config.membersTable.user_id, userId),
    ];
    if (!includeInactive) {
      conditions.push(eq(this.config.membersTable.is_active, true));
    }

    const results = await this.config.db
      .select({
        member: this.config.membersTable,
        user: {
          id: this.config.usersTable.firebase_uid,
          email: this.config.usersTable.email,
          displayName: this.config.usersTable.display_name,
        },
      })
      .from(this.config.membersTable)
      .leftJoin(
        this.config.usersTable,
        eq(this.config.membersTable.user_id, this.config.usersTable.firebase_uid)
      )
      .where(and(...conditions))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapRecordToMember(results[0].member, results[0].user);
  }

  /**
   * Get user's role in an entity.
   * Only returns role for active members.
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
          eq(this.config.membersTable.user_id, userId),
          eq(this.config.membersTable.is_active, true)
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
   * @param entityId - The entity ID
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param role - The member's role
   */
  async addMember(
    entityId: string,
    firebaseUid: string,
    role: EntityRole
  ): Promise<EntityMember> {
    // Check if there's an existing inactive membership to reactivate
    const existing = await this.getMember(entityId, firebaseUid, true);

    let member;
    if (existing && !existing.isActive) {
      // Reactivate existing membership
      const [updated] = await this.config.db
        .update(this.config.membersTable)
        .set({
          role,
          is_active: true,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(this.config.membersTable.entity_id, entityId),
            eq(this.config.membersTable.user_id, firebaseUid)
          )
        )
        .returning();
      member = updated;
    } else {
      // Create new membership
      const [inserted] = await this.config.db
        .insert(this.config.membersTable)
        .values({
          entity_id: entityId,
          user_id: firebaseUid,
          role,
          is_active: true,
        })
        .returning();
      member = inserted;
    }

    // Fetch user info for response
    const users = await this.config.db
      .select({
        id: this.config.usersTable.firebase_uid,
        email: this.config.usersTable.email,
        displayName: this.config.usersTable.display_name,
      })
      .from(this.config.usersTable)
      .where(eq(this.config.usersTable.firebase_uid, firebaseUid))
      .limit(1);

    return this.mapRecordToMember(member, users[0] ?? null);
  }

  /**
   * Update a member's role.
   * Cannot change the owner's role. Cannot set anyone to owner (ownership transfer is separate).
   */
  async updateMemberRole(
    entityId: string,
    userId: string,
    role: EntityRole
  ): Promise<EntityMember> {
    // Cannot assign owner role via this method
    if (role === EntityRole.OWNER) {
      throw new Error('Cannot assign owner role. Use ownership transfer instead.');
    }

    // Check constraints for personal entities
    const entity = await this.config.db
      .select()
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId))
      .limit(1);

    if (entity.length > 0 && entity[0].entity_type === EntityType.PERSONAL) {
      throw new Error('Cannot change roles in personal entities');
    }

    // Check if user is the owner - cannot change owner's role
    const currentMember = await this.getMember(entityId, userId);
    if (currentMember?.role === EntityRole.OWNER) {
      throw new Error('Cannot change the owner\'s role');
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
          eq(this.config.membersTable.user_id, userId),
          eq(this.config.membersTable.is_active, true)
        )
      )
      .returning();

    if (!updated) {
      throw new Error('Member not found or inactive');
    }

    // Fetch user info for response
    const users = await this.config.db
      .select({
        id: this.config.usersTable.firebase_uid,
        email: this.config.usersTable.email,
        displayName: this.config.usersTable.display_name,
      })
      .from(this.config.usersTable)
      .where(eq(this.config.usersTable.firebase_uid, userId))
      .limit(1);

    return this.mapRecordToMember(updated, users[0] ?? null);
  }

  /**
   * Remove a member from an entity (soft delete).
   * Sets is_active = false instead of deleting the record.
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

    // Check if user is the owner - cannot remove owner
    const member = await this.getMember(entityId, userId);
    if (!member) {
      throw new Error('Member not found');
    }

    if (member.role === EntityRole.OWNER) {
      throw new Error('Cannot remove the entity owner');
    }

    // Soft delete - set is_active = false
    await this.config.db
      .update(this.config.membersTable)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
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
      isActive: record.is_active ?? true,
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
