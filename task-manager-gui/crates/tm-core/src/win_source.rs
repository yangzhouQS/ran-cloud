//! windows 补缺:窗口 PID 集合(供进程分组 App/Background 使用)。
//!
//! Task 7 将用 EnumWindows 实现真实逻辑;此处为跨平台占位。

use std::collections::HashSet;

#[cfg(windows)]
pub fn window_pids() -> HashSet<u32> {
    HashSet::new() // 占位:Task 7 用 EnumWindows 填充
}

#[cfg(not(windows))]
pub fn window_pids() -> HashSet<u32> {
    HashSet::new()
}
