# 练习题来源与校验

ZERO7 的练习题统一保存来源、原始题号、许可证、完整 FEN、结构化答案和校验记录。中文标题、提示和讲解由 ZERO7 编写。

## 当前来源

| 来源 | 用途 | 许可证 | 地址 |
| --- | --- | --- | --- |
| Wukong Xiangqi | 经过搜索验证的将杀局面 | MIT | <https://github.com/maksimKorzh/wukong-xiangqi> |
| 棋弈江湖 | 7,346 道残局关键着 | MIT | <https://github.com/dffge552/xiangqi-pwa-offline> |
| ChessDB | 离线复核答案、评分和主变化 | Unlicense / 公共领域数据库快照 | <https://github.com/noobpwnftw/chessdb> |

题库数据遵循 Wukong Xiangqi 的 MIT 许可证。复盘模块另使用其 `xqdb` 完整大师对局库，首批导入 3 盘带赛事和棋手信息的 UCI 格式代表性棋谱，并使用 `xiangqi.js` 从标准开局逐着校验；经典对局不计入练习题总数。项目的 Apache-2.0 许可证覆盖 ZERO7 自有代码和中文训练提示。已导入内容的完整许可证文本保存在 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

## 当前题量

当前共有 10,640 道题：Wukong Xiangqi 包含 969 道一步杀、1,018 道二步杀、762 道三步杀、361 道四步杀和 184 道 N 步杀；棋弈江湖包含 7,346 道残局关键着题。训练页先选择杀棋类型，再选择该类型的题号；题号分别使用 `1001`、`2001`、`3001`、`4001` 和 `9001` 起始的编号。多步将杀不保存固定主变化，训练时使用 Pikafish 按目标步数判断当前局面。

Wukong 数据来自 `puzzle_generator/puzzles_verified_sorted.json`。导入过程从其中 1,061 个“一步杀”候选局面中，使用 `@weshell/xiangqi.js` 重新加载局面并枚举合法着，筛出 969 个只有一个将死着的局面。每道题保留原始 ID、FEN 和唯一答案。当前记录中的 `verifiedBy` 为 `source` 和 `xiangqi.js`。

棋弈江湖数据来自 `endgames_all.json`，导入 7,346 道带 `bestMove` 的残局局面，并保留原始残局类型、结果和推荐着法。残局页按进攻方主要子力归类为车类 1,806 道、马炮 480 道、炮类 1,170 道、马类 1,446 道、兵类 479 道和仕相 1,965 道。分类采用车、马炮、炮、马、兵、仕相的优先级，六类分别从 `10001`、`20001`、`30001`、`40001`、`50001` 和 `60001` 开始编号，原始 `sourceType` 继续作为精确子力对型显示。当前记录中的 `verifiedBy` 为 `source` 和 `xiangqi.js`。仓库中只有局面名称、没有完整主变化的杀法题暂不导入为多步训练题。

ChessDB 使用独立的 `chessdb-verifications.json` 离线报告。运行 `npm run puzzles:import:chessdb -- report.json` 后，导入器会校验报告中的题目 ID 和 FEN，并将状态、评分和最佳着保存到 SQLite。没有报告记录的题目不会伪造 `chessdb` 校验标记。

## 存储方式

`data/puzzles/*.json` 是受 Git 管理的唯一源数据，用于审查、追溯和重新导入。`npm run puzzles:import` 校验全部 FEN 和答案后生成 `server/data/puzzles.sqlite`。SQLite 是忽略提交的运行时产物，后端也会在数据库缺失或 JSON 更新时自动重建。浏览器通过 `/api/puzzles` 分页查询 SQLite，不直接打包 JSON 数据。

## 数据要求

每道题必须满足：

1. FEN 使用六字段格式，棋盘有 10 行、每行 9 路，并且红黑双方各有一个帅或将。
2. `solution` 使用 `{ from, to }` 坐标序列，应用层从规则引擎生成中文记谱。
3. 标准答案的每一步都必须是当前局面的合法着。
4. 界面显示来源名称、许可证和原始题号。
5. 外部题目的中文讲解必须由 ZERO7 独立编写，不能复制来源站点的讲解文本。
