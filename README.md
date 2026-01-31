# Kite-Drive 黑客松展示整合说明

> 目标：仅做**可演示的前端界面 + 后端交互链路**，突出“自动驾驶车辆自动预约车位 + 自动支付”的端到端体验。

## 需求总结（来自你的描述）
- 主题：自动驾驶车自动预定停车位并自动停车，避免等待寻找并支付车位的复杂流程。
- 约束：黑客松展示，**只需前端可视化 + 后端交互**，不要求完整产品化。
- 赛道：支付赛道，主办方是 Kite-AI，已接入其 API（支付 + LLM）。

## 当前结构与进展（基于扫描结果）
### 1) `前端-demo/`
- `main.html` 是一个纯前端视频演示页面，内含 4 段 mp4 视频并通过按钮触发视频序列。
- 当前**没有**与后端交互（没有调用 `/reserve` API）。

### 2) `Kite-Drive-main/`（后端/Agent）
- `agent-service.js` 提供 `POST /reserve` 接口：
  - 读取 `data/scenarios.json` 与 `data/parking_spots.json`。
  - 规则引擎选择车位（`agent.js`）。
  - 通过 `llm.js` 调用 LLM 生成可展示的解释（使用 DashScope API）。
  - 通过 `pay.js` 调用 GoKite AA SDK 发起支付。
- 这是**最接近完整链路**的一份代码（决策 + LLM解释 + 支付）。
- 注意：`.env` 里包含私钥与 API Key（敏感信息）。

### 3) `kite-payment/`
- 独立的 GoKite AA 支付工具，包含转账与提现完整流程（CLI）。
- 提供自动充值、自动提现、动态手续费估算等更完整的支付逻辑。
- 但当前与 `Kite-Drive-main` 未衔接。

### 4) 其他
- `项目介绍.md` 为空。
- `Kite-Drive-main/进展.txt` 为空。

## 我发现的问题/割裂点
- 前端演示页**没有接入**后端 `/reserve`；目前只是视频切换。
- 后端已有完整链路，但**支付逻辑较简化**（固定 `amountKite`），与 `kite-payment` 的高级逻辑未融合。
- 介绍/进展文档为空，导致整体叙事与分工进展难以快速对齐。
- `.env` 暴露私钥和 API Key，展示时有安全风险。

## 整合思路（面向黑客松演示）
### 方案 A：Vercel 一体部署（当前已落地）
- **单仓库 + 单域名部署**：前端静态资源 + 后端 Serverless Function 同时部署到 Vercel。
- 做法：
  1. 前端放入 `public/`，按钮点击调用同域 `/api/reserve`。
  2. 后端接口改为 `api/reserve.js`（Vercel Function），复用 `Kite-Drive-main` 的 agent + LLM + 支付逻辑。
  3. 依赖在根目录 `package.json` 统一安装，Vercel 构建自动完成。
- 好处：**一键部署、一键访问**，最适合黑客松展示。

### 方案 B：统一成一个“本地演示服务”
- 使用一个本地 Node 服务同时托管前端与 `/reserve` API。
- 适合线下 demo，部署复杂度略高于方案 A。

### 方案 C：整合成统一项目结构（长期/扩展）
- 做一个 monorepo 或 workspace：
  - `apps/web`（前端）
  - `apps/agent`（后端）
  - `packages/payment`（支付能力模块，抽成可复用库）
- 可考虑 **“npx 库”** 作为支付演示工具，但对于当前黑客松展示价值不大，反而增加打包工作量。

## 建议的演示闭环（面向评委）
1. 进入 UI，点击“预定车位停车”。
2. 前端调用 `/reserve`，显示：
   - 选中的车位信息
   - LLM 解释（为什么选择）
   - 支付成功与交易 hash
3. 视频序列继续播放，视觉上显示“车已自动入库”。

## Vercel 一体部署说明
### 已完成的结构
- `public/`：前端静态页面与视频资源
- `api/reserve.js`：后端 API（Vercel Serverless Function）
- `vercel.json`：函数资源配置
- `.vercelignore`：忽略私钥与无关目录

### 环境变量（在 Vercel 项目设置里配置）
- `PRIVATE_KEY`
- `DASHSCOPE_API_KEY`
- `TO_ADDRESS`（如果后端支付逻辑需要）

### 部署步骤（Vercel）
1. `vercel` 登录并关联项目
2. 在 Vercel 控制台配置环境变量
3. `vercel --prod` 一键部署

## 本地快速测试（无需 Vercel）
1. 设置环境变量（建议使用 `.env` 或 export）
2. 运行：`npm run local`
3. 访问：http://localhost:3000

## 需要你确认的问题
1. 你们希望 UI 上展示哪些字段？（比如 ETA、成本、LLM 解释、支付 hash、Explorer 链接）
2. 是否需要把 `kite-payment` 的自动充值/提现逻辑融合到 `Kite-Drive-main/pay.js`？
3. 展示时是否允许用测试网私钥？还是需要我帮你改成“假支付/模拟支付”模式？

---

如果你确定方向，我可以开始做整合实现（例如方案 A/B），并补齐 `项目介绍.md` 与 `进展.txt`。
