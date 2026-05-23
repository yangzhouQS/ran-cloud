//! Redis 数据类型模型 Serde 测试
use ran_rs_desktop_lib::modules::redis_desktop::data::models::*;

fn roundtrip<T: serde::Serialize + serde::de::DeserializeOwned>(val: &T) -> T {
    let json = serde_json::to_string(val).unwrap();
    serde_json::from_str(&json).unwrap()
}

#[test]
fn string_data_camel_case() {
    let d = StringData { value: "hello".to_string(), encoding: "embstr".to_string() };
    let json = serde_json::to_string(&d).unwrap();
    assert!(json.contains("\"value\""));
    let back = roundtrip(&d);
    assert_eq!(back.value, "hello");
}

#[test]
fn hash_field_serde() {
    let f = HashField { field: "f1".to_string(), value: "v1".to_string() };
    assert_eq!(roundtrip(&f).field, "f1");
}

#[test]
fn hash_page_params_camel_case() {
    let p = HashPageParams {
        connection_id: "c1".to_string(), db: 0, key: "k".to_string(),
        page: 1, page_size: 50, match_pattern: Some("prefix*".to_string()),
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"connectionId\""));
    assert!(json.contains("\"pageSize\""));
    assert_eq!(roundtrip(&p).match_pattern.as_deref(), Some("prefix*"));
}

#[test]
fn list_entry_serde() {
    let e = ListEntry { index: 0, value: "val".to_string() };
    assert_eq!(roundtrip(&e).index, 0);
}

#[test]
fn list_page_params_serde() {
    let p = ListPageParams {
        connection_id: "c1".to_string(), db: 0, key: "k".to_string(), page: 1, page_size: 20,
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"connectionId\""));
    assert_eq!(roundtrip(&p).page_size, 20);
}

#[test]
fn set_member_serde() {
    let m = SetMember { member: "s1".to_string() };
    assert_eq!(roundtrip(&m).member, "s1");
}

#[test]
fn set_page_params_serde() {
    let p = SetPageParams {
        connection_id: "c1".to_string(), db: 0, key: "k".to_string(),
        page: 1, page_size: 50, match_pattern: None,
    };
    assert!(roundtrip(&p).match_pattern.is_none());
}

#[test]
fn zset_entry_serde() {
    let e = ZSetEntry { member: "m1".to_string(), score: 99.5 };
    let back = roundtrip(&e);
    assert_eq!(back.member, "m1");
    assert!((back.score - 99.5).abs() < f64::EPSILON);
}

#[test]
fn zset_page_params_serde() {
    let p = ZSetPageParams {
        connection_id: "c1".to_string(), db: 0, key: "k".to_string(),
        min_score: Some(0.0), max_score: Some(100.0), page: 1, page_size: 10,
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"minScore\""));
    assert!(json.contains("\"maxScore\""));
}

#[test]
fn stream_entry_serde() {
    let e = StreamEntry {
        id: "1630000000000-0".to_string(),
        fields: vec![("f1".to_string(), "v1".to_string()), ("f2".to_string(), "v2".to_string())],
    };
    let back = roundtrip(&e);
    assert_eq!(back.id, "1630000000000-0");
    assert_eq!(back.fields.len(), 2);
}

#[test]
fn stream_page_params_serde() {
    let p = StreamPageParams {
        connection_id: "c1".to_string(), db: 0, key: "k".to_string(),
        start_id: Some("0-0".to_string()), count: 100,
    };
    assert_eq!(roundtrip(&p).count, 100);
}

#[test]
fn stream_group_info_serde() {
    let g = StreamGroupInfo {
        name: "group1".to_string(), consumers: 3, pending: 10,
        last_delivered_id: "1630000000000-0".to_string(),
    };
    let json = serde_json::to_string(&g).unwrap();
    assert!(json.contains("\"lastDeliveredId\""));
}

#[test]
fn page_result_generic_serde() {
    let pr: PageResult<String> = PageResult {
        items: vec!["a".to_string(), "b".to_string()],
        total: 100, page: 1, page_size: 50,
    };
    let json = serde_json::to_string(&pr).unwrap();
    assert!(json.contains("\"pageSize\""));
    let back = roundtrip(&pr);
    assert_eq!(back.items.len(), 2);
}

#[test]
fn data_add_params_serde() {
    let p = DataAddParams {
        connection_id: "c1".to_string(), db: 0, key: "k".to_string(),
        field: Some("field1".to_string()), value: "v1".to_string(), score: None,
    };
    assert_eq!(roundtrip(&p).field.as_deref(), Some("field1"));
}

#[test]
fn data_update_params_serde() {
    let p = DataUpdateParams {
        connection_id: "c1".to_string(), db: 0, key: "k".to_string(),
        field: "f1".to_string(), new_field: Some("f2".to_string()),
        value: "v".to_string(), score: Some(1.5),
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"newField\""));
}

#[test]
fn data_delete_params_serde() {
    let p = DataDeleteParams {
        connection_id: "c1".to_string(), db: 0, key: "k".to_string(),
        fields: vec!["f1".to_string(), "f2".to_string()],
    };
    assert_eq!(roundtrip(&p).fields.len(), 2);
}
