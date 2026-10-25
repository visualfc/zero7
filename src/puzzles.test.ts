import { describe, expect, it, vi } from 'vitest'
import { Chess, type Move as EngineMove } from '@weshell/xiangqi.js'
import wukongRecords from '../data/puzzles/wukong.json'
import wukongMultiRecords from '../data/puzzles/wukong-multi.json'
import qiyiRecords from '../data/puzzles/xiangqi-pwa-offline.json'
import sources from '../data/puzzles/sources.json'
import { fetchPuzzleLibrary, puzzleToLevel, validatePuzzleRecord, type PuzzleRecord, type PuzzleSource } from './puzzles'

const sourceMap = Object.fromEntries(sources.map((source) => [source.id, source])) as Record<string, PuzzleSource>
const records = [...wukongRecords.slice(0, 20), ...qiyiRecords.slice(0, 20)].map((record) => ({ ...record, source: sourceMap[record.sourceId] })) as PuzzleRecord[]
const trainingPuzzles = records.map((record, index) => puzzleToLevel(record, index))

describe('练习题库', () => {
  it('所有题目都保留来源、完整 FEN 和可执行答案', () => {
    expect(trainingPuzzles).toHaveLength(40)
    expect(qiyiRecords).toHaveLength(7346)
    expect(trainingPuzzles.filter((puzzle) => puzzle.sourceId === 'xiangqi-pwa-offline')).toHaveLength(20)
    for (const puzzle of trainingPuzzles) {
      expect(puzzle.fen.trim().split(/\s+/)).toHaveLength(6)
      expect(puzzle.source.name).toBeTruthy()
      expect(puzzle.sourcePuzzleId).toBeTruthy()
      expect(puzzle.verifiedBy).toContain('xiangqi.js')
      expect(validatePuzzleRecord(records.find((record) => record.id === puzzle.id)!)).toEqual({ ok: true })
    }
  })

  it('棋弈江湖残局标题使用真正的换行而非字面量转义', () => {
    for (const record of qiyiRecords.slice(0, 50)) {
      expect(record.title).toBe(`残局取胜：\n${record.sourceType}`)
      expect(record.title).not.toContain('\\n')
    }
  })

  it('批量 Wukong 一步杀题确实是唯一将杀', () => {
    expect(wukongRecords).toHaveLength(969)
    for (const puzzle of trainingPuzzles.filter((item) => item.sourceId === 'wukong-xiangqi')) {
      const game = new Chess(puzzle.fen)
      const mates = (game.moves({ verbose: true }) as EngineMove[]).filter((move) => move.isCheckmate)
      expect(mates.map((move) => move.lan), puzzle.sourcePuzzleId).toEqual([`${puzzle.solution[0].from}${puzzle.solution[0].to}`])
    }
  })

  it('棋弈江湖题目保留原始 bestMove、结果和题型归因', () => {
    const puzzle = trainingPuzzles.find((item) => item.sourceId === 'xiangqi-pwa-offline')!
    expect(puzzle.sourceBestMove).toBe('a6a0')
    expect(puzzle.sourceResult).toContain('egtb:a6a0')
    expect(puzzle.sourceType).toBe('單馬單炮 vs 單馬')
    expect(puzzle.mode).toBe('endgame')
    expect(puzzle.source.name).toBe('棋弈江湖')
  })

  it('把 FEN 转换为界面棋子、中文答案和连续编号', () => {
    const puzzle = trainingPuzzles[0]
    expect(puzzle.number).toBe('01')
    expect(puzzle.mode).toBe('mate1')
    expect(wukongMultiRecords.some((record) => record.mode === 'mate2')).toBe(true)
    expect(wukongMultiRecords.some((record) => record.mode === 'mate3')).toBe(true)
    expect(wukongMultiRecords.some((record) => record.mode === 'mate4')).toBe(true)
    expect(wukongMultiRecords.some((record) => record.mode === 'mateN')).toBe(true)
    expect(puzzle.answer).toBe('车五进一')
    expect(puzzle.move).toMatchObject({ pieceId: 'e7', from: { row: 2, col: 4 }, to: { row: 1, col: 4 } })
    expect(puzzle.pieces.find((piece) => piece.id === 'e7')).toMatchObject({ text: '车', side: 'red', kind: 'rook' })
    expect(puzzle.source).toEqual(sourceMap['wukong-xiangqi'])
  })

  it('ChessDB 校验字段可以随题目传递', () => {
    const verified = { ...records.find((record) => record.sourceId === 'xiangqi-pwa-offline')!, chessdb: { status: 'win', score: 123, bestMove: 'a6a0' } }
    expect(puzzleToLevel(verified, 0).chessdb).toEqual({ status: 'win', score: 123, bestMove: 'a6a0' })
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
    expect(fetchMock).toHaveBeenCalledWith('/api/puzzles?limit=20000', { signal: undefined })
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await expect(fetchPuzzleLibrary()).rejects.toThrow('题库加载失败（503）')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    await expect(fetchPuzzleLibrary()).rejects.toThrow('题库中还没有练习题')
    vi.unstubAllGlobals()
  })
})
