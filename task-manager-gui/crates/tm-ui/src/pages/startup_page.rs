//! 启动应用页:名称/命令/位置,支持搜索过滤。

use eframe::egui;
use tm_core::startup::StartupEntry;

pub fn show(ui: &mut egui::Ui, items: &[StartupEntry], search: &str) {
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
                        ui.label(&e.name);
                        ui.label(&e.command);
                        ui.label(&e.location);
                        ui.end_row();
                    }
                });
        });
    ui.label(format!("共 {} 个启动项", items.len()));
}
