// modules/redis_desktop/cli/parser.rs — Redis 命令参数解析器
// 将用户输入的命令字符串解析为 Redis 命令 + 参数列表

/// 解析结果
#[derive(Debug, Clone)]
pub struct ParsedCommand {
    /// 命令名称（大写）
    pub command: String,
    /// 参数列表
    pub args: Vec<String>,
}

/// 将用户输入的命令文本解析为命令 + 参数
/// 支持单引号、双引号包裹的参数（含空格）
/// 支持 \ 转义引号
///
/// 示例:
///   "SET mykey hello world"        → SET ["mykey", "hello", "world"]
///   "SET mykey \"hello world\""    → SET ["mykey", "hello world"]
///   "SET mykey 'hello world'"      → SET ["mykey", "hello world"]
///   "SET mykey \"it's ok\""        → SET ["mykey", "it's ok"]
pub fn parse_command(input: &str) -> Result<ParsedCommand, String> {
    let input = input.trim();

    if input.is_empty() {
        return Err("命令不能为空".to_string());
    }

    let tokens = tokenize(input)?;

    if tokens.is_empty() {
        return Err("命令不能为空".to_string());
    }

    let command = tokens[0].to_uppercase();
    let args = tokens[1..].to_vec();

    Ok(ParsedCommand { command, args })
}

/// 将输入字符串分割为 token 列表
/// 支持双引号、单引号包裹，支持反斜杠转义
fn tokenize(input: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut escape = false;
    let chars: Vec<char> = input.chars().collect();

    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];

        if escape {
            // 转义模式：直接追加字符
            current.push(ch);
            escape = false;
            i += 1;
            continue;
        }

        match ch {
            '\\' => {
                // 反斜杠转义
                escape = true;
            }
            '\'' => {
                if in_double_quote {
                    // 双引号内的单引号是普通字符
                    current.push(ch);
                } else if in_single_quote {
                    // 结束单引号
                    in_single_quote = false;
                } else {
                    // 开始单引号
                    in_single_quote = true;
                }
            }
            '"' => {
                if in_single_quote {
                    // 单引号内的双引号是普通字符
                    current.push(ch);
                } else if in_double_quote {
                    // 结束双引号
                    in_double_quote = false;
                } else {
                    // 开始双引号
                    in_double_quote = true;
                }
            }
            ' ' | '\t' => {
                if in_single_quote || in_double_quote {
                    // 引号内的空格是普通字符
                    current.push(ch);
                } else if !current.is_empty() {
                    // 分隔 token
                    tokens.push(current.clone());
                    current.clear();
                }
                // 连续空格跳过
            }
            _ => {
                current.push(ch);
            }
        }

        i += 1;
    }

    // 检查未闭合的引号
    if in_single_quote {
        return Err("未闭合的单引号".to_string());
    }
    if in_double_quote {
        return Err("未闭合的双引号".to_string());
    }
    if escape {
        return Err("未完成的转义序列".to_string());
    }

    // 最后一个 token
    if !current.is_empty() {
        tokens.push(current);
    }

    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_command() {
        let result = parse_command("SET mykey hello").unwrap();
        assert_eq!(result.command, "SET");
        assert_eq!(result.args, vec!["mykey", "hello"]);
    }

    #[test]
    fn test_double_quoted() {
        let result = parse_command("SET mykey \"hello world\"").unwrap();
        assert_eq!(result.command, "SET");
        assert_eq!(result.args, vec!["mykey", "hello world"]);
    }

    #[test]
    fn test_single_quoted() {
        let result = parse_command("SET mykey 'hello world'").unwrap();
        assert_eq!(result.command, "SET");
        assert_eq!(result.args, vec!["mykey", "hello world"]);
    }

    #[test]
    fn test_mixed_quotes() {
        let result = parse_command("SET mykey \"it's ok\"").unwrap();
        assert_eq!(result.command, "SET");
        assert_eq!(result.args, vec!["mykey", "it's ok"]);
    }

    #[test]
    fn test_empty_input() {
        assert!(parse_command("").is_err());
        assert!(parse_command("   ").is_err());
    }

    #[test]
    fn test_no_args() {
        let result = parse_command("PING").unwrap();
        assert_eq!(result.command, "PING");
        assert!(result.args.is_empty());
    }

    #[test]
    fn test_case_insensitive() {
        let result = parse_command("get mykey").unwrap();
        assert_eq!(result.command, "GET");
    }

    #[test]
    fn test_escape() {
        let result = parse_command("SET mykey hello\\ world").unwrap();
        assert_eq!(result.command, "SET");
        assert_eq!(result.args, vec!["mykey", "hello world"]);
    }
}
