// modules/redis_desktop/cli/autocomplete.rs — Redis 命令自动补全
// 提供命令名称和参数的自动补全建议

/// Redis 命令定义（名称 + 简要语法）
struct CommandDef {
    name: &'static str,
    syntax: &'static str,
    group: &'static str,
}

/// 常用 Redis 命令列表
const REDIS_COMMANDS: &[CommandDef] = &[
    // ===== 通用 =====
    CommandDef { name: "PING", syntax: "PING [message]", group: "connection" },
    CommandDef { name: "ECHO", syntax: "ECHO message", group: "connection" },
    CommandDef { name: "SELECT", syntax: "SELECT index", group: "connection" },
    CommandDef { name: "INFO", syntax: "INFO [section]", group: "server" },
    CommandDef { name: "DBSIZE", syntax: "DBSIZE", group: "server" },
    CommandDef { name: "FLUSHDB", syntax: "FLUSHDB [ASYNC]", group: "server" },
    CommandDef { name: "FLUSHALL", syntax: "FLUSHALL [ASYNC]", group: "server" },
    CommandDef { name: "BGSAVE", syntax: "BGSAVE", group: "server" },
    CommandDef { name: "BGREWRITEAOF", syntax: "BGREWRITEAOF", group: "server" },
    CommandDef { name: "SAVE", syntax: "SAVE", group: "server" },
    CommandDef { name: "LASTSAVE", syntax: "LASTSAVE", group: "server" },
    CommandDef { name: "SHUTDOWN", syntax: "SHUTDOWN [NOSAVE|SAVE]", group: "server" },
    CommandDef { name: "TIME", syntax: "TIME", group: "server" },
    CommandDef { name: "CONFIG", syntax: "CONFIG GET|SET|RESETSTAT|REWRITE parameter", group: "server" },
    CommandDef { name: "CLIENT", syntax: "CLIENT LIST|SETNAME|GETNAME|KILL|ID", group: "server" },
    CommandDef { name: "SLOWLOG", syntax: "SLOWLOG GET|LEN|RESET [count]", group: "server" },
    CommandDef { name: "MONITOR", syntax: "MONITOR", group: "server" },
    CommandDef { name: "COMMAND", syntax: "COMMAND [COUNT|INFO|DOCS]", group: "server" },
    CommandDef { name: "MEMORY", syntax: "MEMORY USAGE|DOCTOR|PURGE|STATS key", group: "server" },
    CommandDef { name: "OBJECT", syntax: "OBJECT ENCODING|REFCOUNT|IDLETIME|FREQ key", group: "server" },
    CommandDef { name: "TYPE", syntax: "TYPE key", group: "generic" },
    CommandDef { name: "DEL", syntax: "DEL key [key ...]", group: "generic" },
    CommandDef { name: "UNLINK", syntax: "UNLINK key [key ...]", group: "generic" },
    CommandDef { name: "EXISTS", syntax: "EXISTS key [key ...]", group: "generic" },
    CommandDef { name: "RENAME", syntax: "RENAME key newkey", group: "generic" },
    CommandDef { name: "RENAMENX", syntax: "RENAMENX key newkey", group: "generic" },
    CommandDef { name: "EXPIRE", syntax: "EXPIRE key seconds", group: "generic" },
    CommandDef { name: "EXPIREAT", syntax: "EXPIREAT key timestamp", group: "generic" },
    CommandDef { name: "PEXPIRE", syntax: "PEXPIRE key milliseconds", group: "generic" },
    CommandDef { name: "TTL", syntax: "TTL key", group: "generic" },
    CommandDef { name: "PTTL", syntax: "PTTL key", group: "generic" },
    CommandDef { name: "PERSIST", syntax: "PERSIST key", group: "generic" },
    CommandDef { name: "KEYS", syntax: "KEYS pattern", group: "generic" },
    CommandDef { name: "SCAN", syntax: "SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]", group: "generic" },
    CommandDef { name: "RANDOMKEY", syntax: "RANDOMKEY", group: "generic" },
    CommandDef { name: "DUMP", syntax: "DUMP key", group: "generic" },
    CommandDef { name: "RESTORE", syntax: "RESTORE key ttl serialized-value [REPLACE]", group: "generic" },
    CommandDef { name: "COPY", syntax: "COPY source destination [DB destination-db] [REPLACE]", group: "generic" },
    CommandDef { name: "MOVE", syntax: "MOVE key db", group: "generic" },
    CommandDef { name: "SORT", syntax: "SORT key [BY pattern] [LIMIT offset count] [GET pattern] [ASC|DESC] [ALPHA]", group: "generic" },
    CommandDef { name: "WAIT", syntax: "WAIT numreplicas timeout", group: "generic" },
    // ===== String =====
    CommandDef { name: "GET", syntax: "GET key", group: "string" },
    CommandDef { name: "SET", syntax: "SET key value [EX seconds] [PX milliseconds] [NX|XX] [GET]", group: "string" },
    CommandDef { name: "GETSET", syntax: "GETSET key value", group: "string" },
    CommandDef { name: "GETDEL", syntax: "GETDEL key", group: "string" },
    CommandDef { name: "GETEX", syntax: "GETEX key [EX seconds|PX ms|EXAT ts|PXAT ms-timestamp|PERSIST]", group: "string" },
    CommandDef { name: "MGET", syntax: "MGET key [key ...]", group: "string" },
    CommandDef { name: "MSET", syntax: "MSET key value [key value ...]", group: "string" },
    CommandDef { name: "MSETNX", syntax: "MSETNX key value [key value ...]", group: "string" },
    CommandDef { name: "SETNX", syntax: "SETNX key value", group: "string" },
    CommandDef { name: "SETEX", syntax: "SETEX key seconds value", group: "string" },
    CommandDef { name: "PSETEX", syntax: "PSETEX key milliseconds value", group: "string" },
    CommandDef { name: "INCR", syntax: "INCR key", group: "string" },
    CommandDef { name: "INCRBY", syntax: "INCRBY key increment", group: "string" },
    CommandDef { name: "INCRBYFLOAT", syntax: "INCRBYFLOAT key increment", group: "string" },
    CommandDef { name: "DECR", syntax: "DECR key", group: "string" },
    CommandDef { name: "DECRBY", syntax: "DECRBY key decrement", group: "string" },
    CommandDef { name: "STRLEN", syntax: "STRLEN key", group: "string" },
    CommandDef { name: "APPEND", syntax: "APPEND key value", group: "string" },
    CommandDef { name: "GETRANGE", syntax: "GETRANGE key start end", group: "string" },
    CommandDef { name: "SETRANGE", syntax: "SETRANGE key offset value", group: "string" },
    // ===== Hash =====
    CommandDef { name: "HGET", syntax: "HGET key field", group: "hash" },
    CommandDef { name: "HSET", syntax: "HSET key field value [field value ...]", group: "hash" },
    CommandDef { name: "HGETALL", syntax: "HGETALL key", group: "hash" },
    CommandDef { name: "HDEL", syntax: "HDEL key field [field ...]", group: "hash" },
    CommandDef { name: "HEXISTS", syntax: "HEXISTS key field", group: "hash" },
    CommandDef { name: "HLEN", syntax: "HLEN key", group: "hash" },
    CommandDef { name: "HKEYS", syntax: "HKEYS key", group: "hash" },
    CommandDef { name: "HVALS", syntax: "HVALS key", group: "hash" },
    CommandDef { name: "HMGET", syntax: "HMGET key field [field ...]", group: "hash" },
    CommandDef { name: "HMSET", syntax: "HMSET key field value [field value ...]", group: "hash" },
    CommandDef { name: "HSETNX", syntax: "HSETNX key field value", group: "hash" },
    CommandDef { name: "HINCRBY", syntax: "HINCRBY key field increment", group: "hash" },
    CommandDef { name: "HINCRBYFLOAT", syntax: "HINCRBYFLOAT key field increment", group: "hash" },
    CommandDef { name: "HSCAN", syntax: "HSCAN key cursor [MATCH pattern] [COUNT count]", group: "hash" },
    // ===== List =====
    CommandDef { name: "LPUSH", syntax: "LPUSH key element [element ...]", group: "list" },
    CommandDef { name: "RPUSH", syntax: "RPUSH key element [element ...]", group: "list" },
    CommandDef { name: "LPOP", syntax: "LPOP key [count]", group: "list" },
    CommandDef { name: "RPOP", syntax: "RPOP key [count]", group: "list" },
    CommandDef { name: "LRANGE", syntax: "LRANGE key start stop", group: "list" },
    CommandDef { name: "LLEN", syntax: "LLEN key", group: "list" },
    CommandDef { name: "LINDEX", syntax: "LINDEX key index", group: "list" },
    CommandDef { name: "LSET", syntax: "LSET key index element", group: "list" },
    CommandDef { name: "LREM", syntax: "LREM key count element", group: "list" },
    CommandDef { name: "LTRIM", syntax: "LTRIM key start stop", group: "list" },
    CommandDef { name: "LINSERT", syntax: "LINSERT key BEFORE|AFTER pivot element", group: "list" },
    CommandDef { name: "RPOPLPUSH", syntax: "RPOPLPUSH source destination", group: "list" },
    CommandDef { name: "BLPOP", syntax: "BLPOP key [key ...] timeout", group: "list" },
    CommandDef { name: "BRPOP", syntax: "BRPOP key [key ...] timeout", group: "list" },
    // ===== Set =====
    CommandDef { name: "SADD", syntax: "SADD key member [member ...]", group: "set" },
    CommandDef { name: "SREM", syntax: "SREM key member [member ...]", group: "set" },
    CommandDef { name: "SMEMBERS", syntax: "SMEMBERS key", group: "set" },
    CommandDef { name: "SISMEMBER", syntax: "SISMEMBER key member", group: "set" },
    CommandDef { name: "SCARD", syntax: "SCARD key", group: "set" },
    CommandDef { name: "SPOP", syntax: "SPOP key [count]", group: "set" },
    CommandDef { name: "SRANDMEMBER", syntax: "SRANDMEMBER key [count]", group: "set" },
    CommandDef { name: "SSCAN", syntax: "SSCAN key cursor [MATCH pattern] [COUNT count]", group: "set" },
    CommandDef { name: "SINTER", syntax: "SINTER key [key ...]", group: "set" },
    CommandDef { name: "SUNION", syntax: "SUNION key [key ...]", group: "set" },
    CommandDef { name: "SDIFF", syntax: "SDIFF key [key ...]", group: "set" },
    CommandDef { name: "SMISMEMBER", syntax: "SMISMEMBER key member [member ...]", group: "set" },
    // ===== ZSet =====
    CommandDef { name: "ZADD", syntax: "ZADD key [NX|XX] [GT|LT] [CH] [INCR] score member [score member ...]", group: "zset" },
    CommandDef { name: "ZREM", syntax: "ZREM key member [member ...]", group: "zset" },
    CommandDef { name: "ZSCORE", syntax: "ZSCORE key member", group: "zset" },
    CommandDef { name: "ZRANK", syntax: "ZRANK key member", group: "zset" },
    CommandDef { name: "ZREVRANK", syntax: "ZREVRANK key member", group: "zset" },
    CommandDef { name: "ZRANGE", syntax: "ZRANGE key start stop [BYSCORE|BYLEX] [REV] [LIMIT offset count] [WITHSCORES]", group: "zset" },
    CommandDef { name: "ZREVRANGE", syntax: "ZREVRANGE key start stop [WITHSCORES]", group: "zset" },
    CommandDef { name: "ZRANGEBYSCORE", syntax: "ZRANGEBYSCORE key min max [WITHSCORES] [LIMIT offset count]", group: "zset" },
    CommandDef { name: "ZCARD", syntax: "ZCARD key", group: "zset" },
    CommandDef { name: "ZCOUNT", syntax: "ZCOUNT key min max", group: "zset" },
    CommandDef { name: "ZINCRBY", syntax: "ZINCRBY key increment member", group: "zset" },
    CommandDef { name: "ZSCAN", syntax: "ZSCAN key cursor [MATCH pattern] [COUNT count]", group: "zset" },
    // ===== Stream =====
    CommandDef { name: "XADD", syntax: "XADD key [NOMKSTREAM] [MAXLEN|MINID [=|~] threshold [LIMIT count]] *|ID field value [field value ...]", group: "stream" },
    CommandDef { name: "XLEN", syntax: "XLEN key", group: "stream" },
    CommandDef { name: "XRANGE", syntax: "XRANGE key start end [COUNT count]", group: "stream" },
    CommandDef { name: "XREVRANGE", syntax: "XREVRANGE key end start [COUNT count]", group: "stream" },
    CommandDef { name: "XREAD", syntax: "XREAD [COUNT count] [BLOCK milliseconds] STREAMS key [key ...] ID [ID ...]", group: "stream" },
    CommandDef { name: "XDEL", syntax: "XDEL key ID [ID ...]", group: "stream" },
    CommandDef { name: "XTRIM", syntax: "XTRIM key MAXLEN|MINID [=|~] threshold [LIMIT count]", group: "stream" },
    CommandDef { name: "XINFO", syntax: "XINFO STREAM|GROUPS|CONSUMERS|HELP key", group: "stream" },
    CommandDef { name: "XGROUP", syntax: "XGROUP CREATE key groupname ID|$ [MKSTREAM]", group: "stream" },
    CommandDef { name: "XREADGROUP", syntax: "XREADGROUP GROUP group consumer [COUNT count] [BLOCK ms] [NOACK] STREAMS key [key ...] ID [ID ...]", group: "stream" },
    CommandDef { name: "XACK", syntax: "XACK key group ID [ID ...]", group: "stream" },
    CommandDef { name: "XPENDING", syntax: "XPENDING key group [[IDLE min-idle-time] start end count [consumer]]", group: "stream" },
    // ===== Pub/Sub =====
    CommandDef { name: "PUBLISH", syntax: "PUBLISH channel message", group: "pubsub" },
    CommandDef { name: "SUBSCRIBE", syntax: "SUBSCRIBE channel [channel ...]", group: "pubsub" },
    CommandDef { name: "UNSUBSCRIBE", syntax: "UNSUBSCRIBE [channel [channel ...]]", group: "pubsub" },
    CommandDef { name: "PSUBSCRIBE", syntax: "PSUBSCRIBE pattern [pattern ...]", group: "pubsub" },
    CommandDef { name: "PUNSUBSCRIBE", syntax: "PUNSUBSCRIBE [pattern [pattern ...]]", group: "pubsub" },
    CommandDef { name: "PUBSUB", syntax: "PUBSUB CHANNELS|NUMSUB|NUMPAT [argument]", group: "pubsub" },
    // ===== Cluster =====
    CommandDef { name: "CLUSTER", syntax: "CLUSTER INFO|NODES|SLOTS|MEET|FORGET|REPLICATE|FAILOVER|RESET|SAVECONFIG|ADDSLOTS|DELSLOTS|SET-CONFIG-EPOCH|BUMPEPOCH", group: "cluster" },
    CommandDef { name: "READONLY", syntax: "READONLY", group: "cluster" },
    CommandDef { name: "READWRITE", syntax: "READWRITE", group: "cluster" },
    // ===== Sentinel =====
    CommandDef { name: "SENTINEL", syntax: "SENTINEL masters|master|slaves|sentinels|get-master-addr-by-name|reset|failover|ckquorum|flushconfig|remove|monitor|set name [args]", group: "sentinel" },
    // ===== Transaction =====
    CommandDef { name: "MULTI", syntax: "MULTI", group: "transaction" },
    CommandDef { name: "EXEC", syntax: "EXEC", group: "transaction" },
    CommandDef { name: "DISCARD", syntax: "DISCARD", group: "transaction" },
    CommandDef { name: "WATCH", syntax: "WATCH key [key ...]", group: "transaction" },
    CommandDef { name: "UNWATCH", syntax: "UNWATCH", group: "transaction" },
    // ===== Scripting =====
    CommandDef { name: "EVAL", syntax: "EVAL script numkeys key [key ...] arg [arg ...]", group: "scripting" },
    CommandDef { name: "EVALSHA", syntax: "EVALSHA sha1 numkeys key [key ...] arg [arg ...]", group: "scripting" },
    CommandDef { name: "SCRIPT", syntax: "SCRIPT LOAD|EXISTS|FLUSH|DEBUG script", group: "scripting" },
    // ===== HyperLogLog =====
    CommandDef { name: "PFADD", syntax: "PFADD key element [element ...]", group: "hyperloglog" },
    CommandDef { name: "PFCOUNT", syntax: "PFCOUNT key [key ...]", group: "hyperloglog" },
    CommandDef { name: "PFMERGE", syntax: "PFMERGE destkey sourcekey [sourcekey ...]", group: "hyperloglog" },
    // ===== Geo =====
    CommandDef { name: "GEOADD", syntax: "GEOADD key [NX|XX] longitude latitude member [longitude latitude member ...]", group: "geo" },
    CommandDef { name: "GEOPOS", syntax: "GEOPOS key member [member ...]", group: "geo" },
    CommandDef { name: "GEODIST", syntax: "GEODIST key member1 member2 [m|km|ft|mi]", group: "geo" },
    CommandDef { name: "GEORADIUS", syntax: "GEORADIUS key longitude latitude radius m|km|ft|mi [WITHCOORD] [WITHDIST] [WITHASH] [COUNT count] [ASC|DESC] [STORE key] [STOREDIST key]", group: "geo" },
    CommandDef { name: "GEOSEARCH", syntax: "GEOSEARCH key [FROMMEMBER member | FROMLONLAT longitude latitude] [BYRADIUS radius m|km|ft|mi | BYBOX width height m|km|ft|mi] [ASC|DESC] [COUNT count [ANY]] [WITHCOORD] [WITHDIST] [WITHHASH]", group: "geo" },
    // ===== Bitmap =====
    CommandDef { name: "SETBIT", syntax: "SETBIT key offset value", group: "bitmap" },
    CommandDef { name: "GETBIT", syntax: "GETBIT key offset", group: "bitmap" },
    CommandDef { name: "BITCOUNT", syntax: "BITCOUNT key [start end [BYTE|BIT]]", group: "bitmap" },
    CommandDef { name: "BITOP", syntax: "BITOP AND|OR|XOR|NOT destkey key [key ...]", group: "bitmap" },
    CommandDef { name: "BITPOS", syntax: "BITPOS key bit [start [end [BYTE|BIT]]]", group: "bitmap" },
    // ===== Bitfield =====
    CommandDef { name: "BITFIELD", syntax: "BITFIELD key [GET type offset] [SET type offset value] [INCRBY type offset increment] [OVERFLOW WRAP|SAT|FAIL]", group: "bitfield" },
];

