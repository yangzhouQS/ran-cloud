/**
 * 命令日志面板组件
 *
 * 所有 claw-manager 子页面共用的命令日志渲染组件。
 * 接收日志列表和清空回调，统一渲染日志条目。
 *
 * 优化点：
 * - 终端风格布局，视觉层次清晰
 * - 成功/失败/执行中 三态图标区分
 * - 输出区域可折叠展开
 * - 自动滚动到最新日志
 * - 暗黑主题适配
 *
 * @block ran-claw-command-log
 */

import type { CommandLogEntry } from "../types";
import { Delete, Link } from "@element-plus/icons-vue";
import { defineComponent, nextTick, reactive, ref, watch } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import "./command-log-panel.less";

const CommandLogPanel = defineComponent({
  name: "ClawCommandLogPanel",

  props: {
    /** 日志条目列表 */
    logs: {
      type: Array as () => CommandLogEntry[],
      required: true,
    },
    /** 清空日志回调 */
    onClear: {
      type: Function as () => () => void,
      required: true,
    },
  },

  setup(props) {
    const ns = useCsNamespace("claw-command-log");
    const listRef = ref<HTMLElement | null>(null);

    // ---- 折叠状态 ----
    const collapseState = reactive<Record<number, boolean>>({});

    /** 切换日志条目折叠 */
    const toggleCollapse = (idx: number) => {
      collapseState[idx] = !collapseState[idx];
    };

    // ---- 自动滚动到最新日志 ----
    watch(
      () => props.logs.length,
      () => {
        nextTick(() => {
          if (listRef.value) {
            listRef.value.scrollTop = listRef.value.scrollHeight;
          }
        });
      },
    );

    /** 打开 URL */
    const openUrl = (url: string) => {
      window.open(url, "_blank");
    };

    /** 获取状态图标 */
    const renderStatusIcon = (log: CommandLogEntry) => {
      if (!log.success && log.output === "执行中...") {
        // 执行中 — 旋转动画
        return (
          <span class={[ns.e("status-icon"), ns.is("loading")]}>
            <svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor">
              <path d="M512 64a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V96a32 32 0 0 1 32-32zm0 640a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V736a32 32 0 0 1 32-32zM196 196a32 32 0 0 1 45.25 0l135.77 135.76a32 32 0 0 1-45.25 45.26L196 241.25A32 32 0 0 1 196 196zm451.2 451.2a32 32 0 0 1 45.25 0L828 782.76a32 32 0 0 1-45.25 45.25L647.2 692.45a32 32 0 0 1 0-45.25zM64 512a32 32 0 0 1 32-32h192a32 32 0 0 1 0 64H96a32 32 0 0 1-32-32zm640 0a32 32 0 0 1 32-32h192a32 32 0 0 1 0 64H736a32 32 0 0 1-32-32zM196 828a32 32 0 0 1 0-45.25l135.76-135.76a32 32 0 0 1 45.26 45.25L241.25 828A32 32 0 0 1 196 828zm451.2-451.2a32 32 0 0 1 0-45.25L782.76 196a32 32 0 0 1 45.25 45.25L692.45 376.8a32 32 0 0 1-45.25 0z" />
            </svg>
          </span>
        );
      }
      if (log.success) {
        // 成功 — 绿色对勾
        return (
          <span class={[ns.e("status-icon"), ns.is("success")]}>
            <svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor">
              <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 0 1-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.3 0 19.9 5 25.9 13.3l71.2 99.6 157.2-218c6-8.4 15.7-13.3 25.9-13.3H699c6.5 0 9.9 7.4 6.5 12.7z" />
            </svg>
          </span>
        );
      }
      // 失败 — 红色叉号
      return (
        <span class={[ns.e("status-icon"), ns.is("error")]}>
          <svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor">
            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-66-.3L512 563.4l-99.4 118.5-66 .3c-4.4 0-8-3.5-8-8 0-1.9.7-3.7 1.9-5.2l130.1-155L340.5 358.2a8.12 8.12 0 0 1-1.9-5.2c0-4.4 3.6-8 8-8l66 .3L512 463.6l99.4-118.4 66-.3c4.4 0 8 3.5 8 8 0 1.9-.7 3.7-1.9 5.2L553.5 514l130.1 155c1.2 1.5 1.9 3.3 1.9 5.2 0 4.4-3.6 8-8 8z" />
          </svg>
        </span>
      );
    };

    return () => (
      <div class={ns.b()}>
        {/* 终端风格头部 */}
        <div class={ns.e("header")}>
          <div class={ns.e("header-left")}>
            {/* 终端三点装饰 */}
            <div class={ns.e("terminal-dots")}>
              <span class={ns.e("dot", ["red"])} />
              <span class={ns.e("dot", ["yellow"])} />
              <span class={ns.e("dot", ["green"])} />
            </div>
            <span class={ns.e("title")}>命令日志</span>
            {props.logs.length > 0 && (
              <el-tag size="small" round class={ns.e("count-badge")}>
                {props.logs.length}
              </el-tag>
            )}
          </div>
          <el-button
            size="small"
            text
            icon={Delete}
            disabled={props.logs.length === 0}
            onClick={props.onClear}
          >
            清空
          </el-button>
        </div>

        {/* 日志列表 */}
        <div ref={listRef} class={ns.e("list")}>
          {props.logs.length === 0 && (
            <div class={ns.e("empty")}>
              <svg viewBox="0 0 1024 1024" width="48" height="48" fill="currentColor" opacity="0.15">
                <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zm-40 728H184V184h656v656zM492 400h184c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H492c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8zm0 144h184c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H492c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8zm0 144h184c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H492c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8zM340 368a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 144a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 144a40 40 0 1 0 80 0 40 40 0 1 0-80 0z" />
              </svg>
              <span>暂无执行记录</span>
            </div>
          )}
          {props.logs.map((log, idx) => {
            const isExpanded = collapseState[idx] !== false; // 默认展开
            const isLoading = !log.success && log.output === "执行中...";
            const outputLines = log.output.split("\n");
            const hasLongOutput = outputLines.length > 3;

            return (
              <div
                key={`${log.time}-${idx}`}
                class={[
                  ns.e("item"),
                  ns.is(log.success ? "success" : "error"),
                  isLoading && ns.is("loading"),
                ]}
              >
                {/* 命令行 — 点击可折叠输出 */}
                <div
                  class={ns.e("cmd-row")}
                  onClick={() => {
                    toggleCollapse(idx);
                  }}
                >
                  {renderStatusIcon(log)}
                  <code class={ns.e("cmd-text")}>
                    $
                    {log.cmd}
                  </code>
                  <span class={ns.e("cmd-time")}>{log.time}</span>
                  {/* 折叠箭头 */}
                  {hasLongOutput && (
                    <span class={[ns.e("collapse-arrow"), isExpanded && ns.is("expanded")]}>
                      <svg viewBox="0 0 1024 1024" width="12" height="12" fill="currentColor">
                        <path d="M340.8 309.6c-10.4-10.4-10.4-27.2 0-37.6s27.2-10.4 37.6 0l288 288c10.4 10.4 10.4 27.2 0 37.6l-288 288c-10.4 10.4-27.2 10.4-37.6 0s-10.4-27.2 0-37.6L600 540.8 340.8 309.6z" />
                      </svg>
                    </span>
                  )}
                </div>

                {/* 输出区域 */}
                {isExpanded && (
                  <div class={ns.e("output-wrapper")}>
                    <pre class={ns.e("output")}>{log.output}</pre>
                    {/* 可点击 URL */}
                    {log.url && (
                      <div
                        class={ns.e("url-row")}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <el-link
                          type="primary"
                          icon={Link}
                          onClick={() => {
                            openUrl(log.url!);
                          }}
                        >
                          {log.url}
                        </el-link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});

export default CommandLogPanel;
