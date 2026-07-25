fn main() {
    for path in [
        r"C:\Windows\explorer.exe",
        r"C:\Windows\System32\notepad.exe",
        r"C:\Windows\System32\cmd.exe",
    ] {
        match tm_core::win_source::exe_icon(path) {
            Some(img) => println!("{} -> {}x{} px", path, img.width(), img.height()),
            None => println!("{} -> (no icon)", path),
        }
    }
}
