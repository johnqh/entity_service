# @sudobility/entity_service

Shared backend library for multi-tenant entity/organization management with Drizzle ORM and Hono middleware.

## Installation

```bash
bun add @sudobility/entity_service
```

## Usage

```typescript
import {
  createEntityHelpers,
  createEntitiesTable,
  createEntityMembersTable,
  createEntityContextMiddleware,
} from '@sudobility/entity_service';

// Setup helpers
const helpers = createEntityHelpers({
  db: drizzleDb,
  entitiesTable: schema.entities,
  membersTable: schema.entityMembers,
  invitationsTable: schema.entityInvitations,
  usersTable: schema.users,
});

// Entity operations
const entity = await helpers.entity.getOrCreatePersonalEntity(userId, email);
const org = await helpers.entity.createOrganizationEntity(userId, { displayName: 'My Org' });
const entities = await helpers.entity.getUserEntities(userId);

// Hono middleware
app.use('/api/v1/entities/:entitySlug/*', createEntityContextMiddleware(config, {
  getUserId: (c) => c.get('userId'),
}));
```

## API

### Schema Factories

| Export | Description |
|--------|-------------|
| `createEntitiesTable(pgSchema, prefix)` | Entities table definition |
| `createEntityMembersTable(pgSchema, prefix)` | Entity members table |
| `createEntityInvitationsTable(pgSchema, prefix)` | Invitations table |

### Helpers

| Helper | Key Methods |
|--------|-------------|
| `EntityHelper` | `getOrCreatePersonalEntity`, `createOrganizationEntity`, `getUserEntities`, CRUD |
| `EntityMemberHelper` | Member listing, role updates, removal |
| `InvitationHelper` | Create, accept, decline, cancel, renew invitations |
| `PermissionHelper` | Role-based permission checks (Owner > Manager > Member) |

### Middleware

| Export | Description |
|--------|-------------|
| `createEntityContextMiddleware` | Hono middleware injecting entity context, role, and permissions |

### Types

Re-exports from `@sudobility/types`: `Entity`, `EntityMember`, `EntityInvitation`, `EntityType`, `EntityRole`, `EntityPermissions`

## Development

```bash
bun run build        # Build ESM-only
bun run verify       # All checks + build (use before commit)
bun test             # Run tests (vitest)
bun run typecheck    # TypeScript check
bun run lint         # ESLint
bun run clean        # Remove dist/
```

## License

BUSL-1.1
