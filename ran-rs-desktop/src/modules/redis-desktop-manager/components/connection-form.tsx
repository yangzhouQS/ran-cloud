/**
 * 连接表单对话框组件
 *
 * 新建/编辑 Redis 连接配置的表单对话框。
 * 支持基础连接参数配置（高级选项 SSH/Sentinel/Cluster/TLS 暂为占位）。
 *
 * @block ran-connection-form
 */

import type { PropType } from "vue";
import type { ConnectionConfig } from "../types";
import { defineComponent, reactive, ref, watch } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
// UUID 生成使用浏览器原生 crypto.randomUUID()

const ConnectionForm = defineComponent({
  name: "ConnectionForm",
  props: {
    visible: { type: Boolean, required: true },
    connectionId: { type: String as PropType<string | null>, default: null },
    connections: { type: Array as PropType<ConnectionConfig[]>, default: () => [] },
    onSave: { type: Function as PropType<(config: ConnectionConfig) => Promise<void>>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props, { emit }) {
    const ns = useCsNamespace("connection-form");
    const formRef = ref();
    const loading = ref(false);

    // 表单数据
    const form = reactive<ConnectionConfig>({
      id: "",
      name: "",
      host: "127.0.0.1",
      port: 6379,
      password: "",
      db: 0,
      separator: ":",
      color: "",
    });

    // 表单验证规则
    const rules = {
      name: [{ required: true, message: "请输入连接名称", trigger: "blur" }],
      host: [{ required: true, message: "请输入主机地址", trigger: "blur" }],
      port: [{ required: true, message: "请输入端口号", trigger: "blur" }],
    };

    // 监听 connectionId 变化，填充表单
    watch(
      () => [props.visible, props.connectionId],
      ([visible, connectionId]) => {
        if (visible) {
          if (connectionId) {
            const existing = props.connections.find(c => c.id === connectionId);
            if (existing) {
              Object.assign(form, { ...existing });
            }
          } else {
            // 新建模式：重置表单
            Object.assign(form, {
              id: crypto.randomUUID(),
              name: "",
              host: "127.0.0.1",
              port: 6379,
              password: "",
              db: 0,
              separator: ":",
              color: "",
            });
          }
        }
      },
      { immediate: true },
    );

    /** 提交表单 */
    const handleSubmit = async () => {
      try {
        await formRef.value?.validate();
      } catch {
        return;
      }

      loading.value = true;
      try {
        await props.onSave({ ...form });
      } finally {
        loading.value = false;
      }
    };

    /** 取消 */
    const handleCancel = () => {
      props.onClose();
    };

    return () => (
      <el-dialog
        modelValue={props.visible}
        title={props.connectionId ? "编辑连接" : "新建连接"}
        width={520}
        onClose={handleCancel}
        destroyOnClose
        v-slots={{
          footer: () => (
            <div>
              <el-button onClick={handleCancel}>取消</el-button>
              <el-button type="primary" loading={loading.value} onClick={handleSubmit}>
                {props.connectionId ? "保存" : "创建"}
              </el-button>
            </div>
          ),
        }}
      >
        <el-form
          ref={formRef}
          model={form}
          rules={rules}
          labelWidth="100px"
          labelPosition="right"
          size="default"
        >
          <el-form-item label="连接名称" prop="name">
            <el-input v-model={form.name} placeholder="例如：本地开发" />
          </el-form-item>

          <el-form-item label="主机地址" prop="host">
            <el-input v-model={form.host} placeholder="127.0.0.1" />
          </el-form-item>

          <el-form-item label="端口" prop="port">
            <el-input-number
              v-model={form.port}
              min={1}
              max={65535}
              controls={false}
              style={{ width: "100%" }}
            />
          </el-form-item>

          <el-form-item label="密码">
            <el-input
              v-model={form.password}
              type="password"
              showPassword
              placeholder="可选"
            />
          </el-form-item>

          <el-form-item label="默认 DB">
            <el-input-number
              v-model={form.db}
              min={0}
              max={15}
              controls={false}
              style={{ width: "100%" }}
            />
          </el-form-item>

          <el-form-item label="分隔符">
            <el-input v-model={form.separator} placeholder=":" />
          </el-form-item>

          <el-form-item label="标记颜色">
            <el-color-picker v-model={form.color} showAlpha={false} />
          </el-form-item>
        </el-form>

      </el-dialog>
    );
  },
});

export default ConnectionForm;
