//! tm-core: 任务管理器核心(采集/操作/模型),与 UI 无关。

pub mod classify;
pub mod collector;
pub mod error;
pub mod gpu;
pub mod models;
pub mod privilege;
pub mod process_ops;
pub mod run_task;
pub mod services;
pub mod sorting;
pub mod startup;
pub mod sysinfo_source;
pub mod users;
pub mod win_source;

pub use models::*;
