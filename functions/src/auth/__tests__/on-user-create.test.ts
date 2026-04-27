import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock firebase-admin before any imports
const mockDocSet = jest.fn<() => Promise<any>>();
const mockDoc = jest.fn(() => ({ set: mockDocSet }));

jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(() => ({})),
  firestore: jest.fn(() => ({ doc: mockDoc })),
  auth: jest.fn(() => ({})),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
  },
}));

jest.mock("firebase-functions/v2", () => ({
  setGlobalOptions: jest.fn(),
}));

jest.mock("firebase-functions/v2/identity", () => ({
  beforeUserCreated: jest.fn((handler: any) => handler),
}));

// Import after mocks
import { onUserCreate } from "../on-user-create";

describe("onUserCreate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocSet.mockResolvedValue(undefined);
  });

  const callTrigger = (userData: any) =>
    (onUserCreate as any)({ data: userData });

  it("should create a user profile with default volunteer role", async () => {
    await callTrigger({
      uid: "user123",
      email: "test@example.com",
      displayName: "Test User",
    });

    expect(mockDoc).toHaveBeenCalledWith("users/user123");
    expect(mockDocSet).toHaveBeenCalledWith({
      uid: "user123",
      email: "test@example.com",
      displayName: "Test User",
      role: "volunteer",
      ngo_id: "",
      created_at: "SERVER_TIMESTAMP",
    });
  });

  it("should handle missing email and displayName", async () => {
    await callTrigger({
      uid: "user456",
      email: undefined,
      displayName: undefined,
    });

    expect(mockDocSet).toHaveBeenCalledWith({
      uid: "user456",
      email: "",
      displayName: "",
      role: "volunteer",
      ngo_id: "",
      created_at: "SERVER_TIMESTAMP",
    });
  });

  it("should set ngo_id to empty string by default", async () => {
    await callTrigger({
      uid: "user789",
      email: "user@test.com",
      displayName: "User",
    });

    const setCall = (mockDocSet.mock.calls[0] as any[])[0];
    expect(setCall.ngo_id).toBe("");
  });
});
