import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory command handler registry
const handlers = new Map<string, (...args: unknown[]) => unknown>();
function mockCommand(cmd: string, handler: (...args: unknown[]) => unknown) {
  handlers.set(cmd, handler);
}
function clearMockCommands() {
  handlers.clear();
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    const handler = handlers.get(cmd);
    if (!handler) return Promise.reject(new Error(`Unknown command: ${cmd}`));
    return Promise.resolve(handler(args));
  },
}));

const { connectTelepresence, quitTelepresence, getStatus } = await import(
  "../services/telepresence"
);

beforeEach(() => {
  clearMockCommands();
});

describe("telepresence - connectTelepresence", () => {
  it("returns success on successful connect", async () => {
    mockCommand("telepresence_connect", () => "Connected to cluster");
    const result = await connectTelepresence({
      kubeconfig: "/path/to/kubeconfig",
      namespace: "default",
      skipTlsVerify: false,
    });
    expect(result.success).toBe(true);
    expect(result.message).toBe("Connected to cluster");
  });

  it("passes all params to invoke", async () => {
    mockCommand("telepresence_connect", (args) => {
      expect(args).toEqual({
        kubeconfig: "/path/kubeconfig",
        namespace: "prod",
        skipTlsVerify: true,
      });
      return "ok";
    });
    await connectTelepresence({
      kubeconfig: "/path/kubeconfig",
      namespace: "prod",
      skipTlsVerify: true,
    });
  });

  it("returns failure on invoke error (string)", async () => {
    mockCommand("telepresence_connect", () => {
      throw "Connection refused";
    });
    const result = await connectTelepresence({
      kubeconfig: "",
      namespace: "",
      skipTlsVerify: false,
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Connection refused");
  });

  it("returns failure on invoke error (Error object)", async () => {
    mockCommand("telepresence_connect", () => {
      throw new Error("Timeout");
    });
    const result = await connectTelepresence({
      kubeconfig: "",
      namespace: "",
      skipTlsVerify: false,
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain("Timeout");
  });
});

describe("telepresence - quitTelepresence", () => {
  it("returns success on successful quit", async () => {
    mockCommand("telepresence_quit", () => "Disconnected");
    const result = await quitTelepresence();
    expect(result.success).toBe(true);
    expect(result.message).toBe("Disconnected");
  });

  it("returns failure on error", async () => {
    mockCommand("telepresence_quit", () => {
      throw "Not connected";
    });
    const result = await quitTelepresence();
    expect(result.success).toBe(false);
    expect(result.message).toBe("Not connected");
  });
});

describe("telepresence - getStatus", () => {
  it("returns success with status message", async () => {
    mockCommand("telepresence_status", () => "Connected to cluster-1");
    const result = await getStatus();
    expect(result.success).toBe(true);
    expect(result.message).toBe("Connected to cluster-1");
  });

  it("returns failure when not connected", async () => {
    mockCommand("telepresence_status", () => {
      throw "Not connected";
    });
    const result = await getStatus();
    expect(result.success).toBe(false);
    expect(result.message).toBe("Not connected");
  });
});
