# 零七 ZERO7

[![CI](https://github.com/visualfc/zero7/actions/workflows/ci.yml/badge.svg)](https://github.com/visualfc/zero7/actions/workflows/ci.yml)
[![codecov](https://codecov.io/github/visualfc/zero7/graph/badge.svg?token=LMDDHGZNPV)](https://codecov.io/github/visualfc/zero7)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

零七（ZERO7）是面向象棋初学者与普通爱好者的开源 AI 语音象棋伙伴。它将自然语音、确定性的象棋规则和 AI 棋力结合在一起，让用户可以直接说出走法、获得分级提示、完成专项训练，并与 AI 进行完整对局。

> 当前版本已支持语音训练、语音人机对战、走子路径、吃子动画与 Pikafish 正式棋力。

## 棋盘预览

![零七人机对战棋盘](./docs/images/board-desktop.png)

## 产品定位

零七包含两个核心模式：

### 训练模式

- 10,640 道练习题：Wukong 一步杀至 N 步杀与棋弈江湖残局
- 训练页使用杀棋类型和题号双下拉菜单，残局页支持选择具体残局题
- 红方先行与黑方先行局面
- 分级提示与独立语音朗读
- 点击走棋、按钮语音和空格语音走棋
- 训练和残局显示最近一步走子路径，朗读用户走法后等待 2 秒，再执行并朗读引擎应手
- 重新练习、随时跳过与连续练习
- 用户走其他合法着时由 Pikafish 应对并继续棋局
- 本地规则与 Pikafish 共同确认将死后播报“绝杀”
- 常见语音同音纠错

### 人机对战

当前对战能力包括：

- 标准 32 子开局与完整象棋规则
- 用户执红、零七执黑
- Pikafish 正式棋力引擎
- 入门、初级和中级三档棋力
- Pikafish 不可用时自动降级为基础 AI
- 点击走棋与中文棋谱语音走棋
- 全局语音指令：进入训练、人机对战、提示、悔棋、重开、认输和复盘控制
- 点击展开当前局面胜负概率和推荐走法
- 语音讲解推荐走法的怎么走与原因，不代替用户落子
- 每回合主动语音播报和简短讲解
- 红方语音播放完成后，零七等待 2 秒再走黑方
- 红黑双方统一的走子、吃子和将军讲解
- 吃子时播报具体棋子名称
- 最近一步走子路径和吃子动画
- 对局结束或认输后的语音复盘
- 将军、将死、困毙与和棋判断
- 认输、悔棋和重新开局
- 中文棋谱

后续将增加对局计时、本地学习进度、错题记录和更多经过验证的训练题型。

## 当前功能

详细的系统架构、语音时序、对战规则和安全边界请参阅：[设计文档](./docs/design.md)。全局语音指令和上下文路由请参阅：[语音指令设计](./docs/voice-commands.md)。

- 零七中文响应式界面
- 10,640 道 Wukong 与棋弈江湖练习题
- 训练与残局页面都可以选择具体题目
- JSON 源数据、SQLite 运行时题库和分页查询 API
- ChessDB 离线校验报告导入流程
- 完整象棋合法着、应手与将死校验
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
HTTPS 浏览器录音（16 kHz / PCM16）
  ↓
零七本地安全桥接服务
  ↓
灵矽 WebSocket（ASR / LLM / TTS）
  ↓
语音棋谱解析
  ↓
SQLite 题库 API 与象棋规则
  ↓
Pikafish 应手 / 绝杀复核
  ↓
棋盘更新与语音反馈
```

分工原则：

- 象棋规则引擎决定走法是否合法、棋局状态和胜负；
- AI 负责理解自然语言、生成提示和解释棋理；
- 灵矽负责实时语音识别、智能体对话和语音合成；
- 零七桥接服务负责安全保管设备凭证，并提供题库和 Pikafish API；
- JSON 是可审计的题库源数据，SQLite 是自动生成的运行时查询数据库。

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

在[灵矽控制台](https://xrobo.qiniu.com/)中将智能体设置为零七（ZERO7）象棋教练：

- 名称：`ZERO7`
- 助手昵称：`零七`
- 对话语言：中文
- 回复风格：简短、友好、清楚
- 面向对象：象棋初学者与普通爱好者
- 联网搜索和无关 MCP：关闭

智能体只负责语言交互和棋理解释。棋盘事实与合法性由应用规则引擎提供；信息不足时不应猜测局面。

## 安装 Pikafish

零七通过本地独立进程调用 Pikafish，不在仓库中分发引擎二进制和 NNUE 权重。

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

Pikafish 源代码采用 GPL-3.0。NNUE 权重可能带有额外授权条件；当前导入权重明确限制未经许可的商业使用。请阅读下载包中的协议。零七不会将二进制、模型或本地协议文件提交到 Git。

## 本地运行

要求安装 Node.js 22 或兼容版本。

```bash
npm install
npm run dev
```

`npm run dev` 会先检查本地 HTTPS 证书，然后同时启动：

- 零七网页：终端显示的 HTTPS 地址；
- 灵矽桥接服务：`http://127.0.0.1:8787`。

### 电脑访问

首次使用需要安装并信任 `mkcert` 的本地根证书：

```bash
brew install mkcert
mkcert -install
npm run dev
```

`npm run dev` 会自动生成 `.cert/localhost.pem` 和 `.cert/localhost-key.pem`。证书覆盖 `localhost`、`127.0.0.1` 和当前开发机局域网地址。证书和私钥位于 `.cert/`，不会提交到 Git。

请使用终端显示的 HTTPS 地址访问，例如：

```text
https://localhost:5173/
```

如果浏览器仍显示 `ERR_CERT_AUTHORITY_INVALID`，说明本机根证书还没有安装成功。重新执行 `mkcert -install`，输入 macOS 登录密码后重启开发服务。

### 手机访问和语音输入

手机和电脑连接同一个 Wi-Fi，然后使用终端显示的局域网 HTTPS 地址，例如：

```text
https://192.168.1.45:5173/
```

手机首次访问时需要信任同一个 `mkcert` 根证书，否则浏览器会显示“连接不是私密连接”，并拒绝麦克风权限。查看根证书位置：

```bash
mkcert -CAROOT
```

将该目录中的 `rootCA.pem` 安装到手机并启用系统信任：

- iPhone：安装证书描述文件，然后在“设置 → 通用 → 关于本机 → 证书信任设置”中启用完全信任。
- Android：安装为系统的 CA 证书，具体入口根据系统版本可能位于“安全与隐私 → 更多安全设置 → 从设备存储空间安装证书”。

完成证书信任后，在手机浏览器允许麦克风权限。对战页棋盘下方的“按住说走法”按钮支持按住识别、松开完成；短按会取消本次识别。

首次使用语音时，浏览器会请求麦克风权限。

## 常用命令

```bash
npm run dev          # 同时启动网页与灵矽桥接服务
npm run dev:web      # 只启动网页
npm run dev:bridge   # 只启动灵矽桥接服务
npm run build        # 类型检查并构建生产版本
npm run puzzles:import # 校验 JSON 并重建 SQLite 题库
npm run puzzles:import:chessdb -- report.json # 导入 ChessDB 离线校验报告
npm run lint         # 运行静态检查
npm test             # 运行自动化测试
npm run test:coverage # 运行测试并生成覆盖率报告
npm run preview      # 预览生产构建
```

## 训练题库与操作

当前题库包含 10,640 道题：969 道一步杀、1,018 道二步杀、762 道三步杀、361 道四步杀、184 道 N 步杀，以及 7,346 道棋弈江湖残局关键着题。训练页先通过类型菜单选择一步杀至 N 步杀，再在题目菜单中选择对应编号；一步杀、二步杀、三步杀、四步杀和 N 步杀分别从 `1001`、`2001`、`3001`、`4001` 和 `9001` 编号。页面在题目下方明确显示“红方先行”或“黑方先行”。完整来源与校验说明参阅：[练习题来源与校验](./docs/puzzle-sources.md)。

在首页选择任一训练题，可以通过两种方式走棋：

1. 点击当前行棋方棋子和合法目标位置；
2. 按住“按住说走法”按钮或空格键，说出中文棋谱，松开后完成识别。短按会取消本次识别。

训练规则：

- “重新练习”恢复当前题目的原始 FEN；
- “跳过这题”始终可用，答对后变为“挑战下一关”或“继续下一题”；
- 分级提示只显示和朗读提示，用户仍需自己走棋；
- 用户走其他合法着时，Pikafish 走出对方应手，棋局继续；
- 候选答案需要本地规则确认将死，并由 Pikafish 确认无应手，之后才显示和播报“绝杀”；
- 棋弈江湖残局题使用来源提供的 `bestMove` 作为推荐首着，并保留残局类型和结果字段；
- 残局页面使用与人机对弈相同的规则和 Pikafish 应手，走出推荐首着不会直接完成题目；
- ChessDB 通过可审计的离线报告补充状态、评分和最佳着。

系统能够纠正常见同音和数字识别结果，例如“车五进一”“車五進一”和“车5进1”。

题库采用双层存储：

```text
data/puzzles/wukong.json（Git 中的唯一源数据）
  ↓ npm run puzzles:import
server/data/puzzles.sqlite（忽略提交的运行时数据库）
  ↓ /api/puzzles
React 训练页面
```

后端启动时发现 SQLite 缺失或 JSON 更新，也会自动重建数据库。

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
- [x] 走子路径和吃子动画
- [x] 手机端按住识别、松开完成
- [ ] 对局计时
- [ ] 本地学习进度与错题记录
- [ ] 可扩展训练题库

## 开源协议

项目源代码采用 [Apache License 2.0](./LICENSE)。灵矽服务、第三方依赖，以及单独引入的音色、图片、棋力引擎和题库遵循各自的服务条款或授权协议。

欢迎提交 Issue、训练题目、规则测试、语音纠错样本和代码贡献。
