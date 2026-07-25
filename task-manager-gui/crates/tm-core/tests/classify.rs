use tm_core::classify::{classify_kind, estimate_power_usage};
use tm_core::models::{PowerUsage, ProcKind};

#[test]
fn low_power_when_idle() {
    assert_eq!(estimate_power_usage(0.0, 0.0), PowerUsage::Low);
    assert_eq!(estimate_power_usage(2.0, 10_000.0), PowerUsage::Low);
}

#[test]
fn medium_power_mid_range() {
    assert_eq!(estimate_power_usage(5.0, 100_000.0), PowerUsage::Medium);
    assert_eq!(estimate_power_usage(15.0, 0.0), PowerUsage::Medium);
}

#[test]
fn high_power_busy() {
    assert_eq!(estimate_power_usage(25.0, 0.0), PowerUsage::High);
    assert_eq!(estimate_power_usage(5.0, 5_000_000.0), PowerUsage::High);
}

#[test]
fn app_has_window() {
    assert_eq!(
        classify_kind("chrome.exe", r"C:\Program Files\Google\Chrome\Application\chrome.exe", true),
        ProcKind::App
    );
}

#[test]
fn windows_in_system32() {
    assert_eq!(
        classify_kind("svchost.exe", r"C:\Windows\System32\svchost.exe", false),
        ProcKind::Windows
    );
}

#[test]
fn background_otherwise() {
    assert_eq!(
        classify_kind("foo.exe", r"C:\Users\me\AppData\Local\x\foo.exe", false),
        ProcKind::Background
    );
}
