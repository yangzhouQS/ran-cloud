//! Redis CLI 自动补全测试
use ran_rs_desktop_lib::modules::redis_desktop::cli::autocomplete::{
    get_all_command_names, get_command_syntax, get_commands_by_group, get_completions,
};

#[test]
fn get_completions_empty_input() {
    let result = get_completions("");
    assert_eq!(result.len(), 10);
    assert!(result[0].starts_with("GET"));
}

#[test]
fn get_completions_whitespace_only() {
    let result = get_completions("   ");
    assert_eq!(result.len(), 10);
}

#[test]
fn get_completions_prefix_ge() {
    let result = get_completions("GE");
    let names: Vec<&str> = result.iter().map(|s| s.split(" — ").next().unwrap()).collect();
    assert!(names.iter().any(|n| *n == "GET"));
    assert!(names.iter().any(|n| *n == "GETSET"));
    assert!(names.iter().any(|n| *n == "GETDEL"));
    assert!(names.iter().any(|n| *n == "GETEX"));
    assert!(names.iter().any(|n| *n == "GEOADD"));
}

#[test]
fn get_completions_prefix_h() {
    let result = get_completions("H");
    let names: Vec<&str> = result.iter().map(|s| s.split(" — ").next().unwrap()).collect();
    assert!(names.iter().any(|n| *n == "HGET"));
    assert!(names.iter().any(|n| *n == "HSET"));
    assert!(names.iter().any(|n| *n == "HGETALL"));
}

#[test]
fn get_completions_prefix_z() {
    let result = get_completions("Z");
    let names: Vec<&str> = result.iter().map(|s| s.split(" — ").next().unwrap()).collect();
    assert!(names.iter().any(|n| *n == "ZADD"));
    assert!(names.iter().any(|n| *n == "ZREM"));
    assert!(names.iter().any(|n| *n == "ZRANGE"));
}

#[test]
fn get_completions_case_insensitive() {
    let upper = get_completions("GET");
    let lower = get_completions("get");
    let names_upper: Vec<&str> = upper.iter().map(|s| s.split(" — ").next().unwrap()).collect();
    let names_lower: Vec<&str> = lower.iter().map(|s| s.split(" — ").next().unwrap()).collect();
    assert_eq!(names_upper, names_lower);
}

#[test]
fn get_completions_exact_match() {
    let result = get_completions("SET");
    let names: Vec<&str> = result.iter().map(|s| s.split(" — ").next().unwrap()).collect();
    assert!(names.contains(&"SET"));
}

#[test]
fn get_completions_max_20() {
    // Most commands start with letters — verify truncation
    let result = get_completions("S");
    assert!(result.len() <= 20);
}

// ---- 子命令补全 ----

#[test]
fn get_completions_config_subcommands() {
    // "CONFIG " trims to "CONFIG" (no space). Use sub-prefix to trigger:
    let get = get_completions("CONFIG GE");
    assert!(get.iter().any(|s| s == "CONFIG GET"));
    let set = get_completions("CONFIG SE");
    assert!(set.iter().any(|s| s == "CONFIG SET"));
    let reset = get_completions("CONFIG R");
    assert!(reset.iter().any(|s| s == "CONFIG RESETSTAT"));
    assert!(reset.iter().any(|s| s == "CONFIG REWRITE"));
}

#[test]
fn get_completions_client_subcommands() {
    let result = get_completions("CLIENT LI");
    assert!(result.iter().any(|s| s == "CLIENT LIST"));
    let kill = get_completions("CLIENT KI");
    assert!(kill.iter().any(|s| s == "CLIENT KILL"));
}

#[test]
fn get_completions_slowlog_subcommands() {
    let get = get_completions("SLOWLOG GE");
    assert!(get.iter().any(|s| s == "SLOWLOG GET"));
    let len = get_completions("SLOWLOG LE");
    assert!(len.iter().any(|s| s == "SLOWLOG LEN"));
    let reset = get_completions("SLOWLOG RE");
    assert!(reset.iter().any(|s| s == "SLOWLOG RESET"));
}

#[test]
fn get_completions_memory_subcommands() {
    let result = get_completions("MEMORY US");
    assert!(result.iter().any(|s| s == "MEMORY USAGE"));
    let doc = get_completions("MEMORY DO");
    assert!(doc.iter().any(|s| s == "MEMORY DOCTOR"));
}

