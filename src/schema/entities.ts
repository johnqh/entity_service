/**
 * @fileoverview Drizzle Schema for Entity/Organization Tables
 * @description Database schema definitions for entities, members, and invitations
 *
 * Provides:
 * - Factory functions for custom PostgreSQL schemas
 * - Default tables for public schema
 * - Initialization functions for table creation
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ========================================
// ENTITIES TABLE
// ========================================

/**
 * Create an entities table for a specific PostgreSQL schema.
 *
 * @param schema - The Drizzle pgSchema object
 * @param indexPrefix - Prefix for index names to avoid conflicts
 * @returns Drizzle table definition
 */
export function createEntitiesTable(schema: any, indexPrefix: string) {
  return schema.table(
    'entities',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      entity_slug: varchar('entity_slug', { length: 12 }).notNull().unique(),
      entity_type: varchar('entity_type', { length: 20 }).notNull(),
      display_name: varchar('display_name', { length: 255 }).notNull(),
      description: text('description'),
      avatar_url: text('avatar_url'),
      owner_user_id: uuid('owner_user_id').notNull(),
      created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table: any) => ({
      slugIdx: uniqueIndex(`${indexPrefix}_entities_slug_idx`).on(
        table.entity_slug
      ),
      ownerIdx: index(`${indexPrefix}_entities_owner_idx`).on(
        table.owner_user_id
      ),
      typeIdx: index(`${indexPrefix}_entities_type_idx`).on(table.entity_type),
    })
  );
}

/**
 * Create an entities table for the public schema.
 */
export function createEntitiesTablePublic(indexPrefix: string) {
  return pgTable(
    'entities',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      entity_slug: varchar('entity_slug', { length: 12 }).notNull().unique(),
      entity_type: varchar('entity_type', { length: 20 }).notNull(),
      display_name: varchar('display_name', { length: 255 }).notNull(),
      description: text('description'),
      avatar_url: text('avatar_url'),
      owner_user_id: uuid('owner_user_id').notNull(),
      created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table) => ({
      slugIdx: uniqueIndex(`${indexPrefix}_entities_slug_idx`).on(
        table.entity_slug
      ),
      ownerIdx: index(`${indexPrefix}_entities_owner_idx`).on(
        table.owner_user_id
      ),
      typeIdx: index(`${indexPrefix}_entities_type_idx`).on(table.entity_type),
    })
  );
}

// ========================================
// ENTITY MEMBERS TABLE
// ========================================

/**
 * Create an entity_members table for a specific PostgreSQL schema.
 */
export function createEntityMembersTable(schema: any, indexPrefix: string) {
  return schema.table(
    'entity_members',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      entity_id: uuid('entity_id').notNull(),
      user_id: uuid('user_id').notNull(),
      role: varchar('role', { length: 20 }).notNull(),
      joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow(),
      created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table: any) => ({
      entityUserUniqueIdx: uniqueIndex(
        `${indexPrefix}_entity_members_entity_user_idx`
      ).on(table.entity_id, table.user_id),
      entityIdx: index(`${indexPrefix}_entity_members_entity_idx`).on(
        table.entity_id
      ),
      userIdx: index(`${indexPrefix}_entity_members_user_idx`).on(table.user_id),
    })
  );
}

/**
 * Create an entity_members table for the public schema.
 */
export function createEntityMembersTablePublic(indexPrefix: string) {
  return pgTable(
    'entity_members',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      entity_id: uuid('entity_id').notNull(),
      user_id: uuid('user_id').notNull(),
      role: varchar('role', { length: 20 }).notNull(),
      joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow(),
      created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table) => ({
      entityUserUniqueIdx: uniqueIndex(
        `${indexPrefix}_entity_members_entity_user_idx`
      ).on(table.entity_id, table.user_id),
      entityIdx: index(`${indexPrefix}_entity_members_entity_idx`).on(
        table.entity_id
      ),
      userIdx: index(`${indexPrefix}_entity_members_user_idx`).on(table.user_id),
    })
  );
}

// ========================================
// ENTITY INVITATIONS TABLE
// ========================================

/**
 * Create an entity_invitations table for a specific PostgreSQL schema.
 */
export function createEntityInvitationsTable(schema: any, indexPrefix: string) {
  return schema.table(
    'entity_invitations',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      entity_id: uuid('entity_id').notNull(),
      email: varchar('email', { length: 255 }).notNull(),
      role: varchar('role', { length: 20 }).notNull(),
      status: varchar('status', { length: 20 }).notNull().default('pending'),
      invited_by_user_id: uuid('invited_by_user_id').notNull(),
      token: varchar('token', { length: 64 }).notNull().unique(),
      expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
      accepted_at: timestamp('accepted_at', { withTimezone: true }),
      created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table: any) => ({
      tokenIdx: uniqueIndex(`${indexPrefix}_entity_invitations_token_idx`).on(
        table.token
      ),
      entityIdx: index(`${indexPrefix}_entity_invitations_entity_idx`).on(
        table.entity_id
      ),
      emailIdx: index(`${indexPrefix}_entity_invitations_email_idx`).on(
        table.email
      ),
      statusIdx: index(`${indexPrefix}_entity_invitations_status_idx`).on(
        table.status
      ),
    })
  );
}

/**
 * Create an entity_invitations table for the public schema.
 */
