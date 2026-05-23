/**
 * PluginView — 插件 iframe 沙箱组件
 *
 * 承载插件 HTML 视图的 iframe 容器，
 * 通过 postMessage 与插件通信。
 */

import { defineComponent, ref, onMounted, onUnmounted, type PropType } from 'vue';
import { getPluginMessageRouter } from '../services/plugin-message-router';

const PluginView = defineComponent({
  name: 'PluginView',

  props: {
    /** 插件 ID */
    pluginId: {
      type: String,
      required: true,
    },
    /** 视图 ID */
    viewId: {
      type: String,
      required: true,
    },
    /** 入口文件路径 */
    entryPath: {
      type: String,
      required: true,
    },
    /** 当前连接 ID */
    connectionId: {
      type: String as PropType<string | null>,
      default: null,
    },
  },

  setup(props) {
    const iframeRef = ref<HTMLIFrameElement | null>(null);
    const router = getPluginMessageRouter();

    onMounted(() => {
      if (iframeRef.value) {
        router.registerIframe(
          props.pluginId,
          props.viewId,
          props.connectionId ?? '',
          iframeRef.value,
        );
      }
    });

    onUnmounted(() => {
      if (iframeRef.value) {
        router.unregisterIframe(iframeRef.value);
      }
    });

    return () => (
      <iframe
        ref={iframeRef}
        src={`plugin://${props.pluginId}/${props.entryPath}`}
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    );
  },
});

export default PluginView;
