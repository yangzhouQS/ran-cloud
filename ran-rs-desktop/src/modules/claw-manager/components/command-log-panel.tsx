/**
 * 命令日志面板组件
 *
 * 三个子页面（网关管理、系统配置、健康维护）共用的命令日志渲染组件。
 * 接收日志列表和清空回调，统一渲染日志条目。
 *
 * @block ran-command-log
 */

import type { CommandLogEntry } from "../types";
import { Link } from "@element-plus/icons-vue";
import { defineComponent } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";

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

    /** 打开 URL */
    const openUrl = (url: string) => {
      window.open(url, "_blank");
    };

    return () => (
      <div class={ns.b()}>
        {/* 日志头部 */}
        <div class={ns.e("header")}>
          <span class={ns.e("title")}>命令日志</span>
          <el-button size="small" text onClick={props.onClear}>清空</el-button>
        </div>

        {/* 日志列表 */}
        <div class={ns.e("list")}>
          {props.logs.length === 0 && (
            <div class={ns.e("empty")}>暂无执行记录</div>
          )}
          {props.logs.map((log, idx) => (
            <div key={idx} class={[ns.e("item"), !log.success && ns.is("error")]}>
              <div class={ns.e("cmd")}>
                <span class={ns.e("time")}>{log.time}</span>
                <code>$ {log.cmd}</code>
              </div>
              <pre class={ns.e("output")}>{log.output}</pre>
              {log.url && (
                <div class={ns.e("url")}>
                  <el-link
                    type="primary"
                    icon={Link}
                    onClick={() => { openUrl(log.url!); }}
                  >
                    {log.url}
                  </el-link>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  },
});

export default CommandLogPanel;
