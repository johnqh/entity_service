# Entity Service

Shared backend library for multi-tenant entity/organization management.

**npm**: `@sudobility/entity_service` (public)

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun
- **Package Manager**: Bun (do not use npm/yarn/pnpm for installing dependencies)
- **Build**: TypeScript compiler (dual ESM/CJS)
- **Test**: bun:test
- **Database**: PostgreSQL with Drizzle ORM
- **Framework**: Hono middleware

## Project Structure

```
src/
├── index.ts              # Main exports
├── types/                # Type definitions
│   ├── entity.ts         # Entity types
│   ├── member.ts         # Member/role types
│   └── invitation.ts     # Invitation types
├── helpers/              # Business logic
│   ├── EntityHelper.ts   # Entity CRUD operations
│   ├── MemberHelper.ts   # Member management
│   └── InvitationHelper.ts # Invitation handling
├── middleware/           # Hono middleware
│   └── entityContext.ts  # Entity context injection
├── schema/               # Drizzle schema templates
│   ├── entities.ts
│   ├── entityMembers.ts
│   └── entityInvitations.ts
└── utils/                # Utilities
    └── permissions.ts    # Permission checks
```

## Commands

```bash
bun run build        # Build ESM + CJS
bun run verify       # All checks + build (use before commit)
bun test             # Run tests
bun run typecheck    # TypeScript check
bun run lint         # Run ESLint
bun run clean        # Remove dist/
```

## Key Concepts

### Entities
- **Personal Entity**: Auto-created for each user (entitySlug = userId)
- **Organization**: Created by users, has members with roles

### Roles & Permissions

| Permission | Owner | Manager | Member |
|------------|-------|---------|--------|
| View entity | Yes | Yes | Yes |
| Edit entity | Yes | Yes | No |
| Delete entity | Yes | No | No |
| Manage members | Yes | No | No |
| Invite members | Yes | No | No |
| Manage projects | Yes | Yes | No |
| Create projects | Yes | Yes | No |
| View projects | Yes | Yes | Yes |

### Invitation Flow
1. Owner creates invitation with email + role
2. Invitation stored with entity reference
3. On user signup, pending invitations auto-accepted
4. User becomes member of invited entities

## Usage

### Setup Helpers
```typescript
import { createEntityHelpers } from '@sudobility/entity_service';

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

### Hono Middleware
```typescript
import { createEntityContextMiddleware } from '@sudobility/entity_service';

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

Factory functions for creating tables in any PostgreSQL schema:

```typescript
import { createEntitiesTable, createEntityMembersTable } from '@sudobility/entity_service';
import { pgSchema } from 'drizzle-orm/pg-core';

const mySchema = pgSchema('my_app');

export const entities = createEntitiesTable(mySchema, 'my_app');
export const entityMembers = createEntityMembersTable(mySchema, 'my_app');
```

## Peer Dependencies

Required in consuming app:
- `drizzle-orm` - Database ORM
- `hono` - Web framework (for middleware)

## Publishing

```bash
bun run verify       # All checks
npm publish          # Publish to npm
```

## Architecture

```
entity_service (this package)
    ↑
shapeshyft_api (backend)
sudojo_api (backend)
```

## Code Patterns

### Error Handling
- Invalid entity slug: Return 404
- Permission denied: Return 403
- Duplicate invitation: Return 409

### Type Imports
```typescript
import type { Entity, EntityMember, EntityRole } from '@sudobility/entity_service';
import { EntityRole, hasPermission } from '@sudobility/entity_service';
```

## Workspace Context

This project is part of the **ShapeShyft** multi-project workspace at the parent directory. See `../CLAUDE.md` for the full architecture, dependency graph, and build order.

## Downstream Impact

| Downstream Consumer | Relationship |
|---------------------|-------------|
| `shapeshyft_api` | Direct dependency - uses entity middleware, helpers, and schema factories |

After making changes:
1. `bun run verify` in this project
2. `npm publish`
3. In `shapeshyft_api`: `bun update @sudobility/entity_service` then rebuild

Note: `entity_pages` does NOT depend on this package. It uses `@sudobility/entity_client` (a separate repo).

## Local Dev Workflow

```bash
# In this project:
bun link

# In shapeshyft_api:
bun link @sudobility/entity_service

# Rebuild after changes:
bun run build

# When done, unlink:
bun unlink @sudobility/entity_service && bun install
```

## Pre-Commit Checklist

```bash
bun run verify    # Runs: typecheck -> lint -> build (does NOT include tests)
bun test          # Run tests separately
```

## Gotchas

- **Schema factory functions require a schema name argument** -- `createEntitiesTable(mySchema, 'my_app')`. Forgetting the prefix causes table name collisions.
- **Peer dependencies (drizzle-orm, hono) must be installed by consumers** -- do not add to `dependencies`.
- **Personal entities use userId as entitySlug** -- this is a convention other code relies on. Do not change slug generation for personal entities.
- **Role permissions are hardcoded** in `permissions.ts`. Changing them affects all consumers.
