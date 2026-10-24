import { importPuzzleDatabase } from '../server/puzzle-database.mjs'

try {
  const result = importPuzzleDatabase()
  console.log(`题库导入完成：${result.sources} 个来源，${result.puzzles} 道题目`)
  console.log(`SQLite：${result.databasePath}`)
} catch (error) {
  console.error(`题库导入失败：${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
}
