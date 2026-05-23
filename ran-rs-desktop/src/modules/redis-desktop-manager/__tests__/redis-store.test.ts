import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// Mock Tauri invoke
const handlers = new Map<string, (...args: unknown[]) => unknown>();
function mockCommand(cmd: string, handler: (...args: unknown[]) => unknown) {
  handlers.set(cmd, handler);
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    const handler = handlers.get(cmd);
    if (!handler) return Promise.reject(new Error(`Unknown command: ${cmd}`));
    return Promise.resolve(handler(args));
  },
}));

// Mock useModuleBus
vi.mock("../../../_shared/use-module-bus", () => ({
  useModuleBus: () => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  }),
}));

import { useRedisStore } from "../stores/redis-store";

beforeEach(() => {
  setActivePinia(createPinia());
  handlers.clear();
});

// Helper: create a minimal connection config
function makeConfig(id = "c1", name = "Test", db = 0) {
  return {
    id,
    name,
    host: "127.0.0.1",
    port: 6379,
    db,
    cluster: false,
    sentinel: undefined,
    sshTunnel: undefined,
    tls: undefined,
    readonly: false,
    separator: ":",
  } as any;
}

describe("redis-store - tab management", () => {
  it("openStatusTab creates a new status tab", () => {
    const store = useRedisStore();
    store.connections = [makeConfig()];
    store.openStatusTab("c1", 0);
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0].type).toBe("status");
    expect(store.tabs[0].connectionId).toBe("c1");
    expect(store.tabs[0].closable).toBe(false);
    expect(store.activeTabId).toContain("status");
  });

  it("openStatusTab does not duplicate existing tab", () => {
    const store = useRedisStore();
    store.connections = [makeConfig()];
    store.openStatusTab("c1", 0);
    store.openStatusTab("c1", 0);
    expect(store.tabs).toHaveLength(1);
  });

  it("openCliTab creates a closable CLI tab", () => {
    const store = useRedisStore();
    store.openCliTab("c1", 0);
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0].type).toBe("cli");
    expect(store.tabs[0].closable).toBe(true);
  });

  it("openKeyDetailTab creates a key detail tab", () => {
    const store = useRedisStore();
    mockCommand("redis_key_detail", () => ({ key: "mykey", type: "string", ttl: -1 }));
    store.openKeyDetailTab("c1", 0, "mykey");
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0].type).toBe("key-detail");
    expect(store.tabs[0].key).toBe("mykey");
    expect(store.tabs[0].closable).toBe(true);
  });

  it("openSlowLogTab creates a slow log tab", () => {
    const store = useRedisStore();
    store.openSlowLogTab("c1", 0);
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0].type).toBe("slow-log");
  });

  it("openCommandLogTab creates a command log tab", () => {
    const store = useRedisStore();
    store.openCommandLogTab("c1", 0);
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0].type).toBe("command-log");
  });

  it("closeTab removes tab and updates activeTabId", () => {
    const store = useRedisStore();
    store.openCliTab("c1", 0);
    store.openSlowLogTab("c1", 0);
    expect(store.tabs).toHaveLength(2);
    const cliTabId = store.tabs[0].id;
    store.activeTabId = cliTabId;
    store.closeTab(cliTabId);
    expect(store.tabs).toHaveLength(1);
    expect(store.activeTabId).not.toBe(cliTabId);
  });

  it("closeTab on last tab clears activeTabId", () => {
    const store = useRedisStore();
    store.openCliTab("c1", 0);
    const tabId = store.tabs[0].id;
    store.activeTabId = tabId;
    store.closeTab(tabId);
    expect(store.tabs).toHaveLength(0);
    expect(store.activeTabId).toBe("");
  });

  it("closeOtherTabs keeps target and non-closable tabs", () => {
    const store = useRedisStore();
    store.connections = [makeConfig()];
    store.openStatusTab("c1", 0); // not closable
    store.openCliTab("c1", 0);    // closable
    store.openSlowLogTab("c1", 0); // closable
    expect(store.tabs).toHaveLength(3);
    const cliTabId = store.tabs[1].id;
    store.closeOtherTabs(cliTabId);
    // status tab is not closable, so it stays + the target tab
    expect(store.tabs).toHaveLength(2);
    expect(store.tabs.some(t => t.id === cliTabId)).toBe(true);
  });
});

