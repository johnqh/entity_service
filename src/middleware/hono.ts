/**
 * @fileoverview Hono Middleware for Entity Context
 * @description Middleware to inject entity context into Hono request handlers
 */

import type { Context, MiddlewareHandler } from 'hono';
import { EntityHelper } from '../helpers/EntityHelper';
import { EntityMemberHelper } from '../helpers/EntityMemberHelper';
import { InvitationHelper } from '../helpers/InvitationHelper';
import { PermissionHelper } from '../helpers/PermissionHelper';
import {
  EntityRole,
  type Entity,
  type EntityPermissions,
  type InvitationHelperConfig,
} from '../types';

/**
 * Entity context available in Hono handlers.
 */
export interface EntityContext {
  entity: Entity;
  userRole: EntityRole;
  permissions: EntityPermissions;
}

/**
 * Options for entity context middleware.
 */
export interface EntityContextMiddlewareOptions {
  /** Function to get the user ID from the request context */
  getUserId: (c: Context) => string | null;
  /** Parameter name for entity slug in URL (default: 'entitySlug') */
  entitySlugParam?: string;
  /** Whether to allow unauthenticated access (default: false) */
  allowUnauthenticated?: boolean;
}

/**
 * Create middleware that injects entity context into the request.
 *
 * Usage:
 * ```typescript
 * const entityContext = createEntityContextMiddleware(config, {
 *   getUserId: (c) => c.get('userId'),
 *   entitySlugParam: 'entitySlug',
 * });
 *
 * app.use('/api/v1/entities/:entitySlug/*', entityContext);
 *
 * app.get('/api/v1/entities/:entitySlug/projects', (c) => {
 *   const { entity, userRole, permissions } = c.get('entityContext');
 *   // ...
 * });
 * ```
 */
export function createEntityContextMiddleware(
  config: InvitationHelperConfig,
  options: EntityContextMiddlewareOptions
): MiddlewareHandler {
  const entityHelper = new EntityHelper(config);
  const permissionHelper = new PermissionHelper(config);
  const slugParam = options.entitySlugParam ?? 'entitySlug';

  return async (c, next) => {
    const entitySlug = c.req.param(slugParam);

    if (!entitySlug) {
      return c.json({ error: 'Entity slug is required' }, 400);
    }

    const userId = options.getUserId(c);

    if (!userId && !options.allowUnauthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Get entity by slug
    const entity = await entityHelper.getEntityBySlug(entitySlug);

    if (!entity) {
      return c.json({ error: 'Entity not found' }, 404);
    }

    // If unauthenticated access is allowed and no user, continue without role
    if (!userId && options.allowUnauthenticated) {
      c.set('entity', entity);
      await next();
      return;
    }

    // Get user's role and permissions
    const userRole = await permissionHelper.getUserRole(entity.id, userId!);

    if (!userRole) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const permissions = permissionHelper.getPermissionsForRole(userRole);

    // Set entity context
    const entityContext: EntityContext = {
      entity,
      userRole,
      permissions,
    };

    c.set('entityContext', entityContext);
    c.set('entity', entity);
    c.set('userRole', userRole);
    c.set('permissions', permissions);

    await next();
  };
}

/**
 * Create middleware that requires a specific permission.
 *
 * Usage:
 * ```typescript
 * const requireAdmin = createRequirePermissionMiddleware('canManageMembers');
 *
 * app.post('/api/v1/entities/:entitySlug/members', requireAdmin, (c) => {
 *   // Only admins can reach here
 * });
 * ```
 */
export function createRequirePermissionMiddleware(
  permission: keyof EntityPermissions
): MiddlewareHandler {
  return async (c, next) => {
    const permissions = c.get('permissions') as EntityPermissions | undefined;

    if (!permissions) {
      return c.json({ error: 'Entity context not found' }, 500);
    }

    if (!permissions[permission]) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
}

/**
 * Create middleware that requires a minimum role.
 *
 * Usage:
 * ```typescript
 * const requireAdmin = createRequireRoleMiddleware(EntityRole.ADMIN);
 *
 * app.post('/api/v1/entities/:entitySlug/projects', requireAdmin, (c) => {
 *   // Only admins and owners can reach here
 * });
 * ```
 */
export function createRequireRoleMiddleware(
  minimumRole: EntityRole
): MiddlewareHandler {
  const roleHierarchy: Record<EntityRole, number> = {
    [EntityRole.MEMBER]: 0,
    [EntityRole.ADMIN]: 1,
    [EntityRole.OWNER]: 2,
  };

  return async (c, next) => {
    const userRole = c.get('userRole') as EntityRole | undefined;

    if (!userRole) {
      return c.json({ error: 'Entity context not found' }, 500);
    }

    if (roleHierarchy[userRole] < roleHierarchy[minimumRole]) {
      return c.json({ error: 'Insufficient role' }, 403);
    }

    await next();
  };
}

/**
 * Create all entity helpers with shared config.
 *
 * Usage:
 * ```typescript
 * const helpers = createEntityHelpers(config);
 * const entity = await helpers.entity.getEntity(entityId);
 * const members = await helpers.members.getMembers(entityId);
 * ```
 */
export function createEntityHelpers(config: InvitationHelperConfig) {
  return {
    entity: new EntityHelper(config),
    members: new EntityMemberHelper(config),
    invitations: new InvitationHelper(config),
    permissions: new PermissionHelper(config),
  };
}

/**
 * Type augmentation for Hono context.
 */
declare module 'hono' {
  interface ContextVariableMap {
    entityContext: EntityContext;
    entity: Entity;
    userRole: EntityRole;
    permissions: EntityPermissions;
  }
}
