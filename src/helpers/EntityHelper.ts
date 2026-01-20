/**
 * @fileoverview Entity Helper Class
 * @description CRUD operations for entities (personal and organization workspaces)
 */

import { eq, and } from 'drizzle-orm';
import {
  EntityType,
  EntityRole,
  type Entity,
  type EntityWithRole,
  type CreateEntityRequest,
  type UpdateEntityRequest,
  type EntityHelperConfig,
} from '../types';
import { generateEntitySlug, validateSlug, normalizeSlug } from '../utils';

/**
 * Helper class for entity CRUD operations.
 */
export class EntityHelper {
  constructor(private readonly config: EntityHelperConfig) {}

  /**
   * Create a personal entity for a user.
   * Called automatically when a user first logs in.
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param email - Optional email for display name
   */
  async createPersonalEntity(
    firebaseUid: string,
    email?: string
  ): Promise<Entity> {
    const slug = generateEntitySlug();
    const displayName = email?.split('@')[0] ?? 'Personal';

    const [entity] = await this.config.db
      .insert(this.config.entitiesTable)
      .values({
        entity_slug: slug,
        entity_type: EntityType.PERSONAL,
        display_name: displayName,
      })
      .returning();

    // Add user as owner of their personal entity
    await this.config.db.insert(this.config.membersTable).values({
      entity_id: entity.id,
      user_id: firebaseUid,
      role: EntityRole.OWNER,
      is_active: true,
    });

    return this.mapRecordToEntity(entity);
  }