describe("redis-store - DB operations", () => {
  it("switchDb resets key state and opens status tab", () => {
    const store = useRedisStore();
    store.connections = [makeConfig()];
    store.activeConnectionId = "c1";
    store.keys = [{ key: "old", keyType: "string", ttl: -1 }];
    store.selectedKey = "old";
    store.openStatusTab("c1", 0);

    store.switchDb(2);
    expect(store.activeDb).toBe(2);
    expect(store.keys).toHaveLength(0);
    expect(store.selectedKey).toBe("");
    expect(store.keyDetail).toBeNull();
  });

  it("getConnectionActiveDb returns saved db", () => {
    const store = useRedisStore();
    store.activeConnectionId = "c1";
    store.switchDb(5);
    expect(store.getConnectionActiveDb("c1")).toBe(5);
  });

  it("getConnectionActiveDb returns config default when not set", () => {
    const store = useRedisStore();
    store.connections = [makeConfig("c1", "Test", 3)];
    expect(store.getConnectionActiveDb("c1")).toBe(3);
  });

  it("getConnectionActiveDb returns 0 when no config", () => {
    const store = useRedisStore();
    expect(store.getConnectionActiveDb("unknown")).toBe(0);
  });
});

describe("redis-store - computed properties", () => {
  it("activeConnection returns current connection config", () => {
    const store = useRedisStore();
    const config = makeConfig();
    store.connections = [config];
    store.activeConnectionId = "c1";
    expect(store.activeConnection).toEqual(config);
  });

  it("activeConnection returns undefined when not set", () => {
    const store = useRedisStore();
    store.connections = [makeConfig()];
    store.activeConnectionId = "";
    expect(store.activeConnection).toBeUndefined();
  });

  it("connectionList merges configs with status", () => {
    const store = useRedisStore();
    store.connections = [makeConfig()];
    const list = store.connectionList;
    expect(list).toHaveLength(1);
    expect(list[0].config.id).toBe("c1");
    expect(list[0].status).toBe("disconnected");
  });

  it("activeTab returns current tab", () => {
    const store = useRedisStore();
    store.openCliTab("c1", 0);
    store.activeTabId = store.tabs[0].id;
    expect(store.activeTab).toBeDefined();
    expect(store.activeTab!.type).toBe("cli");
  });
});

describe("redis-store - handleScanProgress", () => {
  it("appends new keys from scan event", () => {
    const store = useRedisStore();
    store.currentScanId = "scan-1";
    store.scanState.scanning = true; // normally set by startScan()
    store.handleScanProgress({
      keys: ["key1", "key2"],
      batchCount: 2,
      totalScanned: 2,
      done: false,
      scanId: "scan-1",
    });
    expect(store.keys).toHaveLength(2);
    expect(store.keys[0].key).toBe("key1");
    expect(store.scanState.scanning).toBe(true);
    expect(store.scanState.progress).toBe(2);
  });

  it("ignores events for different scanId", () => {
    const store = useRedisStore();
    store.currentScanId = "scan-1";
    store.handleScanProgress({
      keys: ["key1"],
      batchCount: 1,
      totalScanned: 1,
      done: false,
      scanId: "scan-2",
    });
    expect(store.keys).toHaveLength(0);
  });

  it("marks scanning as done when event.done is true", () => {
    const store = useRedisStore();
    store.currentScanId = "scan-1";
    store.handleScanProgress({
      keys: [],
      batchCount: 0,
      totalScanned: 10,
      done: true,
      scanId: "scan-1",
    });
    expect(store.scanState.scanning).toBe(false);
    expect(store.scanState.total).toBe(10);
    expect(store.currentScanId).toBe("");
  });

  it("ignores events when no active scan", () => {
    const store = useRedisStore();
    store.currentScanId = "";
    store.handleScanProgress({
      keys: ["key1"],
      batchCount: 1,
      totalScanned: 1,
      done: false,
    });
    expect(store.keys).toHaveLength(0);
  });
});

describe("redis-store - saveConnection", () => {
  it("adds new connection", async () => {
    mockCommand("redis_storage_save_connection", () => {});
    const store = useRedisStore();
    await store.saveConnection(makeConfig());
    expect(store.connections).toHaveLength(1);
  });

  it("updates existing connection", async () => {
    mockCommand("redis_storage_save_connection", () => {});
    const store = useRedisStore();
    await store.saveConnection(makeConfig());
    await store.saveConnection(makeConfig("c1", "Updated"));
    expect(store.connections).toHaveLength(1);
    expect(store.connections[0].name).toBe("Updated");
  });
});

