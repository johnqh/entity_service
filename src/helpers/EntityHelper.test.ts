/**
 * @fileoverview Tests for EntityHelper
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EntityHelper } from './EntityHelper';
import { EntityType, EntityRole } from '../types';

// Mock data
const mockFirebaseUid = 'test-firebase-uid-123';
const mockEmail = 'test@example.com';
const mockEntityId = 'entity-uuid-123';
const mockEntitySlug = 'abc12345';

// Track what was inserted
let insertedEntities: any[] = [];
let insertedMembers: any[] = [];

// Mock database and tables
function createMockConfig() {
  insertedEntities = [];
  insertedMembers = [];

  const mockEntitiesTable = {
    id: 'id',
    entity_slug: 'entity_slug',
    entity_type: 'entity_type',
    display_name: 'display_name',
  };

  const mockMembersTable = {
    entity_id: 'entity_id',
    user_id: 'user_id',
    role: 'role',
    is_active: 'is_active',
  };

  const mockUsersTable = {};

  // Mock db with chainable methods
  const createChainableMock = (returnValue: any) => {
    const chain: any = {};
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.values = vi.fn().mockImplementation((values) => {
      if (values.entity_type) {
        insertedEntities.push(values);
      } else if (values.role) {
        insertedMembers.push(values);
      }
      return chain;
    });
    chain.returning = vi.fn().mockResolvedValue(returnValue);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue([]);
    return chain;
  };

  const mockDb = createChainableMock([
    {
      id: mockEntityId,
      entity_slug: mockEntitySlug,
      entity_type: EntityType.PERSONAL,
      display_name: 'test',
      description: null,
      avatar_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  return {
    db: mockDb,
    entitiesTable: mockEntitiesTable,
    membersTable: mockMembersTable,
    usersTable: mockUsersTable,
  };
}

describe('EntityHelper', () => {
  describe('createPersonalEntity', () => {
    test('creates entity with PERSONAL type', async () => {
      const config = createMockConfig();
      const helper = new EntityHelper(config);

      await helper.createPersonalEntity(mockFirebaseUid, mockEmail);

      expect(insertedEntities).toHaveLength(1);
      expect(insertedEntities[0].entity_type).toBe(EntityType.PERSONAL);
    });

    test('creates entity member with OWNER role (not MANAGER)', async () => {
      const config = createMockConfig();
      const helper = new EntityHelper(config);

      await helper.createPersonalEntity(mockFirebaseUid, mockEmail);

      expect(insertedMembers).toHaveLength(1);
      expect(insertedMembers[0].role).toBe(EntityRole.OWNER);
      expect(insertedMembers[0].role).not.toBe(EntityRole.MANAGER);
    });

    test('sets is_active to true for member', async () => {
      const config = createMockConfig();
      const helper = new EntityHelper(config);

      await helper.createPersonalEntity(mockFirebaseUid, mockEmail);

      expect(insertedMembers[0].is_active).toBe(true);
    });

    test('uses firebase uid as user_id', async () => {
      const config = createMockConfig();
      const helper = new EntityHelper(config);

      await helper.createPersonalEntity(mockFirebaseUid, mockEmail);

      expect(insertedMembers[0].user_id).toBe(mockFirebaseUid);
    });

    test('extracts display name from email', async () => {
      const config = createMockConfig();
      const helper = new EntityHelper(config);

      await helper.createPersonalEntity(mockFirebaseUid, 'john.doe@company.com');

      expect(insertedEntities[0].display_name).toBe('john.doe');
    });

    test('uses "Personal" as display name when no email provided', async () => {
      const config = createMockConfig();
      const helper = new EntityHelper(config);

      await helper.createPersonalEntity(mockFirebaseUid);

      expect(insertedEntities[0].display_name).toBe('Personal');
    });
  });

  describe('createOrganizationEntity', () => {
    test('creates entity with ORGANIZATION type', async () => {
      const config = createMockConfig();
      // Override the returning mock for organization
      config.db.returning = vi.fn().mockResolvedValue([
        {
          id: mockEntityId,
          entity_slug: mockEntitySlug,
          entity_type: EntityType.ORGANIZATION,
          display_name: 'My Org',
          description: null,
          avatar_url: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      const helper = new EntityHelper(config);

      await helper.createOrganizationEntity(mockFirebaseUid, {
        displayName: 'My Organization',
      });

      expect(insertedEntities).toHaveLength(1);
      expect(insertedEntities[0].entity_type).toBe(EntityType.ORGANIZATION);
    });

    test('creates entity member with OWNER role for organization', async () => {
      const config = createMockConfig();
      config.db.returning = vi.fn().mockResolvedValue([
        {
          id: mockEntityId,
          entity_slug: mockEntitySlug,
          entity_type: EntityType.ORGANIZATION,
          display_name: 'My Org',
          description: null,
          avatar_url: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      const helper = new EntityHelper(config);

      await helper.createOrganizationEntity(mockFirebaseUid, {
        displayName: 'My Organization',
      });

      expect(insertedMembers).toHaveLength(1);
      expect(insertedMembers[0].role).toBe(EntityRole.OWNER);
    });
  });

  describe('Role consistency', () => {
    test('personal entity owner has same role as organization owner', async () => {
      const config1 = createMockConfig();
      const helper1 = new EntityHelper(config1);
      await helper1.createPersonalEntity(mockFirebaseUid, mockEmail);
      const personalMemberRole = insertedMembers[0].role;

      const config2 = createMockConfig();
      config2.db.returning = vi.fn().mockResolvedValue([
        {
          id: mockEntityId,
          entity_slug: mockEntitySlug,
          entity_type: EntityType.ORGANIZATION,
          display_name: 'My Org',
          description: null,
          avatar_url: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      const helper2 = new EntityHelper(config2);
      await helper2.createOrganizationEntity(mockFirebaseUid, {
        displayName: 'My Organization',
      });
      const orgMemberRole = insertedMembers[0].role;

      // Both should be OWNER
      expect(personalMemberRole).toBe(EntityRole.OWNER);
      expect(orgMemberRole).toBe(EntityRole.OWNER);
      expect(personalMemberRole).toBe(orgMemberRole);
    });
  });
});
