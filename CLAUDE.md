# Entity Service

Shared backend library for multi-tenant entity/organization management.

## Overview

This library provides:
- **Entity management**: Personal workspaces and organizations
- **Member management**: Role-based access control (admin, manager, viewer)
- **Invitation system**: Email invitations with auto-accept on signup
- **Permission checking**: Granular permission checks
- **Hono middleware**: Entity context injection for routes

## Usage

### Setup

```typescript
import { createEntityHelpers } from '@shapeshyft/entity-service';

const helpers = createEntityHelpers({
  db: drizzleDb,
  entitiesTable: schema.entities,
  membersTable: schema.entityMembers,
  invitationsTable: schema.entityInvitations,
  usersTable: schema.users,
});
```

### Entity Operations

```typescript
// Get or create personal entity (on user login)
const personalEntity = await helpers.entity.getOrCreatePersonalEntity(userId, email);

// Create organization
const org = await helpers.entity.createOrganizationEntity(userId, {
  displayName: 'My Organization',
  entitySlug: 'my-org', // optional
});

// Get user's entities
const entities = await helpers.entity.getUserEntities(userId);
```

### Member Operations

```typescript
// Add member
await helpers.members.addMember(entityId, userId, EntityRole.MANAGER);

// Update role
await helpers.members.updateMemberRole(entityId, userId, EntityRole.ADMIN);

// Remove member
await helpers.members.removeMember(entityId, userId);
```

### Invitation Operations

```typescript
// Create invitation
const invitation = await helpers.invitations.createInvitation(entityId, invitedBy, {
  email: 'user@example.com',
  role: EntityRole.VIEWER,
});

// Process pending invitations for new user
await helpers.invitations.processNewUserInvitations(userId, email);
```

### Hono Middleware

```typescript
import { createEntityContextMiddleware } from '@shapeshyft/entity-service';

const entityContext = createEntityContextMiddleware(config, {
  getUserId: (c) => c.get('userId'),
});

app.use('/api/v1/entities/:entitySlug/*', entityContext);

app.get('/api/v1/entities/:entitySlug/projects', (c) => {
  const { entity, userRole, permissions } = c.get('entityContext');
  // Use entity context...
});
```

## Database Schema

The library provides factory functions for creating tables in any PostgreSQL schema:

```typescript
import { createEntitiesTable, createEntityMembersTable } from '@shapeshyft/entity-service';
import { pgSchema } from 'drizzle-orm/pg-core';

const mySchema = pgSchema('my_app');

export const entities = createEntitiesTable(mySchema, 'my_app');
export const entityMembers = createEntityMembersTable(mySchema, 'my_app');
```

## Role Permissions

| Permission | Admin | Manager | Viewer |
|------------|-------|---------|--------|
| View entity | ✓ | ✓ | ✓ |
| Edit entity | ✓ | ✗ | ✗ |
| Delete entity | ✓ | ✗ | ✗ |
| Manage members | ✓ | ✗ | ✗ |
| Invite members | ✓ | ✗ | ✗ |
| Manage projects | ✓ | ✓ | ✗ |
| Create projects | ✓ | ✓ | ✗ |
| View projects | ✓ | ✓ | ✓ |
| Manage API keys | ✓ | ✓ | ✗ |
| View API keys | ✓ | ✓ | ✓ |

## Build

```bash
bun run build       # Build both ESM and CJS
bun run typecheck   # Run TypeScript checks
bun run clean       # Clean build artifacts
```
