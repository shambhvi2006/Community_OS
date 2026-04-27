import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock firebase-admin before any imports
const mockSetCustomUserClaims = jest.fn<() => Promise<void>>();
const mockDocSet = jest.fn<() => Promise<any>>();
const mockDoc = jest.fn(() => ({ set: mockDocSet }));

jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(() => ({})),
  firestore: jest.fn(() => ({ doc: mockDoc })),
  auth: jest.fn(() => ({ setCustomUserClaims: mockSetCustomUserClaims })),
}));

jest.mock("firebase-functions/v2", () => ({
  setGlobalOptions: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest.fn((handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Import after mocks
import { setCustomClaims } from "../set-custom-claims";

describe("setCustomClaims", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    mockDocSet.mockResolvedValue(undefined);
  });

  const callFn = (auth: any, data: any) =>
    (setCustomClaims as any)({ auth, data });

  it("should reject unauthenticated callers", async () => {
    await expect(
      callFn(null, { uid: "u1", role: "volunteer", ngo_id: "ngo1" })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("should reject callers without ngo_admin or super_admin role", async () => {
    const auth = { token: { role: "coordinator", ngo_id: "ngo1" } };
    await expect(
      callFn(auth, { uid: "u1", role: "volunteer", ngo_id: "ngo1" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("should reject volunteer callers", async () => {
    const auth = { token: { role: "volunteer", ngo_id: "ngo1" } };
    await expect(
      callFn(auth, { uid: "u1", role: "volunteer", ngo_id: "ngo1" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("should reject invalid role values", async () => {
    const auth = { token: { role: "super_admin", ngo_id: "ngo1" } };
    await expect(
      callFn(auth, { uid: "u1", role: "hacker", ngo_id: "ngo1" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("should reject missing uid", async () => {
    const auth = { token: { role: "super_admin", ngo_id: "ngo1" } };
    await expect(
      callFn(auth, { uid: "", role: "volunteer", ngo_id: "ngo1" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("should reject missing ngo_id", async () => {
    const auth = { token: { role: "super_admin", ngo_id: "ngo1" } };
    await expect(
      callFn(auth, { uid: "u1", role: "volunteer", ngo_id: "" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("should reject ngo_admin setting claims for a different ngo", async () => {
    const auth = { token: { role: "ngo_admin", ngo_id: "ngo1" } };
    await expect(
      callFn(auth, { uid: "u1", role: "volunteer", ngo_id: "ngo2" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("should allow super_admin to set claims for any ngo", async () => {
    const auth = { token: { role: "super_admin", ngo_id: "ngo1" } };
    const result = await callFn(auth, {
      uid: "u1",
      role: "coordinator",
      ngo_id: "ngo2",
    });

    expect(result).toEqual({ success: true });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", {
      role: "coordinator",
      ngo_id: "ngo2",
    });
    expect(mockDoc).toHaveBeenCalledWith("users/u1");
    expect(mockDocSet).toHaveBeenCalledWith(
      { role: "coordinator", ngo_id: "ngo2" },
      { merge: true }
    );
  });

  it("should allow ngo_admin to set claims within their own ngo", async () => {
    const auth = { token: { role: "ngo_admin", ngo_id: "ngo1" } };
    const result = await callFn(auth, {
      uid: "u2",
      role: "volunteer",
      ngo_id: "ngo1",
    });

    expect(result).toEqual({ success: true });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u2", {
      role: "volunteer",
      ngo_id: "ngo1",
    });
  });

  it("should accept all four valid roles", async () => {
    const auth = { token: { role: "super_admin", ngo_id: "ngo1" } };
    for (const role of [
      "super_admin",
      "ngo_admin",
      "coordinator",
      "volunteer",
    ]) {
      jest.clearAllMocks();
      mockSetCustomUserClaims.mockResolvedValue(undefined);
      mockDocSet.mockResolvedValue(undefined);

      const result = await callFn(auth, { uid: "u1", role, ngo_id: "ngo1" });
      expect(result).toEqual({ success: true });
    }
  });
});
