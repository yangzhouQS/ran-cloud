use tm_core::error::{map_windows_error, OpsError};

#[test]
fn access_denied_maps() {
    assert_eq!(map_windows_error(5), OpsError::AccessDenied); // ERROR_ACCESS_DENIED
}

#[test]
fn invalid_parameter_maps() {
    assert_eq!(map_windows_error(87), OpsError::InvalidParameter); // ERROR_INVALID_PARAMETER
}

#[test]
fn unknown_maps_to_other() {
    match map_windows_error(9999) {
        OpsError::Other(c) => assert_eq!(c, 9999),
        other => panic!("expected Other, got {other:?}"),
    }
}
