import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

const mockGet = jest.fn<() => Promise<any>>();
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(() => ({})),
  firestore: jest.fn(() => ({ collection: mockCollection })),
  auth: jest.fn(() => ({})),
}));

jest.mock('firebase-functions/v2', () => ({
  setGlobalOptions: jest.fn(),
  logger: { error: jest.fn(), info: jest.fn() },
}));

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: jest.fn((handler: any) => handler),
}));

// Import after mocks
import { healthCheck } from '../health-check';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReq(method = 'GET') {
  return { method } as any;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res.body = body;
      return res;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('healthCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({});
  });

  it('returns 200 with healthy status when all services are up', async () => {
    const req = mockReq();
    const res = mockRes();

    await (healthCheck as any)(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services).toEqual({
      firestore: 'up',
      gemini: 'up',
      twilio: 'up',
    });
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns 503 with degraded status when Firestore is down', async () => {
    mockGet.mockRejectedValue(new Error('Firestore unavailable'));

    const req = mockReq();
    const res = mockRes();

    await (healthCheck as any)(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.firestore).toBe('down');
    expect(res.body.services.gemini).toBe('up');
    expect(res.body.services.twilio).toBe('up');
  });

  it('returns 405 for non-GET requests', async () => {
    const req = mockReq('POST');
    const res = mockRes();

    await (healthCheck as any)(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('Method not allowed');
  });

  it('includes an ISO 8601 timestamp', async () => {
    const req = mockReq();
    const res = mockRes();

    await (healthCheck as any)(req, res);

    // Verify it's a valid ISO date string
    const parsed = new Date(res.body.timestamp);
    expect(parsed.toISOString()).toBe(res.body.timestamp);
  });
});
