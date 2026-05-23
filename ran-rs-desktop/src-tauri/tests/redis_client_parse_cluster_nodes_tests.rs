//! Redis 集群节点解析测试
use ran_rs_desktop_lib::modules::redis_desktop::shared::redis_client::RedisClient;

#[test]
fn test_single_master_node() {
    let input = "abc123 127.0.0.1:6379@16379 master 0 1600000000 1 connected 0-5460";
    let nodes = RedisClient::parse_cluster_nodes(input);
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].node_id, "abc123");
    assert_eq!(nodes[0].host, "127.0.0.1");
    assert_eq!(nodes[0].port, 6379);
    assert!(nodes[0].is_master);
}

#[test]
fn test_single_slave_node() {
    let input = "def456 127.0.0.1:6380@16380 slave abc123 0 1600000000 2 connected";
    let nodes = RedisClient::parse_cluster_nodes(input);
    assert_eq!(nodes.len(), 1);
    assert!(!nodes[0].is_master);
    assert_eq!(nodes[0].host, "127.0.0.1");
    assert_eq!(nodes[0].port, 6380);
}

#[test]
fn test_multiple_nodes() {
    let input = "\
        node1 127.0.0.1:7001@17001 master - 0 1600000000 1 connected 0-5460\n\
        node2 127.0.0.1:7002@17002 master - 0 1600000000 2 connected 5461-10922\n\
        node3 127.0.0.1:7003@17003 master - 0 1600000000 3 connected 10923-16383\n";
    let nodes = RedisClient::parse_cluster_nodes(input);
    assert_eq!(nodes.len(), 3);
    assert!(nodes[0].is_master);
    assert!(nodes[1].is_master);
    assert!(nodes[2].is_master);
}

#[test]
fn test_ipv6_address() {
    let input = "node1 [::1]:6379@16379 master - 0 1600000000 1 connected 0-16383";
    let nodes = RedisClient::parse_cluster_nodes(input);
    assert_eq!(nodes.len(), 1);
    // IPv6: host includes bracket content
    assert!(nodes[0].host.contains("::1"));
    assert_eq!(nodes[0].port, 6379);
}

#[test]
fn test_empty_input() {
    let nodes = RedisClient::parse_cluster_nodes("");
    assert!(nodes.is_empty());
}

#[test]
fn test_whitespace_only() {
    let nodes = RedisClient::parse_cluster_nodes("  \n  \n  ");
    assert!(nodes.is_empty());
}

#[test]
fn test_malformed_line_too_short() {
    let input = "onlytwo parts";
    let nodes = RedisClient::parse_cluster_nodes(input);
    assert!(nodes.is_empty());
}

#[test]
fn test_address_without_at_sign() {
    let input = "node1 127.0.0.1:6379 master - 0 1600000000 1 connected 0-16383";
    let nodes = RedisClient::parse_cluster_nodes(input);
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].host, "127.0.0.1");
    assert_eq!(nodes[0].port, 6379);
}

#[test]
fn test_flags_contain_master_and_slave() {
    let input = "node1 127.0.0.1:6379@16379 myself,master - 0 1600000000 1 connected";
    let nodes = RedisClient::parse_cluster_nodes(input);
    assert_eq!(nodes.len(), 1);
    assert!(nodes[0].flags.contains("master"));
    assert!(nodes[0].is_master);
}

#[test]
fn test_mixed_master_slave() {
    let input = "\
        m1 10.0.0.1:6379@16379 master - 0 1600000000 1 connected 0-5460\n\
        s1 10.0.0.2:6379@16379 slave m1 0 1600000000 1 connected\n";
    let nodes = RedisClient::parse_cluster_nodes(input);
    assert_eq!(nodes.len(), 2);
    assert!(nodes[0].is_master);
    assert!(!nodes[1].is_master);
}
