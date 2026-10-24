# 练习题来源与校验

ZERO7 的练习题统一保存来源、原始题号、许可证、完整 FEN、结构化答案和校验记录。中文标题、提示和讲解由 ZERO7 编写。

## 当前来源

| 来源 | 用途 | 许可证 | 地址 |
| --- | --- | --- | --- |
| Wukong Xiangqi | 经过搜索验证的将杀局面 | MIT | <https://github.com/maksimKorzh/wukong-xiangqi> |

题库数据遵循 Wukong Xiangqi 的 MIT 许可证。项目的 Apache-2.0 许可证覆盖 ZERO7 自有代码和中文训练提示。已导入内容的完整许可证文本保存在 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

## 当前题量

当前共有 969 道题，全部来自 Wukong Xiangqi，并且都有唯一的一步将杀答案。

Wukong 数据来自 `puzzle_generator/puzzles_verified_sorted.json`。导入过程从其中 1,061 个“一步杀”候选局面中，使用 `@weshell/xiangqi.js` 重新加载局面并枚举合法着，筛出 969 个只有一个将死着的局面。每道题保留原始 ID、FEN 和唯一答案。当前记录中的 `verifiedBy` 为 `source` 和 `xiangqi.js`。

## 存储方式

`data/puzzles/*.json` 是受 Git 管理的唯一源数据，用于审查、追溯和重新导入。`npm run puzzles:import` 校验全部 FEN 和答案后生成 `server/data/puzzles.sqlite`。SQLite 是忽略提交的运行时产物，后端也会在数据库缺失或 JSON 更新时自动重建。浏览器通过 `/api/puzzles` 分页查询 SQLite，不直接打包 JSON 数据。

## 数据要求

每道题必须满足：

1. FEN 使用六字段格式，棋盘有 10 行、每行 9 路，并且红黑双方各有一个帅或将。
2. `solution` 使用 `{ from, to }` 坐标序列，应用层从规则引擎生成中文记谱。
3. 标准答案的每一步都必须是当前局面的合法着。
4. 界面显示来源名称、许可证和原始题号。
5. 外部题目的中文讲解必须由 ZERO7 独立编写，不能复制来源站点的讲解文本。
