import { beforeEach, describe, expect, it, vi } from "vitest";

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
    if (!handler) {
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    }
    return Promise.resolve(handler(args));
  },
}));

const {
  redisConnectionCreate,
  redisConnectionClose,
  redisConnectionCloseAll,
  redisConnectionStatus,
  redisConnectionList,
  redisConnectionPing,
  redisStorageLoadConnections,
  redisStorageSaveConnections,
  redisStorageSaveConnection,
  redisStorageDeleteConnection,
  redisStorageLoadSettings,
  redisStorageSaveSettings,
  redisStorageLoadCliHistory,
  redisStorageSaveCliHistory,
  redisKeyScan,
  redisKeyScanStart,
  redisKeyScanCancel,
  redisKeyDetail,
  redisKeyDelete,
  redisKeyRename,
  redisKeyExpire,
  redisDataStringGet,
  redisDataStringSet,
  redisDataHashPage,
  redisDataHashAdd,
  redisDataSetAdd,
  redisDataZsetPage,
  redisDataStreamAdd,
  redisDataStreamGroups,
  redisCliExec,
  redisCliComplete,
  redisCliSyntax,
  redisCliCommands,
  redisCliCommandsByGroup,
  redisToolSlowLog,
  redisToolServerStatus,
  redisToolDatabaseList,
  redisToolDatabaseCount,
  redisToolFlushDb,
  redisToolFlushAll,
} = await import("../services/redis-commands");

beforeEach(() => {
  clearMockCommands();
});

// ==================== 连接管理 ====================
describe("redis-commands - connection", () => {
  it("redisConnectionCreate invokes correct command", async () => {
    mockCommand("redis_connection_create", (args) => {
      expect(args?.config).toEqual({ id: "c1" });
    });
    await redisConnectionCreate({ id: "c1" } as any);
  });

  it("redisConnectionClose passes connectionId", async () => {
    mockCommand("redis_connection_close", (args) => {
      expect(args?.connectionId).toBe("c1");
    });
    await redisConnectionClose("c1");
  });

  it("redisConnectionCloseAll invokes with no args", async () => {
    mockCommand("redis_connection_close_all", () => {});
    await redisConnectionCloseAll();
  });

  it("redisConnectionStatus returns string", async () => {
    mockCommand("redis_connection_status", () => "connected");
    const status = await redisConnectionStatus("c1");
    expect(status).toBe("connected");
  });

  it("redisConnectionList returns string array", async () => {
    mockCommand("redis_connection_list", () => ["c1", "c2"]);
    const list = await redisConnectionList();
    expect(list).toEqual(["c1", "c2"]);
  });

  it("redisConnectionPing returns pong", async () => {
    mockCommand("redis_connection_ping", () => "PONG");
    const result = await redisConnectionPing("c1");
    expect(result).toBe("PONG");
  });
});

// ==================== 存储 ====================
describe("redis-commands - storage", () => {
  it("redisStorageLoadConnections returns array", async () => {
    mockCommand("redis_storage_load_connections", () => []);
    const result = await redisStorageLoadConnections();
    expect(result).toEqual([]);
  });

  it("redisStorageSaveConnections passes connections", async () => {
    const conns = [{ id: "c1" }];
    mockCommand("redis_storage_save_connections", (args) => {
      expect(args?.connections).toEqual(conns);
    });
    await redisStorageSaveConnections(conns as any);
  });

  it("redisStorageSaveConnection wraps as config", async () => {
    const conn = { id: "c1" };
    mockCommand("redis_storage_save_connection", (args) => {
      expect(args?.config).toEqual(conn);
    });
    await redisStorageSaveConnection(conn as any);
  });

  it("redisStorageDeleteConnection passes id as connectionId", async () => {
    mockCommand("redis_storage_delete_connection", (args) => {
      expect(args?.connectionId).toBe("c1");
    });
    await redisStorageDeleteConnection("c1");
  });

  it("redisStorageLoadSettings returns settings", async () => {
    mockCommand("redis_storage_load_settings", () => ({ theme: "dark" }));
    const result = await redisStorageLoadSettings();
    expect(result).toEqual({ theme: "dark" });
  });

  it("redisStorageSaveSettings passes settings", async () => {
    const settings = { theme: "light" };
    mockCommand("redis_storage_save_settings", (args) => {
      expect(args?.settings).toEqual(settings);
    });
    await redisStorageSaveSettings(settings as any);
  });

  it("redisStorageLoadCliHistory returns array", async () => {
    mockCommand("redis_storage_load_cli_history", () => ["GET key"]);
    const result = await redisStorageLoadCliHistory();
    expect(result).toEqual(["GET key"]);
  });

  it("redisStorageSaveCliHistory passes history", async () => {
    const history = ["SET key val"];
    mockCommand("redis_storage_save_cli_history", (args) => {
      expect(args?.history).toEqual(history);
    });
    await redisStorageSaveCliHistory(history);
  });
});

