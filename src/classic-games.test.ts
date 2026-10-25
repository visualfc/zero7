import { Chess } from '@weshell/xiangqi.js'
import { describe, expect, it } from 'vitest'
import classicGames from '../data/classic/games.json'

describe('经典完整对局', () => {
  it('包含赛事、棋手和完整着法信息', () => {
    expect(classicGames.length).toBeGreaterThanOrEqual(2000)
    for (const game of classicGames) {
      expect(game.id).toMatch(/^classic-/)
      expect(game.event).toBeTruthy()
      expect(game.red).toBeTruthy()
      expect(game.black).toBeTruthy()
      expect(game.redOriginal).toBeTruthy()
      expect(game.blackOriginal).toBeTruthy()
      expect(game.redOriginal).toBe(game.red === '刘殿中' ? 'LIU DianZhong' : game.redOriginal)
      expect(game.blackOriginal).toBe(game.black === '柳大华' ? 'LIU DaHua' : game.blackOriginal)
      expect(game.moves.length).toBeGreaterThan(20)
      expect(game.source).toBe('Wukong Xiangqi master games database')
    }
  })

  it('代表性棋局能从标准开局合法回放至最后一步', () => {
    for (const record of classicGames.filter((_, index) => index % 200 === 0).slice(0, 10)) {
      const game = new Chess()
      for (const move of record.moves) {
        expect(game.move(move), `${record.id} 的着法 ${move} 应合法`).toBeTruthy()
      }
      expect(game.history()).toHaveLength(record.moves.length)
    }
  })
})
