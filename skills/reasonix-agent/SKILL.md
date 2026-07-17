---
name: reasonix-agent
description: >-
  Reasonix 直连接入 Skill。三种接入方式：(1) `reasonix_open` 打开原生 Web UI，直接跟 Reasonix 对话，无需经过 Operit AI；(2) `reasonix_ask` 通过 HTTP API 直接问答；(3) `reasonix_task` 通过 HTTP API 执行复杂任务。
  适用于：代码开发、调试、架构设计、技术问答、代码审查等。
  注意：当用户说"打开 reasonix"、"直接跟 reasonix 聊"、"reasonix 对话"时优先用 `reasonix_open`（最直接）；说"reasonix 帮我做X"可用 `reasonix_ask`/`reasonix_task`（API 直连）。
---

# Reasonix 直连接入 Skill

## 架构说明

```
┌──────────────────────────────────────────────────────┐
│  Operit 平台                                          │
│                                                       │
│  ┌─ reasonix_bridge 插件 ──────────────────────────┐ │
│  │                                                  │ │
│  │  reasonix_open ───→ 打开浏览器 ──→ ┌────────┐  │ │
│  │                                    │Reasonix│  │ │
│  │  reasonix_ask  ───→ HTTP POST ──→ │ Serve  │  │ │
│  │                    /submit +       │:8787   │  │ │
│  │  reasonix_task ───→ /history  ──→ │ Web UI │  │ │
│  │                                    └────────┘  │ │
│  │  (无需经过 Operit AI 转述)                       │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**两种模式任选：**
| 模式 | 工具 | 特点 |
|------|------|------|
| 🏠 **浏览器直连** | `reasonix_open` | 打开 Reasonix 原生 Web UI，直接对话，**完全不经我手** |
| 🔌 **API 直连** | `reasonix_ask` / `reasonix_task` | 在 Operit 内通过 HTTP API 直调，返回原始回答，无中间转述 |

## 工作流程

### 1. 激活条件

当用户出现以下意图时，自动激活本 Skill：
- 明确提到 "reasonix" 并要求处理任务
- 说 "打开 reasonix"、"直接跟 reasonix 聊" → **优先用 `reasonix_open`**
- 说 "让 reasonix 看看"、"reasonix 帮我做X" → 用 `reasonix_ask`/`reasonix_task`
- 想要获得独立的、来自另一个 AI 模型的代码审查或技术意见

### 2. 执行步骤

1. **激活 reasonix_bridge 包**（如未激活）
   ```
   use_package("reasonix_bridge")
   ```

2. **安装检测**：插件自动检测 reasonix 是否已安装。
   - **已安装** → 自动启动 reasonix serve（后台 HTTP 服务 :8787）
   - **未安装** → 返回 `notInstalled: true`，引导执行 `npm i -g reasonix`

3. **选择接入方式**：

   **🏠 浏览器直连（最直接，无中间人）：**
   ```
   reasonix_open()
   ```
   → 设备浏览器自动打开 Reasonix 原生聊天界面
   → 用户直接与 Reasonix 对话，输入输出全由 Reasonix 处理
   → 无需 Operit AI 参与

   **🔌 API 直连（在 Operit 内使用）：**
   - **简单问答**：`reasonix_ask({ query: "问题" })`
     - 返回 Reasonix 原始回答，无额外包装
   - **复杂任务**：`reasonix_task({ task: "任务描述", timeoutMs: 180000 })`
     - 适合代码实现、重构、审查等
   - 后台自动完成：`POST /submit` 提交 → 轮询 `/history` 取结果

4. **获取结果后**：直接展示 Reasonix 的原始回答，AI 不添加转述或包装。

### 3. 版本更新检查

每次调用 `reasonix_ask`/`reasonix_task` 时自动检查更新（每天最多一次）。
- **已是最新版** → 正常返回
- **发现新版本** → 返回 `updateAvailable: true`，AI 询问用户是否执行 `reasonix upgrade --force`

### 4. 完整安装与配置流程（从零开始）

#### 4.1 安装 Reasonix

```bash
# 确保已安装 Node.js（>=18）
node --version

# 全局安装 reasonix
npm i -g reasonix

# 验证安装
reasonix --version
```

#### 4.2 配置 API Key

```bash
# 创建配置目录
mkdir -p ~/.reasonix

# 写入 API Key（请替换为你的实际 Key）
echo 'YOUR_API_KEY=your-api-key-here' > ~/.reasonix/.env
```

#### 4.3 关闭 Sandbox（可选，缺 bwrap 时需要）

编辑 `~/.reasonix/config.toml`，将 `sandbox.bash` 设为 `"off"`：

```toml
[sandbox]
bash = "off"
```

#### 4.4 注入环境变量

```bash
echo 'source ~/.reasonix/.env' >> ~/.bashrc
```

#### 4.5 验证

```bash
reasonix doctor
# 应显示 key_present: true ✓
```

### 5. 更新 Reasonix

```bash
# 检查更新
reasonix upgrade --check

# 确认后执行更新
reasonix upgrade --force
```

更新后 `.env` 凭据不受影响。

### 6. 注意事项

- `reasonix_open` 会在设备浏览器中打开 Reasonix Web UI（`http://127.0.0.1:8787/`），这是最直接的对话方式
- `reasonix_ask`/`reasonix_task` 通过 HTTP API 直连，返回 Reasonix 的原始回答，无中间包装
- 插件首次调用时会自动在后台启动 `reasonix serve`，保持常驻
- API Key、模型选择等由 reasonix serve 内部配置决定，无需在工具参数中传入

## 示例

**用户说**："打开 reasonix"
→ 调用 `reasonix_open()` → 浏览器打开 Reasonix 原生界面

**用户说**："reasonix 帮我审查这段代码"
→ 调用 `reasonix_ask({ query: "代码审查：..." })` → 返回 Reasonix 原始审查结果

**用户说**："reasonix，实现一个 RESTful API"
→ 调用 `reasonix_task({ task: "实现一个 RESTful API"，timeoutMs: 180000 })` → 返回 Reasonix 原始实现结果