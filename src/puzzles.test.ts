import { describe, expect, it, vi } from 'vitest'
import { Chess, type Move as EngineMove } from '@weshell/xiangqi.js'
import wukongRecords from '../data/puzzles/wukong.json'
import sources from '../data/puzzles/sources.json'
import { fetchPuzzleLibrary, puzzleToLevel, validatePuzzleRecord, type PuzzleRecord, type PuzzleSource } from './puzzles'

const sourceMap = Object.fromEntries(sources.map((source) => [source.id, source])) as Record<string, PuzzleSource>
const records = wukongRecords.map((record) => ({ ...record, source: sourceMap[record.sourceId] })) as PuzzleRecord[]
const trainingPuzzles = records.map(puzzleToLevel)

describe('练习题库', () => {
  it('所有题目都保留来源、完整 FEN 和可执行答案', () => {
    expect(trainingPuzzles).toHaveLength(969)
    for (const puzzle of trainingPuzzles) {
      expect(puzzle.fen.trim().split(/\s+/)).toHaveLength(6)
      expect(puzzle.source.name).toBeTruthy()
      expect(puzzle.sourcePuzzleId).toBeTruthy()
      expect(puzzle.verifiedBy).toContain('xiangqi.js')
      expect(validatePuzzleRecord(records.find((record) => record.id === puzzle.id)!)).toEqual({ ok: true })
    }
  })

  it('批量 Wukong 题目确实是唯一一步将杀', () => {
    expect(wukongRecords).toHaveLength(969)
    for (const puzzle of trainingPuzzles.filter((item) => item.sourceId === 'wukong-xiangqi')) {
      const game = new Chess(puzzle.fen)
      const mates = (game.moves({ verbose: true }) as EngineMove[]).filter((move) => move.isCheckmate)
      expect(mates.map((move) => move.lan), puzzle.sourcePuzzleId).toEqual([`${puzzle.solution[0].from}${puzzle.solution[0].to}`])
    }
  })

  it('把 FEN 转换为界面棋子、中文答案和连续编号', () => {
    const puzzle = trainingPuzzles[0]
    expect(puzzle.number).toBe('01')
    expect(puzzle.answer).toBe('车五进一')
    expect(puzzle.move).toMatchObject({ pieceId: 'e7', from: { row: 2, col: 4 }, to: { row: 1, col: 4 } })
    expect(puzzle.pieces.find((piece) => piece.id === 'e7')).toMatchObject({ text: '车', side: 'red', kind: 'rook' })
    expect(puzzle.source).toEqual(sourceMap['wukong-xiangqi'])
  })

  it('拒绝无效 FEN、空答案和非法答案', () => {
    const base: PuzzleRecord = { ...records[0], id: 'invalid', solution: [] }
    expect(validatePuzzleRecord({ ...base, fen: 'invalid' }).ok).toBe(false)
    expect(validatePuzzleRecord(base)).toEqual({ ok: false, error: '题目缺少标准答案' })
    expect(validatePuzzleRecord({ ...base, solution: [{ from: 'a0', to: 'a9' }] })).toEqual({ ok: false, error: '非法答案：a0a9' })
  })

  it('转换无效题目时给出题目编号', () => {
    expect(() => puzzleToLevel({ ...records[0], id: 'bad-puzzle', fen: 'invalid' }, 0)).toThrow(/bad-puzzle/)
  })

  it('通过 API 按需加载题库并处理响应错误', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ items: records.slice(0, 2) }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPuzzleLibrary()).resolves.toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledWith('/api/puzzles?limit=1000', { signal: undefined })
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await expect(fetchPuzzleLibrary()).rejects.toThrow('题库加载失败（503）')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    await expect(fetchPuzzleLibrary()).rejects.toThrow('题库中还没有练习题')
    vi.unstubAllGlobals()
  })
})
