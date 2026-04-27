import { auditTrailService } from '../audit-trail';

// Mock firebase-admin
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn().mockReturnValue({ id: 'auto-id-123', set: mockSet });
const mockOrderBy = jest.fn();
const mockGet = jest.fn();
const mockCollection = jest.fn();

jest.mock('firebase-admin', () => ({
  firestore: {
    Timestamp: {
      now: () => ({ seconds: 1700000000, nanoseconds: 0 }),
    },
  },
}));

jest.mock('../../config/firebase', () => ({
  db: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCollection.mockReturnValue({ doc: mockDoc });
  mockOrderBy.mockReturnValue({ get: mockGet });
});

const validEntry = {
  actor_id: 'user-1',
  actor_role: 'coordinator' as const,
  action_type: 'status_change',
  previous_value: 'new',
  new_value: 'triaged',
  source: 'web' as const,
};

describe('auditTrailService.append', () => {
  it('writes an audit entry to the correct subcollection', async () => {
    const result = await auditTrailService.append('need-abc', validEntry);

    expect(mockCollection).toHaveBeenCalledWith('needs/need-abc/audit_entries');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'auto-id-123',
        actor_id: 'user-1',
        actor_role: 'coordinator',
        action_type: 'status_change',
        previous_value: 'new',
        new_value: 'triaged',
        source: 'web',
        timestamp: { seconds: 1700000000, nanoseconds: 0 },
      }),
    );
    expect(result.id).toBe('auto-id-123');
    expect(result.timestamp).toEqual({ seconds: 1700000000, nanoseconds: 0 });
  });

  it('throws when need_id is empty', async () => {
    await expect(auditTrailService.append('', validEntry)).rejects.toThrow(
      'need_id is required',
    );
  });

  it('throws when actor_id is missing', async () => {
    await expect(
      auditTrailService.append('need-1', { ...validEntry, actor_id: '' }),
    ).rejects.toThrow('actor_id is required');
  });

  it('throws when actor_role is missing', async () => {
    await expect(
      auditTrailService.append('need-1', { ...validEntry, actor_role: '' as any }),
    ).rejects.toThrow('actor_role is required');
  });

  it('throws when action_type is missing', async () => {
    await expect(
      auditTrailService.append('need-1', { ...validEntry, action_type: '' }),
    ).rejects.toThrow('action_type is required');
  });

  it('throws when source is missing', async () => {
    await expect(
      auditTrailService.append('need-1', { ...validEntry, source: '' as any }),
    ).rejects.toThrow('source is required');
  });

  it('allows null previous_value and new_value', async () => {
    const entry = { ...validEntry, previous_value: null, new_value: null };
    const result = await auditTrailService.append('need-1', entry);
    expect(result.previous_value).toBeNull();
    expect(result.new_value).toBeNull();
  });
});

describe('auditTrailService.getTrail', () => {
  it('returns audit entries sorted by timestamp ascending', async () => {
    const docs = [
      { data: () => ({ id: '1', timestamp: { seconds: 100, nanoseconds: 0 }, actor_id: 'a' }) },
      { data: () => ({ id: '2', timestamp: { seconds: 200, nanoseconds: 0 }, actor_id: 'b' }) },
    ];
    mockGet.mockResolvedValue({ docs });
    mockCollection.mockReturnValue({ orderBy: mockOrderBy });

    const trail = await auditTrailService.getTrail('need-xyz');

    expect(mockCollection).toHaveBeenCalledWith('needs/need-xyz/audit_entries');
    expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'asc');
    expect(trail).toHaveLength(2);
    expect(trail[0].id).toBe('1');
    expect(trail[1].id).toBe('2');
  });

  it('throws when need_id is empty', async () => {
    await expect(auditTrailService.getTrail('')).rejects.toThrow(
      'need_id is required',
    );
  });

  it('returns empty array when no entries exist', async () => {
    mockGet.mockResolvedValue({ docs: [] });
    mockCollection.mockReturnValue({ orderBy: mockOrderBy });

    const trail = await auditTrailService.getTrail('need-empty');
    expect(trail).toEqual([]);
  });
});
