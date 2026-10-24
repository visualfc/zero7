import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ensurePuzzleDatabase, importPuzzleDatabase, openPuzzleRepository, puzzleDataDirectory, validatePuzzle } from './puzzle-database.mjs'

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zero7-puzzles-'))
  return { directory, databasePath: path.join(directory, 'puzzles.sqlite') }
}

test('JSON 题库经过校验后导入 SQLite 并支持分页筛选', () => {
  const temporary = temporaryDatabase()
  try {
    const result = importPuzzleDatabase({ databasePath: temporary.databasePath })
    assert.equal(result.sources, 1)
    assert.equal(result.puzzles, 969)
    const repository = openPuzzleRepository(temporary.databasePath)
    const firstPage = repository.list({ limit: 4 })
    assert.equal(firstPage.total, 969)
    assert.equal(firstPage.items.length, 4)
    assert.equal(firstPage.items[0].id, 'wukong-mate-0')
    assert.equal(firstPage.items[3].source.name, 'Wukong Xiangqi')
    const filtered = repository.list({ source: 'wukong-xiangqi', difficulty: '初级', offset: 1, limit: 2 })
    assert.equal(filtered.total, 969)
    assert.equal(filtered.items.length, 2)
    assert.equal(repository.get('wukong-mate-0').sourcePuzzleId, 'puzzle_0')
    assert.equal(repository.get('missing'), null)
    repository.close()
  } finally {
    fs.rmSync(temporary.directory, { recursive: true, force: true })
  }
})

test('数据库存在且比 JSON 新时直接复用', () => {
  const temporary = temporaryDatabase()
  try {
    importPuzzleDatabase({ databasePath: temporary.databasePath })
    const result = ensurePuzzleDatabase({ databasePath: temporary.databasePath })
    assert.equal(result.databasePath, temporary.databasePath)
    assert.equal(result.puzzles, undefined)
  } finally {
    fs.rmSync(temporary.directory, { recursive: true, force: true })
  }
})

test('导入器拒绝未知来源、无提示、无答案和非法答案', () => {
  const sourceIds = new Set(['wukong-xiangqi'])
  const base = JSON.parse(fs.readFileSync(path.join(puzzleDataDirectory, 'wukong.json'), 'utf8'))[0]
  assert.throws(() => validatePuzzle({ ...base, sourceId: 'missing' }, sourceIds), /未知来源/)
  assert.throws(() => validatePuzzle({ ...base, hints: [] }, sourceIds), /三条提示/)
  assert.throws(() => validatePuzzle({ ...base, solution: [] }, sourceIds), /缺少标准答案/)
  assert.throws(() => validatePuzzle({ ...base, solution: [{ from: 'a0', to: 'a9' }] }, sourceIds), /非法答案/)
})
