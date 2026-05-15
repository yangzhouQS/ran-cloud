import { defineComponent } from 'vue';
import { Monitor } from '@element-plus/icons-vue';

const AboutPage = defineComponent({
  name: 'AboutPage',
  setup() {
    return () => (
      <div class="standalone-page">
        <div class="standalone-page-header">
          <h1 class="standalone-page-title">
            <el-icon style={{ marginRight: '8px', verticalAlign: 'middle' }}>
              <Monitor />
            </el-icon>
            关于
          </h1>
        </div>
        <div class="standalone-page-body about-page">
          <div class="about-logo-large">
            <el-icon size={64} color="#667eea">
              <Monitor />
            </el-icon>
          </div>
          <h2 class="about-app-name">Ran RS Desktop</h2>
          <p class="about-app-version">版本 0.1.0</p>
          <el-divider />
          <div class="about-info-list">
            <div class="about-info-row">
              <span class="about-info-label">技术栈</span>
              <span class="about-info-value">Tauri 2 + Vue 3 + Element Plus + Rsbuild</span>
            </div>
            <div class="about-info-row">
              <span class="about-info-label">功能</span>
              <span class="about-info-value">Kubernetes 本地开发连接管理工具</span>
            </div>
            <div class="about-info-row">
              <span class="about-info-label">核心依赖</span>
              <span class="about-info-value">Telepresence CLI</span>
            </div>
          </div>
          <el-divider />
          <p class="about-copyright">© 2026 Ran RS Desktop</p>
        </div>
      </div>
    );
  },
});

export default AboutPage;