describe("redis-store - deleteConnection", () => {
  it("removes connection from list", async () => {
    mockCommand("redis_storage_delete_connection", () => {});
    const store = useRedisStore();
    store.connections = [makeConfig()];
    await store.deleteConnection("c1");
    expect(store.connections).toHaveLength(0);
  });

  it("clears active state when deleting active connection", async () => {
    mockCommand("redis_storage_delete_connection", () => {});
    const store = useRedisStore();
    store.connections = [makeConfig()];
    store.activeConnectionId = "c1";
    store.keys = [{ key: "k1", keyType: "string", ttl: -1 }];
    await store.deleteConnection("c1");
    expect(store.activeConnectionId).toBe("");
    expect(store.keys).toHaveLength(0);
    expect(store.tabs).toHaveLength(0);
  });
});

describe("redis-store - connect", () => {
  it("sets connection status to connected on success", async () => {
    mockCommand("redis_connection_create", () => {});
    mockCommand("redis_key_scan_start", () => {});
    mockCommand("redis_tool_database_list", () => []);
    mockCommand("redis_tool_database_count", () => 16);
    const store = useRedisStore();
    store.connections = [makeConfig()];
    await store.connect(makeConfig());
    expect(store.activeConnectionId).toBe("c1");
    const info = store.connectionInfos.get("c1");
    expect(info?.status).toBe("connected");
  });

  it("sets connection status to error on failure", async () => {
    mockCommand("redis_connection_create", () => {
      throw new Error("Connection refused");
    });
    const store = useRedisStore();
    store.connections = [makeConfig()];
    await expect(store.connect(makeConfig())).rejects.toThrow("Connection refused");
    const info = store.connectionInfos.get("c1");
    expect(info?.status).toBe("error");
  });
});

describe("redis-store - disconnect", () => {
  it("clears connection state on disconnect", async () => {
    mockCommand("redis_connection_close", () => {});
    const store = useRedisStore();
    store.activeConnectionId = "c1";
    store.activeDb = 0;
    store.keys = [{ key: "k1", keyType: "string", ttl: -1 }];
    store.selectedKey = "k1";
    store.connectionInfos.set("c1", {
      id: "c1", name: "Test", host: "127.0.0.1", port: 6379, db: 0,
      status: "connected" as any,
    });
    await store.disconnect("c1");
    expect(store.activeConnectionId).toBe("");
    expect(store.keys).toHaveLength(0);
    expect(store.selectedKey).toBe("");
    expect(store.keyDetail).toBeNull();
    const info = store.connectionInfos.get("c1");
    expect(info?.status).toBe("disconnected");
  });
});

describe("redis-store - key operations", () => {
  it("deleteKeys removes keys from list", async () => {
    mockCommand("redis_key_delete", () => 1);
    const store = useRedisStore();
    store.activeConnectionId = "c1";
    store.activeDb = 0;
    store.keys = [
      { key: "k1", keyType: "string", ttl: -1 },
      { key: "k2", keyType: "string", ttl: -1 },
    ];
    await store.deleteKeys(["k1"]);
    expect(store.keys).toHaveLength(1);
    expect(store.keys[0].key).toBe("k2");
  });

  it("deleteKeys clears selectedKey if deleted", async () => {
    mockCommand("redis_key_delete", () => 1);
    const store = useRedisStore();
    store.activeConnectionId = "c1";
    store.activeDb = 0;
    store.keys = [{ key: "k1", keyType: "string", ttl: -1 }];
    store.selectedKey = "k1";
    store.keyDetail = { key: "k1", type: "string", ttl: -1 } as any;
    await store.deleteKeys(["k1"]);
    expect(store.selectedKey).toBe("");
    expect(store.keyDetail).toBeNull();
  });

  it("renameKey updates key name in list", async () => {
    mockCommand("redis_key_rename", () => {});
    const store = useRedisStore();
    store.activeConnectionId = "c1";
    store.activeDb = 0;
    store.keys = [{ key: "old", keyType: "string", ttl: -1 }];
    store.selectedKey = "old";
    await store.renameKey("old", "new");
    expect(store.keys[0].key).toBe("new");
    expect(store.selectedKey).toBe("new");
  });

  it("setExpire updates keyDetail ttl", async () => {
    mockCommand("redis_key_expire", () => {});
    const store = useRedisStore();
    store.activeConnectionId = "c1";
    store.activeDb = 0;
    store.keyDetail = { key: "k1", type: "string", ttl: -1 } as any;
    await store.setExpire("k1", 60);
    expect(store.keyDetail!.ttl).toBe(60);
  });
});
