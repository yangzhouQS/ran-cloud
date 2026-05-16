/**
 * CLI 终端组件
 * redis-desktop-manager / components / cli-terminal
 *
 * 描述：Redis CLI 交互式终端，支持命令执行、自动补全、历史记录
 * 功能：
 *   - 命令输入与执行（调用 Tauri 后端 CLI 引擎）
 *   - 自动补全建议（基于后端 Redis 命令库）
 *   - 命令历史记录（上下箭头浏览）
 *   - 语法提示（当前命令的语法格式）
 *   - 特殊命令：clear / help / exit
 */

import { defineComponent, ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useRedisStore } from "../stores/redis-store";
import {
  redisCliExec,
  redisCliComplete,
  redisCliSyntax,
  redisStorageLoadCliHistory,
  redisStorageSaveCliHistory,
} from "../services/redis-commands";
import type { CliExecResult } from "../types";
import "./cli-terminal.less";

/** 输出行类型 */
interface OutputLine {
  text: string;
  type: "input" | "result" | "error" | "info" | "success";
}

export default defineComponent({
  name: "CliTerminal",

  props: {
    /** 连接 ID */
    connectionId: {
      type: String,
      required: true,
    },
    /** 当前 DB 编号 */
    db: {
      type: Number,
      default: 0,
    },
  },

  setup(props) {
    const ns = useCsNamespace("cli-terminal");
    const store = useRedisStore();

    // ===== 状态 =====
    const inputValue = ref("");
    const outputLines = ref<OutputLine[]>([]);
    const historyItems = ref<string[]>([]);
    const historyIndex = ref(-1);
    const suggestions = ref<string[]>([]);
    const activeSuggestionIndex = ref(-1);
    const syntaxHint = ref("");
    const isExecuting = ref(false);
    const showSuggestions = ref(false);

    // DOM 引用
    const outputRef = ref<HTMLElement | null>(null);
    const inputRef = ref<HTMLInputElement | null>(null);

    /** 最大历史记录数 */
    const MAX_HISTORY = 2000;
    /** 最大输出行数 */
    const MAX_OUTPUT_LINES = 2000;

    // ===== 计算属性 =====

    /** 命令提示符 */
    const prompt = computed(() =>
      `${store.activeConnection?.name ?? "redis"} [${props.db}]>`
    );

    /** 当前输入的命令名（第一个单词，小写） */
    const currentCommand = computed(() => {
      const trimmed = inputValue.value.trim();
      const spaceIdx = trimmed.indexOf(" ");
      const cmd = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed;
      return cmd.toLowerCase();
    });

    // ===== 方法 =====

    /** 添加输出行 */
    function addLine(text: string, type: OutputLine["type"] = "result") {
      outputLines.value.push({ text, type });
      // 限制输出行数
      if (outputLines.value.length > MAX_OUTPUT_LINES) {
        outputLines.value.splice(0, outputLines.value.length - MAX_OUTPUT_LINES);
      }
      scrollToBottom();
    }

    /** 滚动到底部 */
    function scrollToBottom() {
      void nextTick(() => {
        if (outputRef.value) {
          outputRef.value.scrollTop = outputRef.value.scrollHeight;
        }
      });
    }

    /** 聚焦输入框 */
    function focusInput() {
      void nextTick(() => {
        inputRef.value?.focus();
      });
    }

    /** 执行命令 */
    async function executeCommand() {
      const cmd = inputValue.value.trim();
      if (!cmd || isExecuting.value) {
        return;
      }

      inputValue.value = "";
      showSuggestions.value = false;
      syntaxHint.value = "";
      addLine(`${prompt.value} ${cmd}`, "input");

      // 添加到历史
      appendToHistory(cmd);

      // 解析命令名
      const cmdName = cmd.split(/\s+/)[0].toLowerCase();

      // 特殊命令处理
      if (cmdName === "clear") {
        outputLines.value = [];
        return;
      }

      if (cmdName === "help") {
        addLine("Input your Redis command and select from tips.", "info");
        addLine("Special commands: clear, help, exit", "info");
        return;
      }

      if (cmdName === "exit" || cmdName === "quit") {
        // 关闭当前 CLI 标签页
        const tabId = store.tabs.find(
          t => t.type === "cli" && t.connectionId === props.connectionId && t.db === props.db,
        )?.id;
        if (tabId) {
          store.closeTab(tabId);
        }
        return;
      }

      // 调用后端执行
      isExecuting.value = true;
      try {
        const result: CliExecResult = await redisCliExec(
          props.connectionId,
          props.db,
          cmd,
        );

        if (result.result) {
          addLine(result.result, "result");
        } else {
          addLine("(nil)", "info");
        }

        // 显示执行耗时
        if (result.durationMs > 0) {
          addLine(`(${result.durationMs.toFixed(2)}ms)`, "info");
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        addLine(`(error) ${errMsg}`, "error");
      } finally {
        isExecuting.value = false;
        scrollToBottom();
      }
    }

    /** 追加到历史 */
    function appendToHistory(cmd: string) {
      if (!cmd) {
        return;
      }
      const items = historyItems.value;
      if (items[items.length - 1] !== cmd) {
        items.push(cmd);
      }
      historyIndex.value = items.length;
    }

    /** 上翻历史 */
      function navigateUp() {
      if (showSuggestions.value) {
        return;
      }
      const idx = historyIndex.value - 1;
      if (idx < 0) {
        historyIndex.value = 0;
        return;
      }
      historyIndex.value = idx;
      inputValue.value = historyItems.value[idx] ?? "";
    }

    /** 下翻历史 */
    function navigateDown() {
      if (showSuggestions.value) {
        return;
      }
      const idx = historyIndex.value + 1;
      if (idx >= historyItems.value.length) {
        historyIndex.value = historyItems.value.length;
        inputValue.value = "";
        return;
      }
      historyIndex.value = idx;
      inputValue.value = historyItems.value[idx] ?? "";
    }

    /** 请求自动补全 */
    async function fetchSuggestions() {
      const input = inputValue.value.trim();
      if (!input) {
        suggestions.value = [];
        showSuggestions.value = false;
        syntaxHint.value = "";
        return;
      }

      try {
        const results = await redisCliComplete(props.connectionId, input);
        suggestions.value = results;
        showSuggestions.value = results.length > 0;
        activeSuggestionIndex.value = -1;
      } catch {
        suggestions.value = [];
        showSuggestions.value = false;
      }

      // 获取语法提示
      if (currentCommand.value) {
        try {
          const syntax = await redisCliSyntax(currentCommand.value);
          syntaxHint.value = syntax ?? "";
        } catch {
          syntaxHint.value = "";
        }
      } else {
        syntaxHint.value = "";
      }
    }

    /** 选择建议项 */
    function selectSuggestion(item: string) {
      // 将建议项替换当前输入中的命令部分
      const parts = inputValue.value.split(/\s+/);
      parts[0] = item.split(/\s+/)[0]; // 只替换命令名
      inputValue.value = parts.join(" ") + " ";
      showSuggestions.value = false;
      focusInput();
    }

    /** 键盘事件处理 */
    function handleKeydown(e: KeyboardEvent) {
      // Tab 补全
      if (e.key === "Tab") {
        e.preventDefault();
        if (showSuggestions.value && suggestions.value.length > 0) {
          const idx = activeSuggestionIndex.value >= 0
            ? activeSuggestionIndex.value
            : 0;
          selectSuggestion(suggestions.value[idx]);
        }
        return;
      }

      // 上下箭头浏览历史
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (showSuggestions.value && suggestions.value.length > 0) {
          activeSuggestionIndex.value = Math.max(0, activeSuggestionIndex.value - 1);
        } else {
          navigateUp();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (showSuggestions.value && suggestions.value.length > 0) {
          activeSuggestionIndex.value = Math.min(
            suggestions.value.length - 1,
            activeSuggestionIndex.value + 1,
          );
        } else {
          navigateDown();
        }
        return;
      }

      // Enter 执行
      if (e.key === "Enter") {
        e.preventDefault();
        if (showSuggestions.value && activeSuggestionIndex.value >= 0) {
          selectSuggestion(suggestions.value[activeSuggestionIndex.value]);
        } else {
          executeCommand();
        }
        return;
      }

      // Escape 关闭建议
      if (e.key === "Escape") {
        showSuggestions.value = false;
        return;
      }

      // Ctrl+L 清屏
      if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        outputLines.value = [];
        return;
      }
    }

    /** 输入变化处理 */
    function handleInput() {
      void fetchSuggestions();
    }

    // ===== 生命周期 =====

    onMounted(async () => {
      // 初始化欢迎信息
      addLine(`> ${store.activeConnection?.name ?? "redis"} connected!`, "success");
      addLine('Type "help" for special commands, or enter Redis commands.', "info");
      addLine("", "info");

      // 加载历史
      try {
        historyItems.value = await redisStorageLoadCliHistory();
        historyIndex.value = historyItems.value.length;
      } catch {
        // 忽略加载失败
      }

      focusInput();
    });

    onBeforeUnmount(async () => {
      // 保存历史
      try {
        await redisStorageSaveCliHistory(historyItems.value.slice(-200));
      } catch {
        // 忽略保存失败
      }
    });

    // ===== 渲染 =====

    return () => (
      <div class={ns.b()}>
        {/* 输出区域 */}
        <div ref={outputRef} class={ns.e("output")}>
          {outputLines.value.map((line, idx) => (
            <div
              key={idx}
              class={[ns.e("line"), ns.em("line", line.type)]}
            >
              {line.text}
            </div>
          ))}
        </div>

        {/* 语法提示 */}
        {syntaxHint.value && (
          <div class={ns.e("syntax-hint")}>
            {syntaxHint.value}
          </div>
        )}

        {/* 自动补全建议 */}
        {showSuggestions.value && suggestions.value.length > 0 && (
          <div class={ns.e("suggestions")}>
            {suggestions.value.map((item, idx) => (
              <div
                key={item}
                class={[
                  ns.e("suggestion-item"),
                  { [ns.em("suggestion-item", "active")]: idx === activeSuggestionIndex.value },
                ]}
                onClick={() => selectSuggestion(item)}
              >
                {item}
              </div>
            ))}
          </div>
        )}

        {/* 输入区域 */}
        <div class={ns.e("input-area")} onClick={focusInput}>
          <span class={ns.e("prompt")}>{prompt.value}</span>
          <input
            ref={inputRef}
            class={ns.e("input")}
            value={inputValue.value}
            onInput={handleInput}
            onKeydown={handleKeydown}
            placeholder={isExecuting.value ? "executing..." : "Enter Redis command..."}
            disabled={isExecuting.value}
            autocomplete="off"
            spellcheck={false}
          />
        </div>
      </div>
    );
  },
});
