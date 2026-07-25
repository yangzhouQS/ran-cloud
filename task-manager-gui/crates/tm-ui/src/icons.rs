//! 应用图标渲染助手:按 exe_path 缓存 TextureHandle,失败用首字母色块占位。

use std::collections::HashMap;

use eframe::egui;

/// 渲染 16×16 应用图标;exe_path 为空或提取失败时用首字母色块占位。
pub fn render(
    ui: &mut egui::Ui,
    icons: &mut HashMap<String, Option<egui::TextureHandle>>,
    exe_path: &str,
    fallback_name: &str,
) {
    if exe_path.is_empty() {
        placeholder(ui, fallback_name);
        return;
    }
    let entry = icons
        .entry(exe_path.to_string())
        .or_insert_with(|| match tm_core::win_source::exe_icon(exe_path) {
            Some(img) => {
                let ci = egui::ColorImage::from_rgba_unmultiplied(
                    [img.width() as usize, img.height() as usize],
                    img.as_raw(),
                );
                Some(ui.ctx().load_texture(
                    format!("icon:{}", exe_path),
                    ci,
                    Default::default(),
                ))
            }
            None => None,
        });
    match entry.as_ref() {
        Some(h) => {
            ui.add(egui::Image::from_texture(h).fit_to_exact_size(egui::vec2(16.0, 16.0)));
        }
        None => placeholder(ui, fallback_name),
    }
}

/// 取进程名首字符的彩色方块占位。
pub fn placeholder(ui: &mut egui::Ui, name: &str) {
    let ch = name.chars().next().filter(|c| c.is_alphabetic()).unwrap_or('?');
    let colors = [
        egui::Color32::from_rgb(0x4C, 0xC2, 0xFF),
        egui::Color32::from_rgb(0x9B, 0x6A, 0xE5),
        egui::Color32::from_rgb(0x4C, 0xC2, 0x6B),
        egui::Color32::from_rgb(0xE2, 0xA0, 0x4A),
        egui::Color32::from_rgb(0xE5, 0x6B, 0x6B),
        egui::Color32::from_rgb(0x6A, 0x9B, 0xD8),
    ];
    let c = colors[(ch as usize) % colors.len()];
    let (rect, _) = ui.allocate_exact_size(egui::vec2(16.0, 16.0), egui::Sense::hover());
    ui.painter().rect_filled(rect, egui::Rounding::same(3.0), c);
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        ch.to_string(),
        egui::FontId::proportional(10.0),
        egui::Color32::WHITE,
    );
}