/// 获取命令自动补全建议
/// 根据用户当前输入返回匹配的命令列表
pub fn get_completions(input: &str) -> Vec<String> {
    let input_upper = input.trim().to_uppercase();

    if input_upper.is_empty() {
        // 返回最常用的命令
        return vec![
            "GET".to_string(),
            "SET".to_string(),
            "DEL".to_string(),
            "KEYS".to_string(),
            "HGETALL".to_string(),
            "HSET".to_string(),
            "LRANGE".to_string(),
            "SMEMBERS".to_string(),
            "INFO".to_string(),
            "PING".to_string(),
        ];
    }

    // 如果包含空格，说明命令名已经输入完毕，尝试补全子命令/参数
    if input_upper.contains(' ') {
        return get_subcommand_completions(&input_upper);
    }

    // 前缀匹配命令名
    let mut matches: Vec<String> = REDIS_COMMANDS
        .iter()
        .filter(|cmd| cmd.name.starts_with(&input_upper))
        .map(|cmd| format!("{} — {}", cmd.name, cmd.syntax))
        .collect();

    matches.dedup();
    matches.sort();
    matches.truncate(20); // 最多返回 20 条
    matches
}

/// 获取子命令补全建议
fn get_subcommand_completions(input: &str) -> Vec<String> {
    let parts: Vec<&str> = input.split_whitespace().collect();
    if parts.is_empty() {
        return Vec::new();
    }

    let cmd_name = parts[0];
    let last_part = parts.last().unwrap_or(&"");

    // 特殊命令的子命令补全
    match cmd_name {
        "CONFIG" => {
            let subs = ["GET", "SET", "RESETSTAT", "REWRITE"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "CLIENT" => {
            let subs = ["LIST", "SETNAME", "GETNAME", "KILL", "ID", "INFO", "PAUSE", "UNPAUSE", "UNBLOCK"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "SLOWLOG" => {
            let subs = ["GET", "LEN", "RESET"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "MEMORY" => {
            let subs = ["USAGE", "DOCTOR", "PURGE", "STATS", "MALLOC-STATS"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "OBJECT" => {
            let subs = ["ENCODING", "REFCOUNT", "IDLETIME", "FREQ"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "XINFO" => {
            let subs = ["STREAM", "GROUPS", "CONSUMERS", "HELP"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "XGROUP" => {
            let subs = ["CREATE", "DESTROY", "SETID", "DELCONSUMER", "CREATECONSUMER"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "CLUSTER" => {
            let subs = ["INFO", "NODES", "SLOTS", "MEET", "FORGET", "REPLICATE", "FAILOVER", "RESET", "SAVECONFIG", "ADDSLOTS", "DELSLOTS"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "SENTINEL" => {
            let subs = ["MASTERS", "MASTER", "SLAVES", "SENTINELS", "GET-MASTER-ADDR-BY-NAME", "RESET", "FAILOVER", "FLUSHCONFIG", "REMOVE", "MONITOR", "SET"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "SCRIPT" => {
            let subs = ["LOAD", "EXISTS", "FLUSH", "DEBUG"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        "PUBSUB" => {
            let subs = ["CHANNELS", "NUMSUB", "NUMPAT"];
            return subs.iter()
                .filter(|s| s.starts_with(last_part))
                .map(|s| format!("{} {}", cmd_name, s))
                .collect();
        }
        _ => {}
    }

    Vec::new()
}

/// 获取命令语法提示
pub fn get_command_syntax(command: &str) -> Option<&'static str> {
    let cmd_upper = command.to_uppercase();
    REDIS_COMMANDS
        .iter()
        .find(|cmd| cmd.name == cmd_upper)
        .map(|cmd| cmd.syntax)
}

/// 获取所有命令名称列表
pub fn get_all_command_names() -> Vec<&'static str> {
    REDIS_COMMANDS.iter().map(|cmd| cmd.name).collect()
}

/// 获取指定分组的命令列表
pub fn get_commands_by_group(group: &str) -> Vec<&'static str> {
    REDIS_COMMANDS
        .iter()
        .filter(|cmd| cmd.group == group)
        .map(|cmd| cmd.name)
        .collect()
}