// ==================== Key 操作 ====================
describe("redis-commands - key operations", () => {
  it("redisKeyScan passes params", async () => {
    const params = { connectionId: "c1", db: 0, pattern: "*" };
    mockCommand("redis_key_scan", (args) => {
      expect(args?.params).toEqual(params);
      return [];
    });
    await redisKeyScan(params as any);
  });

  it("redisKeyScanStart wraps params correctly", async () => {
    mockCommand("redis_key_scan_start", (args) => {
      expect(args?.params).toEqual({
        connectionId: "c1",
        db: 0,
        scanId: "s1",
        pattern: "user:*",
        count: 100,
      });
    });
    await redisKeyScanStart("c1", 0, "s1", "user:*", 100);
  });

  it("redisKeyScanCancel wraps scanId", async () => {
    mockCommand("redis_key_scan_cancel", (args) => {
      expect(args?.params).toEqual({ scanId: "s1" });
    });
    await redisKeyScanCancel("s1");
  });

  it("redisKeyDetail passes all params", async () => {
    mockCommand("redis_key_detail", (args) => {
      expect(args).toEqual({ connectionId: "c1", db: 0, key: "mykey" });
      return { key: "mykey", type: "string", ttl: -1 };
    });
    const result = await redisKeyDetail("c1", 0, "mykey");
    expect(result.key).toBe("mykey");
  });

  it("redisKeyDelete passes keys array", async () => {
    mockCommand("redis_key_delete", (args) => {
      expect(args?.keys).toEqual(["k1", "k2"]);
      return 2;
    });
    const count = await redisKeyDelete("c1", 0, ["k1", "k2"]);
    expect(count).toBe(2);
  });

  it("redisKeyRename passes old and new key", async () => {
    mockCommand("redis_key_rename", (args) => {
      expect(args).toEqual({ connectionId: "c1", db: 0, oldKey: "a", newKey: "b" });
    });
    await redisKeyRename("c1", 0, "a", "b");
  });

  it("redisKeyExpire passes seconds", async () => {
    mockCommand("redis_key_expire", (args) => {
      expect(args).toEqual({ connectionId: "c1", db: 0, key: "k", seconds: 60 });
    });
    await redisKeyExpire("c1", 0, "k", 60);
  });
});

// ==================== 数据操作 ====================
describe("redis-commands - data operations", () => {
  it("redisDataStringGet passes params", async () => {
    mockCommand("redis_data_string_get", (args) => {
      expect(args).toEqual({ connectionId: "c1", db: 0, key: "k" });
      return { value: "hello" };
    });
    const result = await redisDataStringGet("c1", 0, "k");
    expect(result.value).toBe("hello");
  });

  it("redisDataStringSet passes value and optional ttl", async () => {
    mockCommand("redis_data_string_set", (args) => {
      expect(args).toEqual({ connectionId: "c1", db: 0, key: "k", value: "v", ttl: 60 });
    });
    await redisDataStringSet("c1", 0, "k", "v", 60);
  });

  it("redisDataHashPage passes params", async () => {
    mockCommand("redis_data_hash_page", (args) => {
      expect(args?.params).toEqual({ connectionId: "c1" });
      return { items: [], total: 0 };
    });
    await redisDataHashPage({ connectionId: "c1" } as any);
  });

  it("redisDataHashAdd passes params", async () => {
    mockCommand("redis_data_hash_add", (args) => {
      expect(args?.params).toEqual({ key: "k" });
    });
    await redisDataHashAdd({ key: "k" } as any);
  });

  it("redisDataSetAdd passes params", async () => {
    mockCommand("redis_data_set_add", (args) => {
      expect(args?.params).toEqual({ key: "k" });
      return 1;
    });
    const result = await redisDataSetAdd({ key: "k" } as any);
    expect(result).toBe(1);
  });

  it("redisDataZsetPage passes params", async () => {
    mockCommand("redis_data_zset_page", (args) => {
      expect(args?.params).toEqual({ key: "k" });
      return { items: [], total: 0 };
    });
    await redisDataZsetPage({ key: "k" } as any);
  });

  it("redisDataStreamAdd passes fields and optional id", async () => {
    mockCommand("redis_data_stream_add", (args) => {
      expect(args).toEqual({
        connectionId: "c1",
        db: 0,
        key: "stream",
        fields: [["f1", "v1"]],
        id: "0-1",
      });
      return "1234567890-0";
    });
    const result = await redisDataStreamAdd("c1", 0, "stream", [["f1", "v1"]], "0-1");
    expect(result).toBe("1234567890-0");
  });

  it("redisDataStreamGroups passes params", async () => {
    mockCommand("redis_data_stream_groups", (args) => {
      expect(args).toEqual({ connectionId: "c1", db: 0, key: "s" });
      return [];
    });
    await redisDataStreamGroups("c1", 0, "s");
  });
});

