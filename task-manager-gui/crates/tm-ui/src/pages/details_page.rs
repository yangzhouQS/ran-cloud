//! 详细信息页:图标/名称/PID/状态/用户/会话/内存/CPU,按 CPU 降序,支持搜索过滤。

use std::collections::HashMap;

use eframe::egui;
use tm_core::models::{ProcColumn, ProcInfo, ProcStatus, SortDir, SystemSnapshot};
use tm_core::sorting::sort_processes;

pub fn show(
    ui: &mut egui::Ui,
    snap: &SystemSnapshot,
    search: &str,
    icons: &mut HashMap<String, Option<egui::TextureHandle>>,
) {
    let q = search.trim().to_ascii_lowercase();
    let mut rows: Vec<ProcInfo> = snap
        .processes
        .iter()
        .filter(|p| q.is_empty() || p.name.to_ascii_lowercase().contains(&q))
        .cloned()
        .collect();
    sort_processes(&mut rows, ProcColumn::Cpu, SortDir::Desc);

    ui.add_space(2.0);
    egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Grid::new("details_grid")
                .num_columns(8)
                .striped(true)
                .min_col_width(56.0)
                .spacing([8.0, 3.0])
                .show(ui, |ui| {
                    ui.strong("");
                    ui.strong("名称");
                    ui.strong("PID");
                    ui.strong("状态");
                    ui.strong("用户");
                    ui.strong("会话");
                    ui.strong("内存");
                    ui.strong("CPU");
                    ui.end_row();
                    for p in &rows {
                        crate::icons::render(ui, icons, &p.exe_path, &p.name);
                        ui.label(&p.name);
                        ui.label(format!("{}", p.pid));
                        ui.label(status_str(p.status));
                        ui.label(p.user.clone().unwrap_or_else(|| "—".into()));
                        ui.label(p.session_id.map_or("—".into(), |s| s.to_string()));
                        ui.label(format!("{:.1} MB", p.memory_bytes as f64 / 1e6));
                        ui.label(format!("{:.1}%", p.cpu_usage));
                        ui.end_row();
                    }
                });
        });
}

fn status_str(s: ProcStatus) -> &'static str {
    match s {
        ProcStatus::Running => "运行",
        ProcStatus::Suspended => "已挂起",
        ProcStatus::NotResponding => "无响应",
    }
}
