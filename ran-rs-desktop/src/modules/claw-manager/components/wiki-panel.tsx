/**
 * 知识库 RAG 管理面板
 *
 * 功能：
 * - 初始化知识库（wiki init）
 * - 查看知识库状态（wiki status）
 * - 批量导入文档（wiki ingest）
 * - 搜索知识库（wiki search）
 * - 命令执行日志
 *
 * @block ran-claw-wiki
 */

import type { WikiSearchResult, WikiStatus } from "../types";
import { Collection, FolderOpened, InfoFilled, Refresh, Search } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { defineComponent, onMounted, reactive, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useCommandExecutor } from "../hooks/use-command-executor";
import CommandLogPanel from "./command-log-panel";
import "./wiki-panel.less";

/** 索引状态颜色映射 */
const indexStatusColorMap: Record<string, string> = {
  ready: "#67c23a",
  indexing: "#e6a23c",
  empty: "#909399",
  error: "#f56c6c",
};

/** 索引状态标签映射 */
const indexStatusLabelMap: Record<string, string> = {
  ready: "就绪",
  indexing: "索引中",
  empty: "空",
  error: "异常",
};

const WikiPanel = defineComponent({
  name: "ClawWikiPanel",
  setup() {
    const ns = useCsNamespace("claw-wiki");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 知识库状态 ----
    const wikiStatus = ref<WikiStatus>({
      initialized: false,
      documentCount: 0,
      indexStatus: "empty",
    });

    // ---- 表单状态（使用 reactive 避免 IDE 自动移除 ref .value） ----
    const formState = reactive({
      ingestPath: "",
      searchKeyword: "",
    });

    // ---- 搜索结果 ----
    const searchResults = ref<WikiSearchResult[]>([]);

    /** 加载知识库状态 */
    const loadStatus = async () => {
      try {
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 500));
        wikiStatus.value = {
          initialized: true,
          documentCount: 42,
          indexStatus: "ready",
          dbPath: "~/.openclaw/wiki/vectors.db",
          lastUpdated: "2026-06-03 12:30:00",
        };
      } catch {
        ElMessage.error("加载知识库状态失败");
      }
    };

    /** 初始化知识库 */
    const handleInit = async () => {
      await execCommand(
        "openclaw wiki init",
        "✓ 知识库初始化成功",
        1200,
      );
      wikiStatus.value = {
        initialized: true,
        documentCount: 0,
        indexStatus: "empty",
        dbPath: "~/.openclaw/wiki/vectors.db",
        lastUpdated: new Date().toLocaleString(),
      };
    };

    /** 批量导入文档 */
    const handleIngest = async () => {
      if (!formState.ingestPath.trim()) {
        ElMessage.warning("请输入文档文件夹路径");
        return;
      }
      const path = formState.ingestPath.trim();
      await execCommand(
        `openclaw wiki ingest ${path}`,
        `✓ 已从 "${path}" 导入文档`,
        2000,
      );
      wikiStatus.value.documentCount += 15;
      wikiStatus.value.indexStatus = "ready";
      wikiStatus.value.lastUpdated = new Date().toLocaleString();
      formState.ingestPath = "";
    };

    /** 搜索知识库 */
    const handleSearch = async () => {
      if (!formState.searchKeyword.trim()) {
        ElMessage.warning("请输入搜索关键词");
        return;
      }
      const keyword = formState.searchKeyword.trim();
      await execCommand(
        `openclaw wiki search "${keyword}"`,
        `✓ 搜索完成，找到相关结果`,
        800,
      );
      // 模拟搜索结果
      searchResults.value = [
        {
          docName: "architecture-overview.md",
          snippet: `...系统采用微服务架构，${keyword}模块负责核心调度...`,
          score: 0.95,
          source: "docs/architecture/",
        },
        {
          docName: "getting-started.md",
          snippet: `...在开始使用${keyword}之前，请确保已安装依赖...`,
          score: 0.87,
          source: "docs/guide/",
        },
        {
          docName: "api-reference.md",
          snippet: `...${keyword}接口支持 RESTful 风格调用...`,
          score: 0.78,
          source: "docs/api/",
        },
      ];
    };

    onMounted(() => {
      loadStatus();
    });

    return () => (
      <div class={ns.b()}>
        {/* 知识库状态 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><InfoFilled /></el-icon>
          <span>知识库状态</span>
          <el-button
            size="small"
            text
            icon={Refresh}
            onClick={loadStatus}
            style={{ marginLeft: "auto" }}
          >
            刷新
          </el-button>
        </div>

        <div class={ns.e("status-card")}>
          <div class={ns.e("status-row")}>
            <span class={ns.e("status-label")}>初始化状态</span>
            <span class={ns.e("status-value")}>
              {wikiStatus.value.initialized ? "✅ 已初始化" : "❌ 未初始化"}
            </span>
          </div>
          <div class={ns.e("status-row")}>
            <span class={ns.e("status-label")}>文档数量</span>
            <span class={ns.e("status-value")}>
              {wikiStatus.value.documentCount}
              {" "}
              篇
            </span>
          </div>
          <div class={ns.e("status-row")}>
            <span class={ns.e("status-label")}>索引状态</span>
            <span
              class={ns.e("status-value")}
              style={{ color: indexStatusColorMap[wikiStatus.value.indexStatus] }}
            >
              {indexStatusLabelMap[wikiStatus.value.indexStatus]}
            </span>
          </div>
          {wikiStatus.value.dbPath && (
            <div class={ns.e("status-row")}>
              <span class={ns.e("status-label")}>向量库路径</span>
              <span class={ns.e("status-value", "mono")}>{wikiStatus.value.dbPath}</span>
            </div>
          )}
          {wikiStatus.value.lastUpdated && (
            <div class={ns.e("status-row")}>
              <span class={ns.e("status-label")}>最后更新</span>
              <span class={ns.e("status-value")}>{wikiStatus.value.lastUpdated}</span>
            </div>
          )}
        </div>

        {/* 初始化 */}
        {!wikiStatus.value.initialized && (
          <>
            <div class={ns.e("section-title")}>
              <el-icon size={16}><Collection /></el-icon>
              <span>初始化知识库</span>
            </div>
            <div class={ns.e("init-section")}>
              <el-button
                type="primary"
                icon={Collection}
                loading={loading.value}
                onClick={handleInit}
              >
                初始化知识库 (wiki init)
              </el-button>
            </div>
          </>
        )}

        {/* 导入文档 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><FolderOpened /></el-icon>
          <span>导入文档</span>
        </div>
        <div class={ns.e("form-row")}>
          <el-input
            size="small"
            v-model={formState.ingestPath}
            placeholder="输入文档文件夹路径（如 ./docs）"
            clearable
            class={ns.e("form-input")}
          >
            {{ prefix: () => <span style={{ color: "#909399", fontSize: "12px" }}>wiki ingest</span> }}
          </el-input>
          <el-button
            size="small"
            type="primary"
            icon={FolderOpened}
            loading={loading.value}
            disabled={!formState.ingestPath.trim()}
            onClick={handleIngest}
          >
            导入
          </el-button>
        </div>

        {/* 搜索知识库 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Search /></el-icon>
          <span>搜索知识库</span>
        </div>
        <div class={ns.e("form-row")}>
          <el-input
            size="small"
            v-model={formState.searchKeyword}
            placeholder="输入搜索关键词"
            clearable
            class={ns.e("form-input")}
            onKeydown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
          >
            {{ prefix: () => <span style={{ color: "#909399", fontSize: "12px" }}>wiki search</span> }}
          </el-input>
          <el-button
            size="small"
            type="primary"
            icon={Search}
            loading={loading.value}
            disabled={!formState.searchKeyword.trim()}
            onClick={handleSearch}
          >
            搜索
          </el-button>
        </div>

        {/* 搜索结果 */}
        {searchResults.value.length > 0 && (
          <div class={ns.e("search-results")}>
            {searchResults.value.map((result, index) => (
              <div key={index} class={ns.e("result-card")}>
                <div class={ns.e("result-header")}>
                  <span class={ns.e("result-doc")}>{result.docName}</span>
                  <el-tag size="small" type="success">
                    {`相关度: ${(result.score * 100).toFixed(0)}%`}
                  </el-tag>
                </div>
                <div class={ns.e("result-snippet")}>{result.snippet}</div>
                {result.source && (
                  <div class={ns.e("result-source")}>
                    来源：
                    {result.source}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 命令日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />
      </div>
    );
  },
});

export default WikiPanel;