export function createEntityInvitationsTablePublic(indexPrefix: string) {
  return pgTable(
    'entity_invitations',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      entity_id: uuid('entity_id').notNull(),
      email: varchar('email', { length: 255 }).notNull(),
      role: varchar('role', { length: 20 }).notNull(),
      status: varchar('status', { length: 20 }).notNull().default('pending'),
      invited_by_user_id: uuid('invited_by_user_id').notNull(),
      token: varchar('token', { length: 64 }).notNull().unique(),
      expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
      accepted_at: timestamp('accepted_at', { withTimezone: true }),
      created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table) => ({
      tokenIdx: uniqueIndex(`${indexPrefix}_entity_invitations_token_idx`).on(
        table.token
      ),
      entityIdx: index(`${indexPrefix}_entity_invitations_entity_idx`).on(
        table.entity_id
      ),
      emailIdx: index(`${indexPrefix}_entity_invitations_email_idx`).on(
        table.email
      ),
      statusIdx: index(`${indexPrefix}_entity_invitations_status_idx`).on(
        table.status
      ),
    })
  );
}

// ========================================
// DEFAULT TABLES (Public Schema)
// ========================================

/** Default entities table for public schema */
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entity_slug: varchar('entity_slug', { length: 12 }).notNull().unique(),
    entity_type: varchar('entity_type', { length: 20 }).notNull(),
    display_name: varchar('display_name', { length: 255 }).notNull(),
    description: text('description'),
    avatar_url: text('avatar_url'),
    owner_user_id: uuid('owner_user_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex('entities_slug_idx').on(table.entity_slug),
    ownerIdx: index('entities_owner_idx').on(table.owner_user_id),
    typeIdx: index('entities_type_idx').on(table.entity_type),
  })
);

/** Default entity_members table for public schema */
export const entityMembers = pgTable(
  'entity_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entity_id: uuid('entity_id').notNull(),
    user_id: uuid('user_id').notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    entityUserUniqueIdx: uniqueIndex('entity_members_entity_user_idx').on(
      table.entity_id,
      table.user_id
    ),
    entityIdx: index('entity_members_entity_idx').on(table.entity_id),
    userIdx: index('entity_members_user_idx').on(table.user_id),
  })
);

/** Default entity_invitations table for public schema */
export const entityInvitations = pgTable(
  'entity_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entity_id: uuid('entity_id').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    invited_by_user_id: uuid('invited_by_user_id').notNull(),
    token: varchar('token', { length: 64 }).notNull().unique(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex('entity_invitations_token_idx').on(table.token),
    entityIdx: index('entity_invitations_entity_idx').on(table.entity_id),
    emailIdx: index('entity_invitations_email_idx').on(table.email),
    statusIdx: index('entity_invitations_status_idx').on(table.status),
  })
);

// ========================================
// TYPE EXPORTS
// ========================================

/** TypeScript type for entities table row */
export type EntityRecord = typeof entities.$inferSelect;
export type NewEntityRecord = typeof entities.$inferInsert;

/** TypeScript type for entity_members table row */
export type EntityMemberRecord = typeof entityMembers.$inferSelect;
export type NewEntityMemberRecord = typeof entityMembers.$inferInsert;

/** TypeScript type for entity_invitations table row */
export type EntityInvitationRecord = typeof entityInvitations.$inferSelect;
export type NewEntityInvitationRecord = typeof entityInvitations.$inferInsert;

// ========================================
// INITIALIZATION FUNCTIONS
// ========================================

/**
 * Initialize all entity tables in the database.
 *
 * @param client - postgres-js client instance
 * @param schemaName - PostgreSQL schema name (null for public)
 * @param indexPrefix - Prefix for index names
 */
export async function initEntityTables(
  client: ReturnType<typeof import('postgres')>,
  schemaName: string | null,
  indexPrefix: string
): Promise<void> {
  const prefix = schemaName ? `${schemaName}.` : '';

  // Create entities table
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS ${prefix}entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_slug VARCHAR(12) NOT NULL UNIQUE,
      entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('personal', 'organization')),
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      avatar_url TEXT,
      owner_user_id UUID NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${indexPrefix}_entities_slug_idx
    ON ${prefix}entities (entity_slug)
  `);

  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS ${indexPrefix}_entities_owner_idx
    ON ${prefix}entities (owner_user_id)
  `);

  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS ${indexPrefix}_entities_type_idx
    ON ${prefix}entities (entity_type)
  `);

  // Create entity_members table
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS ${prefix}entity_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES ${prefix}entities(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'viewer')),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(entity_id, user_id)
    )
  `);

  await client.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${indexPrefix}_entity_members_entity_user_idx
    ON ${prefix}entity_members (entity_id, user_id)
  `);

  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS ${indexPrefix}_entity_members_entity_idx
    ON ${prefix}entity_members (entity_id)
  `);

  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS ${indexPrefix}_entity_members_user_idx
    ON ${prefix}entity_members (user_id)
  `);

  // Create entity_invitations table
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS ${prefix}entity_invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES ${prefix}entities(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'viewer')),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
      invited_by_user_id UUID NOT NULL,
      token VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${indexPrefix}_entity_invitations_token_idx
    ON ${prefix}entity_invitations (token)
  `);

  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS ${indexPrefix}_entity_invitations_entity_idx
    ON ${prefix}entity_invitations (entity_id)
  `);

  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS ${indexPrefix}_entity_invitations_email_idx
    ON ${prefix}entity_invitations (email)
  `);

  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS ${indexPrefix}_entity_invitations_status_idx
    ON ${prefix}entity_invitations (status)
  `);
}
