import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = process.argv[2]
if (!input) {
  console.error('用法：node scripts/import-chessdb-verifications.mjs <chessdb-report.json>')
  process.exit(1)
}
const report = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'))
if (report.provider !== 'ChessDB' || !report.records || typeof report.records !== 'object') throw new Error('报告必须包含 provider=ChessDB 和 records 对象')
const output = path.join(root, 'data', 'puzzles', 'chessdb-verifications.json')
fs.writeFileSync(output, `${JSON.stringify({ ...report, generatedAt: report.generatedAt || new Date().toISOString() }, null, 2)}\n`)
console.log(`ChessDB 校验报告已导入：${Object.keys(report.records).length} 条`)
