// plugin_store_tests.rs — 插件数据存储 CRUD 测试（Tier 1）

use std::sync::Arc;

use ran_rs_desktop_lib::modules::sql_studio::plugin::store::PluginDataStore;

fn create_store(temp: &std::path::Path) -> Arc<PluginDataStore> {
    Arc::new(PluginDataStore::new(temp.join("plugin_data")).unwrap())
}

#[test]
fn test_set_and_get_data() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    let value = serde_json::json!({"name": "test", "count": 42});
    store.set_data("plugin-1", "key1", &value).unwrap();

    let result = store.get_data("plugin-1", "key1").unwrap();
    assert_eq!(result, Some(value));
}

#[test]
fn test_get_nonexistent_key() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    let result = store.get_data("plugin-1", "no-key").unwrap();
    assert!(result.is_none());
}

#[test]
fn test_overwrite_data() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    store.set_data("plugin-1", "key1", &serde_json::json!("old")).unwrap();
    store.set_data("plugin-1", "key1", &serde_json::json!("new")).unwrap();

    let result = store.get_data("plugin-1", "key1").unwrap();
    assert_eq!(result, Some(serde_json::json!("new")));
}

#[test]
fn test_per_plugin_isolation() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    store.set_data("plugin-a", "shared-key", &serde_json::json!("value-a")).unwrap();
    store.set_data("plugin-b", "shared-key", &serde_json::json!("value-b")).unwrap();

    let a = store.get_data("plugin-a", "shared-key").unwrap();
    let b = store.get_data("plugin-b", "shared-key").unwrap();

    assert_eq!(a, Some(serde_json::json!("value-a")));
    assert_eq!(b, Some(serde_json::json!("value-b")));
}

#[test]
fn test_complex_json_value() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    let complex = serde_json::json!({
        "nested": {"deep": [1, 2, 3]},
        "bool": true,
        "null": null,
        "str": "hello"
    });
    store.set_data("plugin-1", "complex", &complex).unwrap();

    let result = store.get_data("plugin-1", "complex").unwrap();
    assert_eq!(result, Some(complex));
}

#[test]
fn test_list_keys() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    store.set_data("plugin-1", "key-a", &serde_json::json!(1)).unwrap();
    store.set_data("plugin-1", "key-b", &serde_json::json!(2)).unwrap();
    store.set_data("plugin-1", "key-c", &serde_json::json!(3)).unwrap();
    store.set_data("plugin-2", "key-x", &serde_json::json!(9)).unwrap();

    let keys = store.list_keys("plugin-1").unwrap();
    assert_eq!(keys, vec!["key-a", "key-b", "key-c"]);

    let keys2 = store.list_keys("plugin-2").unwrap();
    assert_eq!(keys2, vec!["key-x"]);
}

#[test]
fn test_list_keys_empty() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    let keys = store.list_keys("no-plugin").unwrap();
    assert!(keys.is_empty());
}

#[test]
fn test_enabled_default_true() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    let enabled = store.is_enabled("new-plugin").unwrap();
    assert!(enabled);
}

#[test]
fn test_set_and_get_enabled() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    store.set_enabled("plugin-1", false).unwrap();
    assert!(!store.is_enabled("plugin-1").unwrap());

    store.set_enabled("plugin-1", true).unwrap();
    assert!(store.is_enabled("plugin-1").unwrap());
}

#[test]
fn test_empty_key_returns_none() {
    let temp = tempfile::tempdir().unwrap();
    let store = create_store(temp.path());

    let result = store.get_data("plugin-1", "").unwrap();
    assert!(result.is_none());
}
