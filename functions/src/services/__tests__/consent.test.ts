import { consentService } from '../consent';

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: () => 'test-consent-uuid-123',
}));

// Mock firebase-admin
jest.mock('firebase-admin', () => ({
  firestore: {
    Timestamp: {
      now: () => ({ seconds: 1700000000, nanoseconds: 0 }),
    },
  },
}));

// Firestore mock helpers
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = jest.fn().mockReturnValue({
  update: mockBatchUpdate,
  commit: mockBatchCommit,
});
const mockCollection = jest.fn();

jest.mock('../../config/firebase', () => ({
  db: {
    collection: (...args: unknown[]) => mockCollection(...args),
    batch: () => mockBatch(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCollection.mockReturnValue({
    doc: mockDoc,
    where: mockWhere,
  });
  mockWhere.mockReturnValue({ where: mockWhere, get: mockGet });
});

describe('consentService.requestConsent', () => {
  it('returns English consent message for language "en"', () => {
    const msg = consentService.requestConsent('+91123', 'ngo-1', 'en');
    expect(msg).toContain('collect information');
    expect(msg).toContain('WITHDRAW');
    expect(msg).toContain('YES');
    expect(msg).toContain('NO');
  });

  it('returns Hindi consent message for language "hi"', () => {
    const msg = consentService.requestConsent('+91123', 'ngo-1', 'hi');
    expect(msg).toContain('WITHDRAW');
    expect(msg).toContain('YES');
    expect(msg).toContain('NO');
  });

  it('returns Punjabi consent message for language "pa"', () => {
    const msg = consentService.requestConsent('+91123', 'ngo-1', 'pa');
    expect(msg).toContain('WITHDRAW');
    expect(msg).toContain('YES');
    expect(msg).toContain('NO');
  });

  it('falls back to English for unknown language', () => {
    const msg = consentService.requestConsent('+91123', 'ngo-1', 'fr');
    expect(msg).toContain('collect information');
  });

  it('throws when phone is empty', () => {
    expect(() => consentService.requestConsent('', 'ngo-1', 'en')).toThrow(
      'phone is required',
    );
  });

  it('throws when ngo_id is empty', () => {
    expect(() => consentService.requestConsent('+91123', '', 'en')).toThrow(
      'ngo_id is required',
    );
  });
});

describe('consentService.grantConsent', () => {
  it('creates a consent document and returns the consent ID', async () => {
    const id = await consentService.grantConsent('+91123', 'ngo-1');

    expect(id).toBe('test-consent-uuid-123');
    expect(mockCollection).toHaveBeenCalledWith('consents');
    expect(mockDoc).toHaveBeenCalledWith('test-consent-uuid-123');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-consent-uuid-123',
        phone: '+91123',
        ngo_id: 'ngo-1',
        status: 'active',
        granted_at: { seconds: 1700000000, nanoseconds: 0 },
      }),
    );
  });

  it('throws when phone is empty', async () => {
    await expect(consentService.grantConsent('', 'ngo-1')).rejects.toThrow(
      'phone is required',
    );
  });

  it('throws when ngo_id is empty', async () => {
    await expect(consentService.grantConsent('+91123', '')).rejects.toThrow(
      'ngo_id is required',
    );
  });
});

describe('consentService.revokeConsent', () => {
  const mockConsentRef = { id: 'consent-1', ref: { update: mockUpdate } };
  const mockNeedRef = { id: 'need-1', ref: { update: mockUpdate } };

  it('revokes active consent and anonymizes reporter_phone in needs', async () => {
    // First call: consents collection query
    const consentsGet = jest.fn().mockResolvedValue({
      empty: false,
      docs: [mockConsentRef],
    });
    // Second call: needs collection query
    const needsGet = jest.fn().mockResolvedValue({
      empty: false,
      docs: [mockNeedRef],
    });

    mockCollection.mockImplementation((path: string) => {
      if (path === 'consents') {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({ get: consentsGet }),
            }),
          }),
        };
      }
      if (path === 'needs') {
        return {
          where: jest.fn().mockReturnValue({ get: needsGet }),
        };
      }
      return { doc: mockDoc, where: mockWhere };
    });

    await consentService.revokeConsent('+91123', 'ngo-1');

    expect(mockBatchUpdate).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it('throws when no active consent exists', async () => {
    const emptyGet = jest.fn().mockResolvedValue({ empty: true, docs: [] });
    mockCollection.mockImplementation(() => ({
      where: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ get: emptyGet }),
        }),
      }),
    }));

    await expect(
      consentService.revokeConsent('+91123', 'ngo-1'),
    ).rejects.toThrow('No active consent found');
  });

  it('throws when phone is empty', async () => {
    await expect(consentService.revokeConsent('', 'ngo-1')).rejects.toThrow(
      'phone is required',
    );
  });

  it('throws when ngo_id is empty', async () => {
    await expect(consentService.revokeConsent('+91123', '')).rejects.toThrow(
      'ngo_id is required',
    );
  });

  it('handles revocation when no needs reference the consent', async () => {
    const consentsGet = jest.fn().mockResolvedValue({
      empty: false,
      docs: [mockConsentRef],
    });
    const needsGet = jest.fn().mockResolvedValue({ empty: true, docs: [] });

    mockCollection.mockImplementation((path: string) => {
      if (path === 'consents') {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({ get: consentsGet }),
            }),
          }),
        };
      }
      if (path === 'needs') {
        return {
          where: jest.fn().mockReturnValue({ get: needsGet }),
        };
      }
      return { doc: mockDoc, where: mockWhere };
    });

    // Should not throw
    await consentService.revokeConsent('+91123', 'ngo-1');
    expect(mockBatchCommit).toHaveBeenCalledTimes(1); // Only consent batch, no needs batch
  });
});

describe('consentService.hasValidConsent', () => {
  it('returns true when active consent exists', async () => {
    const activeGet = jest.fn().mockResolvedValue({ empty: false });
    mockCollection.mockImplementation(() => ({
      where: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ get: activeGet }),
        }),
      }),
    }));

    const result = await consentService.hasValidConsent('+91123', 'ngo-1');
    expect(result).toBe(true);
  });

  it('returns false when no active consent exists', async () => {
    const emptyGet = jest.fn().mockResolvedValue({ empty: true });
    mockCollection.mockImplementation(() => ({
      where: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ get: emptyGet }),
        }),
      }),
    }));

    const result = await consentService.hasValidConsent('+91123', 'ngo-1');
    expect(result).toBe(false);
  });

  it('throws when phone is empty', async () => {
    await expect(consentService.hasValidConsent('', 'ngo-1')).rejects.toThrow(
      'phone is required',
    );
  });

  it('throws when ngo_id is empty', async () => {
    await expect(consentService.hasValidConsent('+91123', '')).rejects.toThrow(
      'ngo_id is required',
    );
  });
});
