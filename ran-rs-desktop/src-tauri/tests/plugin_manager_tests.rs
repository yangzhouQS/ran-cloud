// plugin_manager_tests.rs — 路径遍历防护测试（Tier 1 最高优先级）

use std::fs;
use std::sync::Arc;

use ran_rs_desktop_lib::modules::sql_studio::plugin::manager::PluginManager;
use ran_rs_desktop_lib::modules::sql_studio::plugin::models::{PluginCapabilities, PluginManifest, PluginView};
use ran_rs_desktop_lib::modules::sql_studio::plugin::store::PluginDataStore;

/// 在 plugins_dir 下创建测试插件
fn create_test_plugin(plugins_dir: &std::path::Path, id: &str, entry_dir: Option<&str>) {
    let plugin_dir = plugins_dir.join(id);
    fs::create_dir_all(&plugin_dir).unwrap();

    let manifest = PluginManifest {
        id: id.to_string(),
        name: format!("Test Plugin {}", id),
        version: "1.0.0".to_string(),
        description: "Test".to_string(),
        author: None,
        min_app_version: None,
        icon: None,
        manifest_version: 1,
        plugin_entry_dir: entry_dir.map(String::from),
        capabilities: PluginCapabilities {
            views: vec![PluginView {
                id: "main".to_string(),
                name: "Main".to_string(),
                view_type: "base-tab".to_string(),
                entry: "index.html".to_string(),
            }],
            menu: vec![],
        },
    };

    let json = serde_json::to_string_pretty(&manifest).unwrap();
    fs::write(plugin_dir.join("manifest.json"), json).unwrap();
}

/// 在 plugins_dir 下创建测试文件
fn create_test_file(plugins_dir: &std::path::Path, plugin_id: &str, path: &str, content: &str) {
    let full_path = plugins_dir.join(plugin_id).join(path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(full_path, content).unwrap();
}

fn setup(temp: &std::path::Path) -> (Arc<PluginManager>, std::path::PathBuf) {
    let plugins_dir = temp.join("plugins");
    let store_dir = temp.join("plugin_data");
    let store = Arc::new(PluginDataStore::new(store_dir).unwrap());
    let manager = Arc::new(PluginManager::new(plugins_dir.clone(), store));
    (manager, plugins_dir)
}

#[test]
fn test_resolve_normal_file() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    create_test_plugin(&plugins_dir, "test-plugin", None);
    create_test_file(&plugins_dir, "test-plugin", "index.html", "<h1>Hello</h1>");

    manager.discover_plugins().unwrap();

    let result = manager.resolve_asset_path("test-plugin", "index.html");
    assert!(result.is_ok(), "Expected Ok, got Err: {:?}", result);
    let path = result.unwrap();
    assert!(path.to_string_lossy().contains("index.html"));
}

#[test]
fn test_resolve_subdirectory_file() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    create_test_plugin(&plugins_dir, "test-plugin", None);
    create_test_file(&plugins_dir, "test-plugin", "assets/logo.png", "PNG_DATA");

    manager.discover_plugins().unwrap();

    let result = manager.resolve_asset_path("test-plugin", "assets/logo.png");
    assert!(result.is_ok(), "Expected Ok, got Err: {:?}", result);
}

#[test]
fn test_reject_path_traversal() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    create_test_plugin(&plugins_dir, "test-plugin", None);
    manager.discover_plugins().unwrap();

    let result = manager.resolve_asset_path("test-plugin", "../../../etc/passwd");
    assert!(result.is_err());
}

#[test]
fn test_reject_double_dot_in_path() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    create_test_plugin(&plugins_dir, "test-plugin", None);
    manager.discover_plugins().unwrap();

    let result = manager.resolve_asset_path("test-plugin", "subdir/../../secret");
    assert!(result.is_err());
}

#[test]
fn test_reject_disabled_plugin() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    create_test_plugin(&plugins_dir, "test-plugin", None);
    create_test_file(&plugins_dir, "test-plugin", "index.html", "Hello");
    manager.discover_plugins().unwrap();

    // 禁用插件
    manager.disable_plugin("test-plugin").unwrap();

    let result = manager.resolve_asset_path("test-plugin", "index.html");
    assert!(result.is_err());
}

#[test]
fn test_resolve_with_plugin_entry_dir() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    create_test_plugin(&plugins_dir, "test-plugin", Some("dist"));
    create_test_file(&plugins_dir, "test-plugin", "dist/index.html", "Hello");
    manager.discover_plugins().unwrap();

    let result = manager.resolve_asset_path("test-plugin", "index.html");
    assert!(result.is_ok(), "Expected Ok, got Err: {:?}", result);
    let path = result.unwrap();
    assert!(path.to_string_lossy().contains("index.html"));
}

#[test]
fn test_reject_entry_dir_traversal() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    // 创建带有 .. 的 plugin_entry_dir 的清单
    let plugin_dir = plugins_dir.join("evil-plugin");
    fs::create_dir_all(&plugin_dir).unwrap();

    let manifest = PluginManifest {
        id: "evil-plugin".to_string(),
        name: "Evil".to_string(),
        version: "1.0.0".to_string(),
        description: "Evil".to_string(),
        author: None,
        min_app_version: None,
        icon: None,
        manifest_version: 1,
        plugin_entry_dir: Some("../../..".to_string()),
        capabilities: PluginCapabilities {
            views: vec![],
            menu: vec![],
        },
    };

    let json = serde_json::to_string_pretty(&manifest).unwrap();
    fs::write(plugin_dir.join("manifest.json"), json).unwrap();
    manager.discover_plugins().unwrap();

    let result = manager.resolve_asset_path("evil-plugin", "etc/passwd");
    assert!(result.is_err());
}

#[test]
fn test_nonexistent_plugin() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, _) = setup(temp.path());

    let result = manager.resolve_asset_path("nonexistent", "index.html");
    assert!(result.is_err());
}

#[test]
fn test_resolve_nonexistent_file_in_existing_dir() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    create_test_plugin(&plugins_dir, "test-plugin", None);
    // 不创建文件，但插件目录存在
    manager.discover_plugins().unwrap();

    let result = manager.resolve_asset_path("test-plugin", "nonexistent.js");
    // 文件不存在，但父目录是插件目录，应该在范围内
    assert!(result.is_ok(), "Expected Ok, got Err: {:?}", result);
}

#[test]
fn test_resolve_nonexistent_file_in_nonexistent_subdir() {
    let temp = tempfile::tempdir().unwrap();
    let (manager, plugins_dir) = setup(temp.path());

    create_test_plugin(&plugins_dir, "test-plugin", None);
    manager.discover_plugins().unwrap();

    let result = manager.resolve_asset_path("test-plugin", "no-such-dir/file.js");
    // 父目录不存在，应该报错
    assert!(result.is_err());
}