  /**
   * Get or create a personal entity for a user.
   * Ensures exactly one personal entity exists per user.
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param email - Optional email for display name
   */
  async getOrCreatePersonalEntity(
    firebaseUid: string,
    email?: string
  ): Promise<Entity> {
    // Check for existing personal entity where user is owner
    const existing = await this.config.db
      .select({ entity: this.config.entitiesTable })
      .from(this.config.membersTable)
      .innerJoin(
        this.config.entitiesTable,
        eq(this.config.membersTable.entity_id, this.config.entitiesTable.id)
      )
      .where(
        and(
          eq(this.config.membersTable.user_id, firebaseUid),
          eq(this.config.membersTable.role, EntityRole.OWNER),
          eq(this.config.membersTable.is_active, true),
          eq(this.config.entitiesTable.entity_type, EntityType.PERSONAL)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return this.mapRecordToEntity(existing[0].entity);
    }

    return this.createPersonalEntity(firebaseUid, email);
  }

  /**
   * Create an organization entity.
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param request - Entity creation request
   */
  async createOrganizationEntity(
    firebaseUid: string,
    request: CreateEntityRequest
  ): Promise<Entity> {
    // Determine slug
    let slug: string;
    if (request.entitySlug) {
      slug = normalizeSlug(request.entitySlug);
      if (!validateSlug(slug)) {
        throw new Error('Invalid entity slug format');
      }
      // Check availability
      if (!(await this.isSlugAvailable(slug))) {
        throw new Error('Entity slug is already taken');
      }
    } else {
      slug = await this.generateUniqueSlug();
    }

    const [entity] = await this.config.db
      .insert(this.config.entitiesTable)
      .values({
        entity_slug: slug,
        entity_type: EntityType.ORGANIZATION,
        display_name: request.displayName,
        description: request.description ?? null,
      })
      .returning();

    // Add creator as owner
    await this.config.db.insert(this.config.membersTable).values({
      entity_id: entity.id,
      user_id: firebaseUid,
      role: EntityRole.OWNER,
      is_active: true,
    });

    return this.mapRecordToEntity(entity);
  }

  /**
   * Get entity by ID.
   */
  async getEntity(entityId: string): Promise<Entity | null> {
    const results = await this.config.db
      .select()
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapRecordToEntity(results[0]);
  }

  /**
   * Get entity by slug.
   */
  async getEntityBySlug(slug: string): Promise<Entity | null> {
    const results = await this.config.db
      .select()
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.entity_slug, slug))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapRecordToEntity(results[0]);
  }

  /**
   * Get all entities a user is a member of.
   * If the user has no entities, a personal entity is automatically created.
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param email - Optional email for display name if creating personal entity
   */
  async getUserEntities(
    firebaseUid: string,
    email?: string
  ): Promise<EntityWithRole[]> {
    const results = await this.config.db
      .select({
        entity: this.config.entitiesTable,
        role: this.config.membersTable.role,
      })
      .from(this.config.membersTable)
      .innerJoin(
        this.config.entitiesTable,
        eq(this.config.membersTable.entity_id, this.config.entitiesTable.id)
      )
      .where(
        and(
          eq(this.config.membersTable.user_id, firebaseUid),
          eq(this.config.membersTable.is_active, true)
        )
      );

    // If user has no entities, create a personal entity for them
    if (results.length === 0) {
      const personalEntity = await this.createPersonalEntity(firebaseUid, email);
      return [
        {
          ...personalEntity,
          userRole: EntityRole.OWNER,
        },
      ];
    }

    return results.map(({ entity, role }) => ({
      ...this.mapRecordToEntity(entity),
      userRole: role as EntityRole,
    }));
  }

  /**
   * Update entity details.
   */
  async updateEntity(
    entityId: string,
    request: UpdateEntityRequest
  ): Promise<Entity> {
    const updates: Record<string, any> = {
      updated_at: new Date(),
    };

    if (request.displayName !== undefined) {
      updates.display_name = request.displayName;
    }

    if (request.description !== undefined) {
      updates.description = request.description;
    }

    if (request.avatarUrl !== undefined) {
      updates.avatar_url = request.avatarUrl;
    }

    if (request.entitySlug !== undefined) {
      const slug = normalizeSlug(request.entitySlug);
      if (!validateSlug(slug)) {
        throw new Error('Invalid entity slug format');
      }
      // Check if changing slug
      const existing = await this.getEntity(entityId);
      if (existing && existing.entitySlug !== slug) {
        if (!(await this.isSlugAvailable(slug))) {
          throw new Error('Entity slug is already taken');
        }
        updates.entity_slug = slug;
      }
    }

    const [updated] = await this.config.db
      .update(this.config.entitiesTable)
      .set(updates)
      .where(eq(this.config.entitiesTable.id, entityId))
      .returning();

    return this.mapRecordToEntity(updated);
  }

  /**
   * Delete an entity.
   * Only organizations can be deleted; personal entities cannot.
   */
  async deleteEntity(entityId: string): Promise<void> {
    const entity = await this.getEntity(entityId);
    if (!entity) {
      throw new Error('Entity not found');
    }

    if (entity.entityType === EntityType.PERSONAL) {
      throw new Error('Personal entities cannot be deleted');
    }

    await this.config.db
      .delete(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId));
  }

  /**
   * Check if a slug is available.
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const results = await this.config.db
      .select({ id: this.config.entitiesTable.id })
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.entity_slug, slug))
      .limit(1);

    return results.length === 0;
  }

  /**
   * Generate a unique slug.
   */
  private async generateUniqueSlug(): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts++) {
      const slug = generateEntitySlug();
      if (await this.isSlugAvailable(slug)) {
        return slug;
      }
    }
    throw new Error('Failed to generate unique slug');
  }

  /**
   * Map database record to Entity type.
   */
  private mapRecordToEntity(record: any): Entity {
    return {
      id: record.id,
      entitySlug: record.entity_slug,
      entityType: record.entity_type as EntityType,
      displayName: record.display_name,
      description: record.description,
      avatarUrl: record.avatar_url,
      createdAt: record.created_at?.toISOString() ?? new Date().toISOString(),
      updatedAt: record.updated_at?.toISOString() ?? new Date().toISOString(),
    };
  }
}
