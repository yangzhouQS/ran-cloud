//! ran-task-manager 入口。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui;

fn main() -> eframe::Result<()> {
    let opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1000.0, 680.0])
            .with_min_inner_size([760.0, 480.0])
            .with_decorations(false)
            .with_transparent(true)
            .with_active(true),
        ..Default::default()
    };

    eframe::run_native(
        "ran-task-manager",
        opts,
        Box::new(|cc| Ok(Box::new(tm_ui::app::App::new(cc)))),
    )
}
