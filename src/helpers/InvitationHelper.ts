/**
 * @fileoverview Entity Invitation Helper Class
 * @description Operations for managing entity invitations
 */

import { eq, and, lt } from 'drizzle-orm';
import {
  EntityRole,
  InvitationStatus,
  type EntityInvitation,
  type InviteMemberRequest,
  type InvitationHelperConfig,
  type ListInvitationsOptions,
} from '../types';
import {
  generateInvitationToken,
  calculateInvitationExpiry,
} from '../utils';

/**
 * Helper class for entity invitation operations.
 */
export class InvitationHelper {
  constructor(private readonly config: InvitationHelperConfig) {}

  /**
   * Create an invitation to join an entity.
   */
  async createInvitation(
    entityId: string,
    invitedByUserId: string,
    request: InviteMemberRequest
  ): Promise<EntityInvitation> {
    // Check if user is already a member
    const existingMember = await this.config.db
      .select()
      .from(this.config.membersTable)
      .innerJoin(
        this.config.usersTable,
        eq(this.config.membersTable.user_id, this.config.usersTable.uuid)
      )
      .where(
        and(
          eq(this.config.membersTable.entity_id, entityId),
          eq(this.config.usersTable.email, request.email)
        )
      )
      .limit(1);

    if (existingMember.length > 0) {
      throw new Error('User is already a member of this entity');
    }

    // Check for existing pending invitation
    const existingInvite = await this.config.db
      .select()
      .from(this.config.invitationsTable)
      .where(
        and(
          eq(this.config.invitationsTable.entity_id, entityId),
          eq(this.config.invitationsTable.email, request.email),
          eq(this.config.invitationsTable.status, InvitationStatus.PENDING)
        )
      )
      .limit(1);

    if (existingInvite.length > 0) {
      throw new Error('An invitation is already pending for this email');
    }

    const token = generateInvitationToken();
    const expiresAt = calculateInvitationExpiry();

    const [invitation] = await this.config.db
      .insert(this.config.invitationsTable)
      .values({
        entity_id: entityId,
        email: request.email,
        role: request.role,
        status: InvitationStatus.PENDING,
        invited_by_user_id: invitedByUserId,
        token,
        expires_at: new Date(expiresAt),
      })
      .returning();

    return this.mapRecordToInvitation(invitation);
  }

  /**
   * Get an invitation by token.
   */
  async getInvitationByToken(token: string): Promise<EntityInvitation | null> {
    const results = await this.config.db
      .select()
      .from(this.config.invitationsTable)
      .where(eq(this.config.invitationsTable.token, token))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapRecordToInvitation(results[0]);
  }

  /**
   * Get an invitation by ID.
   */
  async getInvitation(invitationId: string): Promise<EntityInvitation | null> {
    const results = await this.config.db
      .select()
      .from(this.config.invitationsTable)
      .where(eq(this.config.invitationsTable.id, invitationId))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapRecordToInvitation(results[0]);
  }

  /**
   * Get all invitations for an entity.
   */
  async getEntityInvitations(
    entityId: string,
    options?: ListInvitationsOptions
  ): Promise<EntityInvitation[]> {
    // Build conditions
    const conditions = [eq(this.config.invitationsTable.entity_id, entityId)];
    if (options?.status) {
      conditions.push(eq(this.config.invitationsTable.status, options.status));
    }

    let query = this.config.db
      .select()
      .from(this.config.invitationsTable)
      .where(and(...conditions))
      .$dynamic();

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const results = await query;
    return results.map((r) => this.mapRecordToInvitation(r));
  }

