import { afterEach, describe, expect, it } from 'vitest'
import { CURRENT_SAVED_GAME_ID, deleteSavedGame, loadSavedGames, MAX_SAVED_GAMES, SAVED_GAMES_KEY, savedGameLabel, upsertSavedGame } from './saved-games'

afterEach(() => {
  localStorage.clear()
})

describe('人机对局存盘', () => {
  it('保存、更新和删除本地对局', () => {
    const first = upsertSavedGame({
      difficulty: '初级',
      moves: ['h0g2', 'h9g7'],
      result: '轮到红方走棋',
      resigned: false,
      savedAt: new Date(2026, 2, 4, 14, 30).getTime(),
    })
    expect(first.id).toMatch(/^saved-/)
    expect(loadSavedGames()).toEqual([first])
    expect(savedGameLabel(first)).toBe('3月4日 14:30 · 初级 · 1回合')

    const updated = upsertSavedGame({
      id: first.id,
      difficulty: '中级',
      moves: ['h0g2', 'h9g7', 'g3g4'],
      result: '你已认输，本局由 零七 获胜。',
      resigned: true,
      savedAt: new Date(2026, 2, 4, 14, 35).getTime(),
    })
    expect(updated.id).toBe(first.id)
    expect(loadSavedGames()).toEqual([updated])
    expect(savedGameLabel(updated)).toBe('3月4日 14:35 · 中级 · 2回合')

    expect(deleteSavedGame(first.id)).toEqual([])
    expect(loadSavedGames()).toEqual([])
  })

  it('损坏的存盘数据会安全恢复，并限制保存数量', () => {
    localStorage.setItem(SAVED_GAMES_KEY, '{bad')
    expect(loadSavedGames()).toEqual([])
    expect(localStorage.getItem(SAVED_GAMES_KEY)).toBeNull()

    localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify({ id: 'nope' }))
    expect(loadSavedGames()).toEqual([])

    localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify([
      { id: '', savedAt: 1, difficulty: '初级', moves: ['h0g2'], result: 'ok', resigned: false },
      { id: 'keep', savedAt: 2, difficulty: '高级', moves: ['h0g2'], result: 'ok', resigned: false },
      { id: 'bad-moves', savedAt: 3, difficulty: '初级', moves: [1], result: 'ok', resigned: false },
    ]))
    expect(loadSavedGames()).toEqual([{ id: 'keep', savedAt: 2, difficulty: '高级', moves: ['h0g2'], result: 'ok', resigned: false }])

    for (let index = 0; index < MAX_SAVED_GAMES + 2; index += 1) {
      upsertSavedGame({
        difficulty: '初级',
        moves: ['h0g2'],
        result: '轮到红方走棋',
        resigned: false,
        savedAt: index + 1,
      })
    }
    expect(loadSavedGames()).toHaveLength(MAX_SAVED_GAMES)
    expect(CURRENT_SAVED_GAME_ID).toBe('current')
  })
})