// ==================== CLI ====================
describe("redis-commands - CLI", () => {
  it("redisCliExec wraps params", async () => {
    mockCommand("redis_cli_exec", (args) => {
      expect(args?.params).toEqual({ connectionId: "c1", db: 0, command: "PING" });
      return { output: "PONG", type: "simple" };
    });
    const result = await redisCliExec("c1", 0, "PING");
    expect(result.output).toBe("PONG");
  });

  it("redisCliComplete passes connectionId and input", async () => {
    mockCommand("redis_cli_complete", (args) => {
      expect(args).toEqual({ connectionId: "c1", input: "GET" });
      return ["GET", "GETSET"];
    });
    const result = await redisCliComplete("c1", "GET");
    expect(result).toEqual(["GET", "GETSET"]);
  });

  it("redisCliSyntax passes commandName", async () => {
    mockCommand("redis_cli_syntax", (args) => {
      expect(args?.commandName).toBe("GET");
      return "GET key";
    });
    const result = await redisCliSyntax("GET");
    expect(result).toBe("GET key");
  });

  it("redisCliSyntax returns null for unknown", async () => {
    mockCommand("redis_cli_syntax", () => null);
    const result = await redisCliSyntax("UNKNOWN");
    expect(result).toBeNull();
  });

  it("redisCliCommands returns array", async () => {
    mockCommand("redis_cli_commands", () => [{ name: "GET", group: "string" }]);
    const result = await redisCliCommands();
    expect(result).toHaveLength(1);
  });

  it("redisCliCommandsByGroup returns record", async () => {
    mockCommand("redis_cli_commands_by_group", () => ({ string: [{ name: "GET" }] }));
    const result = await redisCliCommandsByGroup();
    expect(result.string).toHaveLength(1);
  });
});

// ==================== 工具 ====================
describe("redis-commands - tools", () => {
  it("redisToolSlowLog passes params", async () => {
    mockCommand("redis_tool_slow_log", (args) => {
      expect(args).toEqual({ connectionId: "c1", db: 0, count: 10 });
      return [];
    });
    await redisToolSlowLog("c1", 0, 10);
  });

  it("redisToolServerStatus passes connectionId", async () => {
    mockCommand("redis_tool_server_status", (args) => {
      expect(args?.connectionId).toBe("c1");
      return { version: "7.0", uptime: 3600 };
    });
    const result = await redisToolServerStatus("c1");
    expect(result.version).toBe("7.0");
  });

  it("redisToolDatabaseList returns array", async () => {
    mockCommand("redis_tool_database_list", () => [{ db: 0, keys: 5 }]);
    const result = await redisToolDatabaseList("c1");
    expect(result).toHaveLength(1);
  });

  it("redisToolDatabaseCount returns number", async () => {
    mockCommand("redis_tool_database_count", () => 16);
    const result = await redisToolDatabaseCount("c1");
    expect(result).toBe(16);
  });

  it("redisToolFlushDb passes params", async () => {
    mockCommand("redis_tool_flush_db", (args) => {
      expect(args).toEqual({ connectionId: "c1", db: 0 });
    });
    await redisToolFlushDb("c1", 0);
  });

  it("redisToolFlushAll passes connectionId", async () => {
    mockCommand("redis_tool_flush_all", (args) => {
      expect(args?.connectionId).toBe("c1");
    });
    await redisToolFlushAll("c1");
  });

  it("rejects when command has no handler", async () => {
    await expect(redisConnectionPing("c1")).rejects.toThrow("Unknown command: redis_connection_ping");
  });
});
