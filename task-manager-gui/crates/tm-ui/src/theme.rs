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
}
