import type { EngineLevel } from './pikafish'

export const SAVED_GAMES_KEY = 'zero7-saved-games'
export const CURRENT_SAVED_GAME_ID = 'current'
export const MAX_SAVED_GAMES = 30

export type SavedBattleGame = {
  id: string
  savedAt: number
  difficulty: EngineLevel
  moves: string[]
  result: string
  resigned: boolean
}

function isSavedBattleGame(value: unknown): value is SavedBattleGame {
  if (!value || typeof value !== 'object') return false
  const game = value as SavedBattleGame
  return typeof game.id === 'string'
    && game.id.length > 0
    && typeof game.savedAt === 'number'
    && Number.isFinite(game.savedAt)
    && typeof game.difficulty === 'string'
    && Array.isArray(game.moves)
    && game.moves.every((move) => typeof move === 'string' && move.length > 0)
    && typeof game.result === 'string'
    && typeof game.resigned === 'boolean'
}

export function loadSavedGames(): SavedBattleGame[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_GAMES_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(SAVED_GAMES_KEY)
      return []
    }
    return parsed.filter(isSavedBattleGame)
  } catch {
    localStorage.removeItem(SAVED_GAMES_KEY)
    return []
  }
}

export function upsertSavedGame(input: {
  id?: string
  difficulty: EngineLevel
  moves: string[]
  result: string
  resigned: boolean
  savedAt?: number
}): SavedBattleGame {
  const games = loadSavedGames()
  const existing = input.id ? games.find((game) => game.id === input.id) : undefined
  const record: SavedBattleGame = {
    id: existing?.id ?? `saved-${input.savedAt ?? Date.now()}`,
    savedAt: input.savedAt ?? Date.now(),
    difficulty: input.difficulty,
    moves: input.moves,
    result: input.result,
    resigned: input.resigned,
  }
  localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify([record, ...games.filter((game) => game.id !== record.id)].slice(0, MAX_SAVED_GAMES)))
  return record
}

export function deleteSavedGame(id: string) {
  const next = loadSavedGames().filter((game) => game.id !== id)
  localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(next))
  return next
}

export function savedGameLabel(game: SavedBattleGame) {
  const date = new Date(game.savedAt)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const turns = Math.max(1, Math.ceil(game.moves.length / 2))
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes} · ${game.difficulty} · ${turns}回合`
}
