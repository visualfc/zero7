import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openClassicRepository(jsonPath, databasePath) {
  const db = new DatabaseSync(databasePath)
  db.exec(`CREATE TABLE IF NOT EXISTS classic_games (id TEXT PRIMARY KEY,event TEXT NOT NULL,red TEXT NOT NULL,red_original TEXT NOT NULL,black TEXT NOT NULL,black_original TEXT NOT NULL,moves TEXT NOT NULL,source TEXT NOT NULL); CREATE INDEX IF NOT EXISTS classic_event_index ON classic_games(event); CREATE INDEX IF NOT EXISTS classic_red_index ON classic_games(red_original); CREATE INDEX IF NOT EXISTS classic_black_index ON classic_games(black_original);`)
  const count = db.prepare('SELECT COUNT(*) count FROM classic_games').get().count
  if (count === 0) {
    const insert = db.prepare('INSERT INTO classic_games VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (const game of JSON.parse(fs.readFileSync(jsonPath, 'utf8'))) insert.run(game.id, game.event, game.red, game.redOriginal, game.black, game.blackOriginal, JSON.stringify(game.moves), game.source)
  }
  const parse = (row, includeMoves = true) => ({ id: row.id, event: row.event, red: row.red, redOriginal: row.red_original, black: row.black, blackOriginal: row.black_original, ...(includeMoves ? { moves: JSON.parse(row.moves) } : {}), source: row.source })
  return { list({ query = '', offset = 0, limit = 50 } = {}) { const q=`%${query}%`; const where=query?'WHERE event LIKE ? OR red LIKE ? OR red_original LIKE ? OR black LIKE ? OR black_original LIKE ?':''; const values=query?[q,q,q,q,q]:[]; const rows=db.prepare(`SELECT * FROM classic_games ${where} ORDER BY id LIMIT ? OFFSET ?`).all(...values,limit,offset); const total=db.prepare(`SELECT COUNT(*) count FROM classic_games ${where}`).get(...values).count; return {items:rows.map((row) => parse(row, false)),total,offset,limit} }, get(id) { const row=db.prepare('SELECT * FROM classic_games WHERE id=?').get(id); return row?parse(row):null }, close(){db.close()} }
}
