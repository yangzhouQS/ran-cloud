//! 启动应用页:图标/名称/命令/位置,支持搜索过滤。

use std::collections::HashMap;

use eframe::egui;
use tm_core::startup::StartupEntry;

pub fn show(
    ui: &mut egui::Ui,
    items: &[StartupEntry],
    search: &str,
    icons: &mut HashMap<String, Option<egui::TextureHandle>>,
) {
    let q = search.trim().to_ascii_lowercase();
    ui.add_space(2.0);
    egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Grid::new("startup_grid")
                .num_columns(3)
                .striped(true)
                .min_col_width(80.0)
                .spacing([24.0, 4.0])
                .show(ui, |ui| {
                    ui.strong("名称");
                    ui.strong("命令");
                    ui.strong("位置");
                    ui.end_row();
                    for e in items.iter().filter(|e| {
                        q.is_empty()
                            || e.name.to_ascii_lowercase().contains(&q)
                            || e.command.to_ascii_lowercase().contains(&q)
                    }) {
                        ui.horizontal(|ui| {
                            crate::icons::render(ui, icons, &exe_from_command(&e.command), &e.name);
                            ui.add_space(4.0);
                            ui.label(&e.name);
                        });
                        ui.label(&e.command);
                        ui.label(&e.location);
                        ui.end_row();
                    }
                });
        });
    ui.label(format!("共 {} 个启动项", items.len()));
}

/// 从启动命令中解析可执行路径(支持引号包裹与 .lnk)。
fn exe_from_command(cmd: &str) -> String {
    let s = cmd.trim();
    if let Some(rest) = s.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return rest[..end].to_string();
        }
    }
    match s.find(char::is_whitespace) {
        Some(i) => s[..i].to_string(),
        None => s.to_string(),
    }
}
