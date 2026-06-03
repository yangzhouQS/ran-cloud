// modules/claw_manager/mod.rs — Claw Manager 模块入口
// 提供 openclaw CLI 命令的真实执行能力
// 前端通过 Tauri invoke 调用，后端通过 std::process::Command 执行

pub mod commands;
pub mod executor;
pub mod models;
