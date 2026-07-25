//! 应用历史页(会话内累计近似):图标/名称/CPU 时间/网络流量。

use std::collections::HashMap;

use eframe::egui;
use tm_core::models::SystemSnapshot;

use crate::theme;

pub fn show(
    ui: &mut egui::Ui,
    snap: &SystemSnapshot,
    search: &str,
    icons: &mut HashMap<String, Option<egui::TextureHandle>>,
) {
    let q = search.trim().to_ascii_lowercase();
    ui.add_space(2.0);
    egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Grid::new("app_history_grid")
                .num_columns(3)
                .striped(true)
                .min_col_width(80.0)
                .spacing([24.0, 4.0])
                .show(ui, |ui| {
                    ui.strong("应用");
                    ui.strong("CPU 时间");
                    ui.strong("网络");
                    ui.end_row();
                    for e in snap.app_history.iter().filter(|e| {
                        q.is_empty() || e.name.to_ascii_lowercase().contains(&q)
                    }) {
                        ui.horizontal(|ui| {
                            crate::icons::render(ui, icons, &e.exe_path, &e.name);
                            ui.add_space(4.0);
                            ui.label(&e.name);
                        });
                        ui.label(fmt_dur(e.cpu_secs));
                        ui.label(fmt_net(e.net_bytes));
                        ui.end_row();
                    }
                });
        });
    ui.colored_label(theme::text_dim(), "说明:为会话内累计近似(Win11 读自私有存储,无公开 API)。");
}

fn fmt_dur(secs: f64) -> String {
    let s = secs as u64;
    let h = s / 3600;
    let m = (s % 3600) / 60;
    let sec = s % 60;
    if h > 0 {
        format!("{}h {}m {}s", h, m, sec)
    } else if m > 0 {
        format!("{}m {}s", m, sec)
    } else {
        format!("{:.1}s", secs)
    }
}

fn fmt_net(b: u64) -> String {
    let f = b as f64;
    if f >= 1e9 {
        format!("{:.2} GB", f / 1e9)
    } else if f >= 1e6 {
        format!("{:.1} MB", f / 1e6)
    } else if f >= 1e3 {
        format!("{:.1} KB", f / 1e3)
    } else {
        format!("{} B", b)
    }
}
