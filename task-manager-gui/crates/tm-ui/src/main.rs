//! Mica spike(Phase1 Task1):验证 eframe 透明窗口 + window_vibrancy::apply_mica 可行性。
//!
//! 验收:运行后窗口无边框、背景半透明透出桌面壁纸即成功;
//! 若不透明且排查无果,降级为纯色主题(见 spec §2.3)。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui;

fn main() -> eframe::Result<()> {
    let opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([960.0, 640.0])
            .with_min_inner_size([640.0, 420.0])
            .with_decorations(false) // 自定义边框
            .with_transparent(true)  // 让 Mica 透出
            .with_active(true),
        ..Default::default()
    };

    eframe::run_native(
        "ran-task-manager",
        opts,
        Box::new(|_cc| Ok(Box::new(SpikeApp { mica_applied: false }))),
    )
}

struct SpikeApp {
    mica_applied: bool,
}

impl eframe::App for SpikeApp {
    /// 让窗口清除色为全透明,否则 Mica 被不透明背景挡住。
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn update(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        // 只应用一次 Mica(eframe::Frame 实现了 HasWindowHandle,可直接传入)。
        if !self.mica_applied {
            let _ = window_vibrancy::apply_mica(frame, Some(true)); // Some(true) = 暗色 Mica
            self.mica_applied = true;
        }

        // 半透明 Visuals,让桌面壁纸透出。
        let mut v = egui::Visuals::dark();
        v.panel_fill = egui::Color32::from_rgba_premultiplied(32, 32, 32, 200); // #202020 ~0.78
        ctx.set_visuals(v);
        ctx.style_mut(|s| {
            s.spacing.window_margin = egui::Margin::same(0.0);
        });

        egui::CentralPanel::default()
            .show(ctx, |ui| {
                ui.add_space(16.0);
                ui.heading("Mica spike");
                ui.label("若背景半透明、透出桌面壁纸 → Mica 成功。");
                ui.label(format!("Mica 已尝试应用: {}", self.mica_applied));
            });
    }
}
