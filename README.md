# ZERO7

[![CI](https://github.com/visualfc/zero7/actions/workflows/ci.yml/badge.svg)](https://github.com/visualfc/zero7/actions/workflows/ci.yml)
[![codecov](https://codecov.io/github/visualfc/zero7/graph/badge.svg?token=LMDDHGZNPV)](https://codecov.io/github/visualfc/zero7)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

ZERO7 是面向象棋初学者与普通爱好者的开源 AI 语音象棋伙伴。它将自然语音、确定性的象棋规则和 AI 棋力结合在一起，让用户可以直接说出走法、获得分级提示、完成专项训练，并与 AI 进行完整对局。

> 当前版本已支持语音训练、语音人机对战与 Pikafish 正式棋力。

## 棋盘预览

![ZERO7 人机对战棋盘](./docs/images/board-desktop.png)

## 产品定位

ZERO7 包含两个核心模式：

### 训练模式

- 棋子规则与基础棋理
- 残局闯关
- 分级提示
- 语音走棋
- 常见语音同音纠错
- 针对关键一步的自然语言讲解

### 人机对战

当前对战能力包括：

- 标准 32 子开局与完整象棋规则
- 用户执红、ZERO7 执黑
- Pikafish 正式棋力引擎
- 入门、初级和中级三档棋力
- Pikafish 不可用时自动降级为基础 AI
- 点击走棋与中文棋谱语音走棋
- 点击展开当前局面胜负概率和推荐走法
- 语音讲解推荐走法的怎么走与原因，不代替用户落子
- 每回合主动语音播报和简短讲解
- 对局结束或认输后的语音复盘
- 将军、将死、困毙与和棋判断
- 认输、悔棋和重新开局
- 中文棋谱

后续将增加红黑方选择、对局计时、更强棋力和局后语音复盘。

## 当前功能

- ZERO7 中文响应式界面
- 三道规则正确的象棋训练关卡
- 车、炮、马的基础规则校验
- 标准棋谱与常见语音误识别纠正
- 灵矽实时语音识别
- 浏览器麦克风采集与 `16 kHz PCM16` 音频流
- 灵矽凭证服务端代理，凭证不会进入浏览器
- OTA 自动获取 WebSocket Token
- 三层渐进式提示
- 训练完成反馈和成长记录界面
- 桌面端、平板和手机响应式布局

## 技术架构

```text
用户语音
  ↓
浏览器录音（16 kHz / PCM16）
  ↓
ZERO7 本地安全桥接服务
  ↓
灵矽 WebSocket（ASR / LLM / TTS）
  ↓
语音棋谱解析
  ↓
象棋规则与训练关卡
  ↓
棋盘更新与语音反馈
```

分工原则：

- 象棋规则引擎决定走法是否合法、棋局状态和胜负；
- AI 负责理解自然语言、生成提示和解释棋理；
- 灵矽负责实时语音识别、智能体对话和语音合成；
- ZERO7 桥接服务负责安全保管设备凭证。

## 配置灵矽

### 1. 创建本地配置

```bash
cp .env.example .env
```

设备已绑定时，只需保留：

```dotenv
LINXI_DEVICE_ID=已绑定设备的MAC地址
LINXI_CLIENT_ID=软件客户端的固定UUID
LINXI_USE_OTA=true
```

`.env` 已被 Git 忽略。请勿提交 Device-Id、Client-Id、Token、API Key 或其他凭证。

### 2. 配置智能体

在[灵矽控制台](https://xrobo.qiniu.com/)中将智能体设置为 ZERO7 象棋教练：

- 名称：`ZERO7`
- 助手昵称：`零七`
- 对话语言：中文
- 回复风格：简短、友好、清楚
- 面向对象：象棋初学者与普通爱好者
- 联网搜索和无关 MCP：关闭

智能体只负责语言交互和棋理解释。棋盘事实与合法性由应用规则引擎提供；信息不足时不应猜测局面。

## 安装 Pikafish

ZERO7 通过本地独立进程调用 Pikafish，不在仓库中分发引擎二进制和 NNUE 权重。

默认目录结构：

```text
.local/pikafish/
├── pikafish
├── pikafish.nnue
└── WEIGHTS-LICENSE.txt
```

macOS Apple Silicon 用户应选择 ARM64 版本，并设置执行权限：

```bash
chmod +x .local/pikafish/pikafish
```

如果文件位于其他位置，可以在 `.env` 中设置：

```dotenv
PIKAFISH_PATH=/absolute/path/to/pikafish
PIKAFISH_MODEL=/absolute/path/to/pikafish.nnue
```

运行后可以检查状态：

```bash
curl http://127.0.0.1:8787/api/pikafish/status
```

成功响应示例：

```json
{
  "available": true,
  "name": "Pikafish 2026-01-31",
  "binary": "pikafish"
}
```

Pikafish 源代码采用 GPL-3.0。NNUE 权重可能带有额外授权条件；当前导入权重明确限制未经许可的商业使用。请阅读下载包中的协议。ZERO7 不会将二进制、模型或本地协议文件提交到 Git。

## 本地运行

要求安装 Node.js 22 或兼容版本。

```bash
npm install
npm run dev
```

该命令会同时启动：

- ZERO7 网页：终端显示的 Vite 地址，通常为 `http://localhost:5173/`；
- 灵矽桥接服务：`http://127.0.0.1:8787`。

首次使用语音时，浏览器会请求麦克风权限。

## 常用命令

```bash
npm run dev          # 同时启动网页与灵矽桥接服务
npm run dev:web      # 只启动网页
npm run dev:bridge   # 只启动灵矽桥接服务
npm run build        # 类型检查并构建生产版本
npm run lint         # 运行静态检查
npm test             # 运行自动化测试
npm run test:coverage # 运行测试并生成覆盖率报告
npm run preview      # 预览生产构建
```

## 训练模式操作

在首页选择任一训练关卡，可以通过两种方式完成：

1. 点击棋子和目标位置；
2. 点击“按下说走法”，说出标准棋谱，说完后再次点击。

当前示例走法：

```text
炮五进五
车一平五
马三进四
```

系统能够纠正常见同音识别结果，例如“跑五进五”“车衣平五”和“马山进四”。

## 测试与覆盖率

每次推送到 `main` 或创建 Pull Request 时，GitHub Actions 会自动执行：

- 依赖安装；
- 静态检查；
- 前端测试；
- Pikafish UCI 协议测试；
- V8 代码覆盖率；
- 生产构建。

本地生成报告：

```bash
npm run test:coverage
open coverage/index.html
```

GitHub Actions 的任务摘要会显示覆盖率表格，并保留 14 天的 `coverage-report` HTML 报告 Artifact。覆盖率同时上传到 Codecov，README 顶部的 Coverage 徽章会显示 `main` 分支的实时覆盖率；Pull Request 中会显示改动覆盖率和文件差异。

## 路线图

- [x] 灵矽实时语音识别
- [x] 灵矽设备鉴权与 OTA Token
- [x] 基础语音棋谱纠错
- [x] 三道训练关卡
- [x] 车、炮、马基础规则校验
- [x] 播放灵矽原始 TTS 音频
- [x] 语音分级提示
- [x] 完整中国象棋规则引擎
- [x] 基础 AI 人机对战
- [x] Pikafish 正式棋力引擎
- [x] 三档棋力与基础 AI 降级
- [x] 对战语音走棋与主动讲解
- [x] 棋谱与局后语音复盘
- [ ] 本地学习进度与错题记录
- [ ] 可扩展训练题库

## 开源协议

项目源代码采用 [Apache License 2.0](./LICENSE)。灵矽服务、第三方依赖，以及单独引入的音色、图片、棋力引擎和题库遵循各自的服务条款或授权协议。

欢迎提交 Issue、训练题目、规则测试、语音纠错样本和代码贡献。
