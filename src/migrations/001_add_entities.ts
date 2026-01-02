/**
 * @fileoverview Entity Tables Migration
 * @description Creates entity tables and migrates existing data
 *
 * This migration:
 * 1. Creates entities, entity_members, entity_invitations tables
 * 2. Adds entity_id column to projects table (nullable for backward compatibility)
 * 3. Creates personal entities for existing users
 * 4. Populates entity_id for existing projects
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

export interface MigrationConfig {
  /** postgres-js client instance */
  client: ReturnType<typeof import('postgres')>;
  /** PostgreSQL schema name (e.g., 'whisperly', 'shapeshyft') */
  schemaName: string;
  /** Index prefix for avoiding name conflicts */
  indexPrefix: string;
  /** Whether to also add entity_id to projects table */
  migrateProjects?: boolean;
}

/**
 * Run the full entity migration.
 */
export async function runEntityMigration(config: MigrationConfig): Promise<void> {
  const { client, schemaName, indexPrefix, migrateProjects = true } = config;
  const prefix = `${schemaName}.`;

  console.log(`Running entity migration for schema: ${schemaName}`);

  // Step 1: Create entity tables
  await createEntityTables(client, prefix, indexPrefix);

  // Step 2: Add entity_id to projects if requested
  if (migrateProjects) {
    await addEntityIdToProjects(client, prefix, indexPrefix);
  }

  // Step 3: Migrate existing users to personal entities
  await migrateUsersToPersonalEntities(client, prefix);

  // Step 4: Populate entity_id for existing projects
  if (migrateProjects) {
    await populateProjectEntityIds(client, prefix);
  }

  console.log('Entity migration completed successfully');
}

/**
 * Create the entity tables.
 */
async function createEntityTables(
  client: ReturnType<typeof import('postgres')>,
  prefix: string,
  indexPrefix: string
): Promise<void> {
  console.log('Creating entity tables...');

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

  console.log('Entity tables created');
}

/**
 * Add entity_id column to projects table.
 */
async function addEntityIdToProjects(
  client: ReturnType<typeof import('postgres')>,
  prefix: string,
  indexPrefix: string
): Promise<void> {
  console.log('Adding entity_id to projects table...');

  // Check if column already exists
  const columnExists = await client.unsafe(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = '${prefix.replace('.', '')}'
      AND table_name = 'projects'
      AND column_name = 'entity_id'
    )
  `);

  if (!columnExists[0]?.exists) {
    // Add nullable entity_id column
    await client.unsafe(`
      ALTER TABLE ${prefix}projects
      ADD COLUMN entity_id UUID REFERENCES ${prefix}entities(id) ON DELETE CASCADE
    `);

    // Create index on entity_id
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS ${indexPrefix}_projects_entity_idx
      ON ${prefix}projects (entity_id)
    `);

    console.log('entity_id column added to projects');
  } else {
    console.log('entity_id column already exists in projects');
  }
}

/**
 * Create personal entities for existing users.
 */
async function migrateUsersToPersonalEntities(
  client: ReturnType<typeof import('postgres')>,
  prefix: string
): Promise<void> {
  console.log('Migrating users to personal entities...');

  // Get users without personal entities
  const usersWithoutEntities = await client.unsafe(`
    SELECT u.id, u.email, u.display_name,
           COALESCE(s.organization_path, SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)) as slug_source
    FROM ${prefix}users u
    LEFT JOIN ${prefix}user_settings s ON u.id = s.user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM ${prefix}entities e
      WHERE e.owner_user_id = u.id AND e.entity_type = 'personal'
    )
  `);

  let migratedCount = 0;
  for (const user of usersWithoutEntities) {
    // Generate a unique slug (8 chars, lowercase alphanumeric)
    const slug = generateSlug(user.slug_source);
    const displayName = user.display_name || user.email?.split('@')[0] || 'Personal';

    try {
      // Create personal entity
      const [entity] = await client.unsafe(`
        INSERT INTO ${prefix}entities (entity_slug, entity_type, display_name, owner_user_id)
        VALUES ('${slug}', 'personal', '${displayName.replace(/'/g, "''")}', '${user.id}')
        RETURNING id
      `);

      // Add user as admin member
      await client.unsafe(`
        INSERT INTO ${prefix}entity_members (entity_id, user_id, role)
        VALUES ('${entity.id}', '${user.id}', 'admin')
      `);

      migratedCount++;
    } catch (error: any) {
      // If slug collision, generate a new one and retry
      if (error.code === '23505') {
        const newSlug = generateSlug();
        const [entity] = await client.unsafe(`
          INSERT INTO ${prefix}entities (entity_slug, entity_type, display_name, owner_user_id)
          VALUES ('${newSlug}', 'personal', '${displayName.replace(/'/g, "''")}', '${user.id}')
          RETURNING id
        `);

        await client.unsafe(`
          INSERT INTO ${prefix}entity_members (entity_id, user_id, role)
          VALUES ('${entity.id}', '${user.id}', 'admin')
        `);

        migratedCount++;
      } else {
        throw error;
      }
    }
  }

  console.log(`Migrated ${migratedCount} users to personal entities`);
}

/**
 * Populate entity_id for existing projects.
 */
async function populateProjectEntityIds(
  client: ReturnType<typeof import('postgres')>,
  prefix: string
): Promise<void> {
  console.log('Populating entity_id for existing projects...');

  // Update projects to use owner's personal entity
  const result = await client.unsafe(`
    UPDATE ${prefix}projects p
    SET entity_id = e.id
    FROM ${prefix}entities e
    WHERE p.user_id = e.owner_user_id
    AND e.entity_type = 'personal'
    AND p.entity_id IS NULL
  `);

  console.log(`Updated entity_id for ${result.count || 0} projects`);
}

/**
 * Generate a slug from a source string or random.
 */
function generateSlug(source?: string): string {
  if (source) {
    // Normalize: lowercase, remove non-alphanumeric, take first 8 chars
    return source
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 8)
      .padEnd(8, '0');
  }

  // Generate random slug
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

/**
 * Rollback the entity migration.
 */
export async function rollbackEntityMigration(config: MigrationConfig): Promise<void> {
  const { client, schemaName, indexPrefix, migrateProjects = true } = config;
  const prefix = `${schemaName}.`;

  console.log(`Rolling back entity migration for schema: ${schemaName}`);

  // Remove entity_id from projects first
  if (migrateProjects) {
    await client.unsafe(`
      ALTER TABLE ${prefix}projects DROP COLUMN IF EXISTS entity_id
    `);
  }

  // Drop tables in reverse order
  await client.unsafe(`DROP TABLE IF EXISTS ${prefix}entity_invitations`);
  await client.unsafe(`DROP TABLE IF EXISTS ${prefix}entity_members`);
  await client.unsafe(`DROP TABLE IF EXISTS ${prefix}entities`);

  console.log('Entity migration rolled back');
}