  /**
   * Get all pending invitations for a user email.
   */
  async getUserPendingInvitations(email: string): Promise<EntityInvitation[]> {
    const results = await this.config.db
      .select({
        invitation: this.config.invitationsTable,
        entity: this.config.entitiesTable,
      })
      .from(this.config.invitationsTable)
      .innerJoin(
        this.config.entitiesTable,
        eq(this.config.invitationsTable.entity_id, this.config.entitiesTable.id)
      )
      .where(
        and(
          eq(this.config.invitationsTable.email, email),
          eq(this.config.invitationsTable.status, InvitationStatus.PENDING)
        )
      );

    return results.map(({ invitation, entity }) => ({
      ...this.mapRecordToInvitation(invitation),
      entity: {
        id: entity.id,
        entitySlug: entity.entity_slug,
        entityType: entity.entity_type as any,
        displayName: entity.display_name,
        description: entity.description,
        avatarUrl: entity.avatar_url,
        ownerUserId: entity.owner_user_id,
        createdAt: entity.created_at?.toISOString() ?? new Date().toISOString(),
        updatedAt: entity.updated_at?.toISOString() ?? new Date().toISOString(),
      },
    }));
  }

  /**
   * Accept an invitation.
   */
  async acceptInvitation(token: string, userId: string): Promise<void> {
    const invitation = await this.getInvitationByToken(token);

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new Error('Invitation is no longer pending');
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      // Mark as expired
      await this.config.db
        .update(this.config.invitationsTable)
        .set({
          status: InvitationStatus.EXPIRED,
          updated_at: new Date(),
        })
        .where(eq(this.config.invitationsTable.id, invitation.id));

      throw new Error('Invitation has expired');
    }

    // Add user as member
    await this.config.db.insert(this.config.membersTable).values({
      entity_id: invitation.entityId,
      user_id: userId,
      role: invitation.role,
    });

    // Mark invitation as accepted
    await this.config.db
      .update(this.config.invitationsTable)
      .set({
        status: InvitationStatus.ACCEPTED,
        accepted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(this.config.invitationsTable.id, invitation.id));
  }

  /**
   * Decline an invitation.
   */
  async declineInvitation(token: string): Promise<void> {
    const invitation = await this.getInvitationByToken(token);

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new Error('Invitation is no longer pending');
    }

    await this.config.db
      .update(this.config.invitationsTable)
      .set({
        status: InvitationStatus.DECLINED,
        updated_at: new Date(),
      })
      .where(eq(this.config.invitationsTable.id, invitation.id));
  }

  /**
   * Cancel an invitation (by entity admin).
   */
  async cancelInvitation(invitationId: string): Promise<void> {
    await this.config.db
      .delete(this.config.invitationsTable)
      .where(eq(this.config.invitationsTable.id, invitationId));
  }

  /**
   * Process pending invitations for a new user.
   * Called when a user signs up to auto-accept any pending invitations.
   */
  async processNewUserInvitations(userId: string, email: string): Promise<void> {
    const pendingInvitations = await this.getUserPendingInvitations(email);

    for (const invitation of pendingInvitations) {
      try {
        await this.acceptInvitation(invitation.token, userId);
      } catch (error) {
        // Log but don't fail - user account creation is more important
        console.error(`Failed to auto-accept invitation ${invitation.id}:`, error);
      }
    }
  }

  /**
   * Expire old invitations.
   * Should be called periodically (e.g., by a cron job).
   */
  async expireOldInvitations(): Promise<number> {
    const result = await this.config.db
      .update(this.config.invitationsTable)
      .set({
        status: InvitationStatus.EXPIRED,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(this.config.invitationsTable.status, InvitationStatus.PENDING),
          lt(this.config.invitationsTable.expires_at, new Date())
        )
      )
      .returning();

    return result.length;
  }

  /**
   * Map database record to EntityInvitation type.
   */
  private mapRecordToInvitation(record: any): EntityInvitation {
    return {
      id: record.id,
      entityId: record.entity_id,
      email: record.email,
      role: record.role as EntityRole,
      status: record.status as InvitationStatus,
      invitedByUserId: record.invited_by_user_id,
      token: record.token,
      expiresAt: record.expires_at?.toISOString() ?? new Date().toISOString(),
      acceptedAt: record.accepted_at?.toISOString() ?? null,
      createdAt: record.created_at?.toISOString() ?? new Date().toISOString(),
      updatedAt: record.updated_at?.toISOString() ?? new Date().toISOString(),
    };
  }
}