#[test]
fn get_completions_object_subcommands() {
    let result = get_completions("OBJECT EN");
    assert!(result.iter().any(|s| s == "OBJECT ENCODING"));
    let refcount = get_completions("OBJECT RE");
    assert!(refcount.iter().any(|s| s == "OBJECT REFCOUNT"));
}

#[test]
fn get_completions_xinfo_subcommands() {
    let result = get_completions("XINFO ST");
    assert!(result.iter().any(|s| s == "XINFO STREAM"));
    let groups = get_completions("XINFO GR");
    assert!(groups.iter().any(|s| s == "XINFO GROUPS"));
}

#[test]
fn get_completions_xgroup_subcommands() {
    let result = get_completions("XGROUP CR");
    assert!(result.iter().any(|s| s == "XGROUP CREATE"));
    let destroy = get_completions("XGROUP DE");
    assert!(destroy.iter().any(|s| s == "XGROUP DESTROY"));
}

#[test]
fn get_completions_cluster_subcommands() {
    let result = get_completions("CLUSTER IN");
    assert!(result.iter().any(|s| s == "CLUSTER INFO"));
    let nodes = get_completions("CLUSTER NO");
    assert!(nodes.iter().any(|s| s == "CLUSTER NODES"));
}

#[test]
fn get_completions_sentinel_subcommands() {
    let result = get_completions("SENTINEL MA");
    assert!(result.iter().any(|s| s == "SENTINEL MASTERS"));
}

#[test]
fn get_completions_script_subcommands() {
    let result = get_completions("SCRIPT LO");
    assert!(result.iter().any(|s| s == "SCRIPT LOAD"));
    let exists = get_completions("SCRIPT EX");
    assert!(exists.iter().any(|s| s == "SCRIPT EXISTS"));
}

#[test]
fn get_completions_config_prefix_filter() {
    let result = get_completions("CONFIG G");
    assert!(result.iter().any(|s| s == "CONFIG GET"));
    // SET should not match "G" prefix
    assert!(!result.iter().any(|s| s == "CONFIG SET"));
}

#[test]
fn get_completions_unknown_command_with_space() {
    let result = get_completions("UNKNOWN ");
    assert!(result.is_empty());
}

// ---- get_command_syntax ----

#[test]
fn get_command_syntax_known() {
    assert_eq!(get_command_syntax("GET"), Some("GET key"));
    assert_eq!(get_command_syntax("SET"), Some("SET key value [EX seconds] [PX milliseconds] [NX|XX] [GET]"));
    assert_eq!(get_command_syntax("HGETALL"), Some("HGETALL key"));
}

#[test]
fn get_command_syntax_unknown() {
    assert_eq!(get_command_syntax("NONEXISTENT"), None);
}

#[test]
fn get_command_syntax_case_insensitive() {
    assert!(get_command_syntax("get").is_some());
    assert!(get_command_syntax("Get").is_some());
}

// ---- get_all_command_names ----

#[test]
fn get_all_command_names_count() {
    let names = get_all_command_names();
    assert!(names.len() >= 120, "Expected at least 120 commands, got {}", names.len());
}

#[test]
fn get_all_command_names_contains_basic() {
    let names = get_all_command_names();
    assert!(names.contains(&"GET"));
    assert!(names.contains(&"SET"));
    assert!(names.contains(&"DEL"));
    assert!(names.contains(&"PING"));
}

// ---- get_commands_by_group ----

#[test]
fn get_commands_by_group_string() {
    let cmds = get_commands_by_group("string");
    assert!(cmds.contains(&"GET"));
    assert!(cmds.contains(&"SET"));
    assert!(cmds.contains(&"INCR"));
    assert!(!cmds.contains(&"HGET")); // hash, not string
}

#[test]
fn get_commands_by_group_hash() {
    let cmds = get_commands_by_group("hash");
    assert!(cmds.contains(&"HGET"));
    assert!(cmds.contains(&"HSET"));
    assert!(cmds.contains(&"HGETALL"));
}

#[test]
fn get_commands_by_group_list() {
    let cmds = get_commands_by_group("list");
    assert!(cmds.contains(&"LPUSH"));
    assert!(cmds.contains(&"RPUSH"));
    assert!(cmds.contains(&"LRANGE"));
}

#[test]
fn get_commands_by_group_unknown() {
    let cmds = get_commands_by_group("nonexistent");
    assert!(cmds.is_empty());
}
