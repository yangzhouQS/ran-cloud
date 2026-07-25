//! Win11 风格主题:Mica 半透明暗色、Accent、Segoe UI。

use eframe::egui;

pub fn accent() -> egui::Color32 {
    egui::Color32::from_rgb(0x4C, 0xC2, 0xFF)
}
pub fn panel_fill() -> egui::Color32 {
    egui::Color32::from_rgba_premultiplied(32, 32, 32, 200)
}
pub fn bar_fill() -> egui::Color32 {
    egui::Color32::from_rgba_premultiplied(28, 28, 28, 215)
}
pub fn header_fill() -> egui::Color32 {
    egui::Color32::from_rgba_premultiplied(40, 40, 40, 220)
}
pub fn row_hover() -> egui::Color32 {
    egui::Color32::from_rgba_premultiplied(255, 255, 255, 22)
}
pub fn row_selected() -> egui::Color32 {
    egui::Color32::from_rgba_premultiplied(0x4C, 0xC2, 0xFF, 60)
}
pub fn separator() -> egui::Color32 {
    egui::Color32::from_rgba_premultiplied(255, 255, 255, 28)
}
pub fn text_dim() -> egui::Color32 {
    egui::Color32::from_rgb(160, 160, 160)
}

/// 应用 Win11 主题:透明 Visuals + 圆角 + 紧凑间距。
pub fn install(ctx: &egui::Context) {
    let mut v = egui::Visuals::dark();
    v.panel_fill = panel_fill();
    v.extreme_bg_color = egui::Color32::from_rgb(20, 20, 20);
    v.faint_bg_color = egui::Color32::from_rgba_premultiplied(255, 255, 255, 8);
    ctx.set_visuals(v);

    ctx.style_mut(|s| {
        s.spacing.item_spacing = egui::vec2(8.0, 6.0);
        s.spacing.button_padding = egui::vec2(10.0, 6.0);
        s.spacing.window_margin = egui::Margin::same(0.0);
        s.spacing.scroll.bar_width = 10.0;
        s.visuals.widgets.hovered.bg_fill = egui::Color32::from_rgba_premultiplied(255, 255, 255, 25);
        s.visuals.widgets.active.bg_fill = egui::Color32::from_rgba_premultiplied(255, 255, 255, 45);
        s.visuals.selection.bg_fill = accent();
        s.visuals.window_rounding = egui::Rounding::same(8.0);
        s.visuals.widgets.noninteractive.rounding = egui::Rounding::same(6.0);
        s.visuals.widgets.hovered.rounding = egui::Rounding::same(6.0);
    });

    install_cjk_font(ctx);
}

/// 注入系统 CJK 字体(Microsoft YaHei),解决 egui 默认字体无中文导致的方框问题。
///
/// 仅在 App::new 调用一次(theme::install 随之运行一次)。把 CJK 字体追加到
/// Proportional/Monospace 末尾:Latin 仍用 egui 默认字体,中文回退到 YaHei。
fn install_cjk_font(ctx: &egui::Context) {
    // 候选顺序:优先 Win11 默认 YaHei(ttc, index 0),兜底 SimHei(纯 ttf)。
    let candidates: &[&str] = &[
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhl.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
    ];

    for path in candidates {
        if let Ok(bytes) = std::fs::read(path) {
            let mut data = egui::FontData::from_owned(bytes);
            data.index = 0; // ttc 取首个字面;纯 ttf 同样用 0
            let mut fonts = egui::FontDefinitions::default();
            fonts.font_data.insert("cjk".to_owned(), std::sync::Arc::new(data));
            fonts
                .families
                .entry(egui::FontFamily::Proportional)
                .or_default()
                .push("cjk".to_owned());
            fonts
                .families
                .entry(egui::FontFamily::Monospace)
                .or_default()
                .push("cjk".to_owned());
            ctx.set_fonts(fonts);
            return;
        }
    }
    // 全部读取失败:不设置,中文将保持方框(但应用不崩溃)。
}
