//! Win11 风格主题:Mica 半透明(暗/亮)、Accent、Segoe UI + CJK 字体。
//!
//! 注意:半透明叠加色必须用 `from_rgba_unmultiplied`(RGB 可大于 alpha)。
//! 误用 `from_rgba_premultiplied` 且 RGB>alpha 会导致渲染成刺眼的纯白色。

use eframe::egui;

pub fn accent() -> egui::Color32 {
    egui::Color32::from_rgb(0x4C, 0xC2, 0xFF)
}
pub fn panel_fill() -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(32, 32, 32, 200)
}
pub fn bar_fill() -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(28, 28, 28, 215)
}
pub fn header_fill() -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(40, 40, 40, 220)
}
/// 行 hover:淡灰叠加(避免刺眼白)。
pub fn row_hover() -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(255, 255, 255, 16)
}
/// 行选中:Accent 淡叠加。
pub fn row_selected() -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(0x4C, 0xC2, 0xFF, 56)
}
pub fn separator() -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(255, 255, 255, 26)
}
pub fn text_dim() -> egui::Color32 {
    egui::Color32::from_rgb(160, 160, 160)
}

/// 安装字体与间距(仅一次,在 App::new 调用)。
pub fn install(ctx: &egui::Context) {
    install_cjk_font(ctx);
    ctx.style_mut(|s| {
        s.spacing.item_spacing = egui::vec2(8.0, 6.0);
        s.spacing.button_padding = egui::vec2(10.0, 6.0);
        s.spacing.window_margin = egui::Margin::same(0.0);
        s.spacing.scroll.bar_width = 10.0;
    });
    set_mode(ctx, true);
}

/// 切换暗/亮模式(同时改 Visuals;可随时调用)。
pub fn set_mode(ctx: &egui::Context, dark: bool) {
    let mut v = if dark {
        egui::Visuals::dark()
    } else {
        egui::Visuals::light()
    };
    if dark {
        v.panel_fill = panel_fill();
        v.extreme_bg_color = egui::Color32::from_rgb(20, 20, 20);
        v.faint_bg_color = egui::Color32::from_rgba_unmultiplied(255, 255, 255, 8);
        v.widgets.hovered.bg_fill = egui::Color32::from_rgba_unmultiplied(255, 255, 255, 22);
        v.widgets.active.bg_fill = egui::Color32::from_rgba_unmultiplied(255, 255, 255, 40);
    } else {
        v.panel_fill = egui::Color32::from_rgba_unmultiplied(243, 243, 243, 215);
        v.extreme_bg_color = egui::Color32::from_rgb(250, 250, 250);
        v.faint_bg_color = egui::Color32::from_rgba_unmultiplied(0, 0, 0, 8);
        v.widgets.hovered.bg_fill = egui::Color32::from_rgba_unmultiplied(0, 0, 0, 15);
        v.widgets.active.bg_fill = egui::Color32::from_rgba_unmultiplied(0, 0, 0, 30);
    }
    v.selection.bg_fill = accent();
    v.window_rounding = egui::Rounding::same(8.0);
    v.widgets.noninteractive.rounding = egui::Rounding::same(6.0);
    v.widgets.hovered.rounding = egui::Rounding::same(6.0);
    ctx.set_visuals(v);
}

/// 注入系统 CJK 字体(Microsoft YaHei),解决 egui 默认字体无中文导致的方框问题。
fn install_cjk_font(ctx: &egui::Context) {
    let candidates: &[&str] = &[
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhl.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
    ];

    for path in candidates {
        if let Ok(bytes) = std::fs::read(path) {
            let mut data = egui::FontData::from_owned(bytes);
            data.index = 0;
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
}
