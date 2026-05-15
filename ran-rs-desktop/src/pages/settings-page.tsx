import { defineComponent, ref } from 'vue';
import { Setting, InfoFilled } from '@element-plus/icons-vue';

const SettingsPage = defineComponent({
  name: 'SettingsPage',
  setup() {
    const theme = ref('light');
    const language = ref('zh-CN');

    return () => (
      <div class="standalone-page">
        <div class="standalone-page-header">
          <h1 class="standalone-page-title">
            <el-icon style={{ marginRight: '8px', verticalAlign: 'middle' }}>
              <Setting />
            </el-icon>
            设置
          </h1>
        </div>
        <div class="standalone-page-body">
          <div class="settings-section">
            <h3 class="settings-section-title">通用设置</h3>
            <div class="settings-item">
              <div class="settings-item-content">
                <span class="settings-item-label">主题</span>
                <span class="settings-item-desc">应用界面主题</span>
              </div>
              <el-select v-model={theme.value} size="small" style={{ width: '120px' }} disabled>
                <el-option label="浅色" value="light" />
                <el-option label="深色" value="dark" />
              </el-select>
            </div>
            <el-divider />
            <div class="settings-item">
              <div class="settings-item-content">
                <span class="settings-item-label">语言</span>
                <span class="settings-item-desc">界面显示语言</span>
              </div>
              <el-select v-model={language.value} size="small" style={{ width: '120px' }} disabled>
                <el-option label="简体中文" value="zh-CN" />
                <el-option label="English" value="en" />
              </el-select>
            </div>
          </div>

          <div class="settings-section">
            <h3 class="settings-section-title">Kubernetes</h3>
            <div class="settings-item">
              <div class="settings-item-content">
                <span class="settings-item-label">默认命名空间</span>
                <span class="settings-item-desc">连接时默认使用的命名空间</span>
              </div>
              <el-tag>dev-mc</el-tag>
            </div>
            <el-divider />
            <div class="settings-item">
              <div class="settings-item-content">
                <span class="settings-item-label">Telepresence 版本</span>
                <span class="settings-item-desc">当前安装的版本</span>
              </div>
              <el-tag type="info">检测中...</el-tag>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-placeholder">
              <el-icon size={32} color="#c0c4cc">
                <InfoFilled />
              </el-icon>
              <p>更多设置功能开发中...</p>
            </div>
          </div>
        </div>
      </div>
    );
  },
});

export default SettingsPage;
