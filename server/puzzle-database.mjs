import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { Chess, validateFen } from '@weshell/xiangqi.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const puzzleDataDirectory = path.join(root, 'data', 'puzzles')
export const defaultPuzzleDatabase = path.join(root, 'server', 'data', 'puzzles.sqlite')
const sourceFiles = ['wukong.json']

export function readPuzzleFiles(dataDirectory = puzzleDataDirectory) {
  const sources = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'sources.json'), 'utf8'))
  const puzzles = sourceFiles.flatMap((file) => JSON.parse(fs.readFileSync(path.join(dataDirectory, file), 'utf8')))
  return { sources, puzzles }
}

export function validatePuzzle(record, sourceIds) {
  const requiredStrings = ['id', 'sourceId', 'sourcePuzzleId', 'category', 'difficulty', 'fen', 'title', 'description', 'instruction', 'successTitle', 'successText']
  for (const field of requiredStrings) if (typeof record[field] !== 'string' || !record[field].trim()) throw new Error(`${record.id || '未知题目'} 缺少 ${field}`)
  if (!sourceIds.has(record.sourceId)) throw new Error(`${record.id} 使用了未知来源 ${record.sourceId}`)
  const fen = validateFen(record.fen)
  if (!fen.ok) throw new Error(`${record.id}: ${fen.error}`)
  if (!Array.isArray(record.hints) || record.hints.length !== 3 || record.hints.some((hint) => typeof hint !== 'string')) throw new Error(`${record.id} 必须有三条提示`)
  if (!Array.isArray(record.solution) || record.solution.length === 0) throw new Error(`${record.id} 缺少标准答案`)
  if (!Array.isArray(record.verifiedBy) || record.verifiedBy.length === 0) throw new Error(`${record.id} 缺少校验记录`)
  const game = new Chess(record.fen)
  for (const step of record.solution) {
    const move = game.moves({ verbose: true }).find((candidate) => candidate.from === step.from && candidate.to === step.to)
    if (!move) throw new Error(`${record.id} 包含非法答案 ${step.from}${step.to}`)
    game.move(step)
  }
}

export function importPuzzleDatabase({ dataDirectory = puzzleDataDirectory, databasePath = defaultPuzzleDatabase } = {}) {
  const { sources, puzzles } = readPuzzleFiles(dataDirectory)
  const sourceIds = new Set(sources.map((source) => source.id))
  if (sourceIds.size !== sources.length) throw new Error('题目来源 ID 重复')
  const puzzleIds = new Set()
  for (const puzzle of puzzles) {
    if (puzzleIds.has(puzzle.id)) throw new Error(`题目 ID 重复：${puzzle.id}`)
    puzzleIds.add(puzzle.id)
    validatePuzzle(puzzle, sourceIds)
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const temporaryPath = `${databasePath}.tmp`
  fs.rmSync(temporaryPath, { force: true })
  const database = new DatabaseSync(temporaryPath)
  try {
    database.exec(`
      PRAGMA journal_mode = DELETE;
      CREATE TABLE sources (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, license TEXT NOT NULL, role TEXT NOT NULL);
      CREATE TABLE puzzles (position INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id), source_puzzle_id TEXT NOT NULL, difficulty TEXT NOT NULL, category TEXT NOT NULL, fen TEXT NOT NULL, solution TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, instruction TEXT NOT NULL, hints TEXT NOT NULL, success_title TEXT NOT NULL, success_text TEXT NOT NULL, reward INTEGER NOT NULL, verified_by TEXT NOT NULL);
      CREATE INDEX puzzles_source_index ON puzzles(source_id);
      CREATE INDEX puzzles_difficulty_index ON puzzles(difficulty);
    `)
    const insertSource = database.prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?)')
    for (const source of sources) insertSource.run(source.id, source.name, source.url, source.license, source.role)
    const insertPuzzle = database.prepare('INSERT INTO puzzles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    puzzles.forEach((puzzle, index) => insertPuzzle.run(index, puzzle.id, puzzle.sourceId, puzzle.sourcePuzzleId, puzzle.difficulty, puzzle.category, puzzle.fen, JSON.stringify(puzzle.solution), puzzle.title, puzzle.description, puzzle.instruction, JSON.stringify(puzzle.hints), puzzle.successTitle, puzzle.successText, puzzle.reward, JSON.stringify(puzzle.verifiedBy)))
  } finally {
    database.close()
  }
  fs.renameSync(temporaryPath, databasePath)
  return { sources: sources.length, puzzles: puzzles.length, databasePath }
}

export function ensurePuzzleDatabase(options = {}) {
  const databasePath = options.databasePath || defaultPuzzleDatabase
  const inputs = ['sources.json', ...sourceFiles].map((file) => path.join(options.dataDirectory || puzzleDataDirectory, file))
  const newestInput = Math.max(...inputs.map((file) => fs.statSync(file).mtimeMs))
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).mtimeMs < newestInput) return importPuzzleDatabase(options)
  return { databasePath }
}

export function openPuzzleRepository(databasePath = defaultPuzzleDatabase) {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  const parse = (row) => ({
    id: row.id, sourceId: row.source_id, sourcePuzzleId: row.source_puzzle_id, difficulty: row.difficulty, category: row.category,
    fen: row.fen, solution: JSON.parse(row.solution), title: row.title, description: row.description, instruction: row.instruction,
    hints: JSON.parse(row.hints), successTitle: row.success_title, successText: row.success_text, reward: row.reward, verifiedBy: JSON.parse(row.verified_by),
    source: { id: row.source_id, name: row.source_name, url: row.source_url, license: row.source_license, role: row.source_role },
  })
  const select = `SELECT p.*, s.name source_name, s.url source_url, s.license source_license, s.role source_role FROM puzzles p JOIN sources s ON s.id = p.source_id`
  return {
    list({ offset = 0, limit = 50, source, difficulty } = {}) {
      const clauses = []; const values = []
      if (source) { clauses.push('p.source_id = ?'); values.push(source) }
      if (difficulty) { clauses.push('p.difficulty = ?'); values.push(difficulty) }
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
      const rows = database.prepare(`${select}${where} ORDER BY p.position LIMIT ? OFFSET ?`).all(...values, limit, offset)
      const total = database.prepare(`SELECT COUNT(*) total FROM puzzles p${where}`).get(...values).total
      return { items: rows.map(parse), total, offset, limit }
    },
    get(id) {
      const row = database.prepare(`${select} WHERE p.id = ?`).get(id)
      return row ? parse(row) : null
    },
    close() { database.close() },
  }
}
