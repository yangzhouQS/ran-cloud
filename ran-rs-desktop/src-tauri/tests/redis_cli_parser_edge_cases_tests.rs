//! Redis CLI parser 边界用例测试
use ran_rs_desktop_lib::modules::redis_desktop::cli::parser::parse_command;

#[test]
fn test_unmatched_single_quote() {
    let result = parse_command("SET key 'value");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("单引号"));
}

#[test]
fn test_unmatched_double_quote() {
    let result = parse_command("SET key \"value");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("双引号"));
}

#[test]
fn test_trailing_backslash() {
    let result = parse_command("SET key val\\");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("转义"));
}

#[test]
fn test_empty_double_quoted() {
    let result = parse_command("SET key \"\"").unwrap();
    assert_eq!(result.command, "SET");
    // Empty quoted string: parser opens/closes quotes but current is empty, not pushed
    assert_eq!(result.args, vec!["key"]);
}

#[test]
fn test_empty_single_quoted() {
    let result = parse_command("SET key ''").unwrap();
    assert_eq!(result.command, "SET");
    assert_eq!(result.args, vec!["key"]);
}

#[test]
fn test_unicode_in_quotes() {
    let result = parse_command("SET key \"日本語\"").unwrap();
    assert_eq!(result.command, "SET");
    assert_eq!(result.args, vec!["key", "日本語"]);
}

#[test]
fn test_tab_separator() {
    let result = parse_command("SET\tkey\tval").unwrap();
    assert_eq!(result.command, "SET");
    assert_eq!(result.args, vec!["key", "val"]);
}

#[test]
fn test_multiple_spaces() {
    let result = parse_command("SET   key   val").unwrap();
    assert_eq!(result.command, "SET");
    assert_eq!(result.args, vec!["key", "val"]);
}

#[test]
fn test_double_quote_in_single_quote() {
    let result = parse_command("SET key 'hello \"world\"'").unwrap();
    assert_eq!(result.command, "SET");
    assert_eq!(result.args, vec!["key", "hello \"world\""]);
}

#[test]
fn test_single_quote_in_double_quote() {
    let result = parse_command("SET key \"it's ok\"").unwrap();
    assert_eq!(result.command, "SET");
    assert_eq!(result.args, vec!["key", "it's ok"]);
}

#[test]
fn test_complex_multi_arg() {
    let result = parse_command("CONFIG SET maxmemory 256mb").unwrap();
    assert_eq!(result.command, "CONFIG");
    assert_eq!(result.args, vec!["SET", "maxmemory", "256mb"]);
}

#[test]
fn test_backslash_in_quotes() {
    let result = parse_command("SET key \"a\\\\b\"").unwrap();
    assert_eq!(result.command, "SET");
    assert_eq!(result.args, vec!["key", "a\\b"]);
}
