import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response, NextFunction } from "express";

// Mock firebase-admin before any imports
const mockVerifyIdToken = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(() => ({})),
  firestore: jest.fn(() => ({})),
  auth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

jest.mock("firebase-functions/v2", () => ({
  setGlobalOptions: jest.fn(),
}));

const mockLoggerWarn = jest.fn();
jest.mock("firebase-functions", () => ({
  logger: { warn: mockLoggerWarn },
}));

import { requireRole, requireTenantMatch, AuthenticatedUser } from "../auth";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: {},
    params: {},
    method: "GET",
    originalUrl: "/test",
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {
    locals: {},
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res.body = body;
      return res;
    },
  };
  return res as Response;
}

describe("requireRole", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 when Authorization header is missing", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await requireRole("coordinator")(req, res, next);

    expect(res.statusCode).toBe(401);
    expect((res as any).body.error).toMatch(/Missing/i);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when Authorization header has no Bearer prefix", async () => {
    const req = mockReq({ headers: { authorization: "Token abc123" } as any });
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await requireRole("coordinator")(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when token is invalid or expired", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Token expired"));

    const req = mockReq({ headers: { authorization: "Bearer bad-token" } as any });
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await requireRole("coordinator")(req, res, next);

    expect(res.statusCode).toBe(401);
    expect((res as any).body.error).toMatch(/Invalid|expired/i);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when user role is not in allowed roles", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "user1",
      role: "volunteer",
      ngo_id: "ngo1",
      email: "user@example.com",
    });

    const req = mockReq({ headers: { authorization: "Bearer valid-token" } as any });
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await requireRole("coordinator", "ngo_admin")(req, res, next);

    expect(res.statusCode).toBe(403);
    expect((res as any).body.error).toMatch(/Insufficient/i);
    expect(next).not.toHaveBeenCalled();
  });

  it("should log unauthorized access attempts on role mismatch", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "user1",
      role: "volunteer",
      ngo_id: "ngo1",
    });

    const req = mockReq({
      headers: { authorization: "Bearer valid-token" } as any,
      method: "POST",
      originalUrl: "/api/needs",
    });
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await requireRole("coordinator")(req, res, next);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Unauthorized access attempt",
      expect.objectContaining({
        actor: "user1",
        role: "volunteer",
        requiredRoles: ["coordinator"],
        action: "POST",
        resource: "/api/needs",
      })
    );
  });

  it("should pass through and attach user when role matches", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "user1",
      role: "coordinator",
      ngo_id: "ngo1",
      email: "coord@example.com",
    });

    const req = mockReq({ headers: { authorization: "Bearer valid-token" } as any });
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await requireRole("coordinator", "ngo_admin")(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.locals.user).toEqual({
      uid: "user1",
      role: "coordinator",
      ngo_id: "ngo1",
      email: "coord@example.com",
    } satisfies AuthenticatedUser);
  });

  it("should accept any of multiple allowed roles", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin1",
      role: "super_admin",
      ngo_id: "ngo1",
    });

    const req = mockReq({ headers: { authorization: "Bearer valid-token" } as any });
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await requireRole("coordinator", "ngo_admin", "super_admin")(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.locals.user).toMatchObject({ role: "super_admin" });
  });
});

describe("requireTenantMatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 when user is not authenticated (no res.locals.user)", () => {
    const req = mockReq({ body: { ngo_id: "ngo1" } });
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    requireTenantMatch()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when ngo_id in body does not match user ngo_id", () => {
    const req = mockReq({ body: { ngo_id: "ngo2" } });
    const res = mockRes();
    res.locals.user = { uid: "u1", role: "coordinator", ngo_id: "ngo1" } as AuthenticatedUser;
    const next = jest.fn() as unknown as NextFunction;

    requireTenantMatch()(req, res, next);

    expect(res.statusCode).toBe(403);
    expect((res as any).body.error).toMatch(/Tenant mismatch/i);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when ngo_id in params does not match user ngo_id", () => {
    const req = mockReq({ params: { ngo_id: "ngo2" } as any });
    const res = mockRes();
    res.locals.user = { uid: "u1", role: "coordinator", ngo_id: "ngo1" } as AuthenticatedUser;
    const next = jest.fn() as unknown as NextFunction;

    requireTenantMatch()(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("should log tenant mismatch attempts", () => {
    const req = mockReq({
      body: { ngo_id: "ngo2" },
      method: "POST",
      originalUrl: "/api/needs",
    });
    const res = mockRes();
    res.locals.user = { uid: "u1", role: "coordinator", ngo_id: "ngo1" } as AuthenticatedUser;
    const next = jest.fn() as unknown as NextFunction;

    requireTenantMatch()(req, res, next);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Tenant mismatch attempt",
      expect.objectContaining({
        actor: "u1",
        role: "coordinator",
        userNgoId: "ngo1",
        targetNgoId: "ngo2",
        action: "POST",
        resource: "/api/needs",
      })
    );
  });

  it("should allow super_admin to bypass tenant check", () => {
    const req = mockReq({ body: { ngo_id: "ngo2" } });
    const res = mockRes();
    res.locals.user = { uid: "sa1", role: "super_admin", ngo_id: "ngo1" } as AuthenticatedUser;
    const next = jest.fn() as unknown as NextFunction;

    requireTenantMatch()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("should pass through when ngo_id matches", () => {
    const req = mockReq({ body: { ngo_id: "ngo1" } });
    const res = mockRes();
    res.locals.user = { uid: "u1", role: "coordinator", ngo_id: "ngo1" } as AuthenticatedUser;
    const next = jest.fn() as unknown as NextFunction;

    requireTenantMatch()(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should pass through when no ngo_id is present in request", () => {
    const req = mockReq();
    const res = mockRes();
    res.locals.user = { uid: "u1", role: "coordinator", ngo_id: "ngo1" } as AuthenticatedUser;
    const next = jest.fn() as unknown as NextFunction;

    requireTenantMatch()(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
