import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { PikafishEngine } from './pikafish.mjs'

class FakeProcess extends EventEmitter {
  constructor(lines) {
    super()
    this.killed = false
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        const command = chunk.toString().trim()
        for (const line of lines[command] || []) queueMicrotask(() => this.stdout.write(`${line}\n`))
        callback()
      },
    })
  }
  kill() { this.killed = true }
}

test('Pikafish UCI 输出解析 bestmove', async () => {
  const engine = new PikafishEngine({ binary: process.execPath, model: process.execPath })
  engine.process = new FakeProcess({
    uci: ['id name Pikafish Test', 'uciok'],
    isready: ['readyok'],
    'go movetime 450': ['info depth 10 score cp 20', 'bestmove h9g7 ponder h0g2'],
  })
  engine.process.stdout.setEncoding('utf8')
  engine.process.stdout.on('data', (chunk) => engine.consume(chunk))
  engine.ready = true
  engine.name = 'Pikafish Test'
  const result = await engine.bestMove({ fen: 'test-fen', level: '初级' })
  assert.equal(result.move, 'h9g7')
  const analysisEngine = new PikafishEngine({ binary: process.execPath, model: process.execPath })
  analysisEngine.process = new FakeProcess({
    ucinewgame: [],
    'setoption name Skill Level value 20': [],
    'setoption name UCI_LimitStrength value false': [],
    'setoption name MultiPV value 1': [],
    isready: ['readyok'],
    'position fen test-fen': [],
    'go movetime 8000': ['info depth 10 score cp 180 pv h9g7', 'bestmove h9g7'],
  })
  analysisEngine.process.stdout.setEncoding('utf8')
  analysisEngine.process.stdout.on('data', (chunk) => analysisEngine.consume(chunk))
  analysisEngine.ready = true
  analysisEngine.name = 'Pikafish Test'
  const analysis = await analysisEngine.bestMove({ fen: 'test-fen', level: '初级', analysis: true })
  assert.equal(analysis.move, 'h9g7')
  assert.deepEqual(analysis.score, { type: 'cp', value: 180 })
  analysisEngine.close()
  engine.close()
})


test('Pikafish 杀棋搜索使用时间上限', async () => {
  const engine = new PikafishEngine({ binary: process.execPath, model: process.execPath })
  engine.process = new FakeProcess({
    'setoption name Skill Level value 5': [],
    'setoption name UCI_LimitStrength value true': [],
    'setoption name UCI_Elo value 1500': [],
    isready: ['readyok'],
    'position fen mate-search-fen': [],
    'go mate 2 movetime 1800': ['info depth 8 score mate -2', 'bestmove c5a7'],
  })
  engine.process.stdout.setEncoding('utf8')
  engine.process.stdout.on('data', (chunk) => engine.consume(chunk))
  engine.ready = true
  const result = await engine.bestMove({ fen: 'mate-search-fen', level: '初级', mateDepth: 2 })
  assert.equal(result.move, 'c5a7')
  assert.deepEqual(result.score, { type: 'mate', value: -2 })
  engine.close()
})

test('Pikafish 搜索失败后重置进程以恢复后续请求', async () => {
  const engine = new PikafishEngine({ binary: process.execPath, model: process.execPath })
  const fakeProcess = new FakeProcess({})
  engine.process = fakeProcess
  engine.ready = true
  await assert.rejects(engine.command('go mate 2', /^bestmove\s+/i, 1), /命令超时/)
  engine.reset(new Error('搜索超时'))
  assert.equal(fakeProcess.killed, true)
  assert.equal(engine.process, null)
  assert.equal(engine.ready, false)
})

test('Pikafish 分析忽略未完成的 upperbound 迭代', async () => {
  const engine = new PikafishEngine({ binary: process.execPath, model: process.execPath })
  engine.process = new FakeProcess({
    ucinewgame: [],
    'setoption name Skill Level value 20': [],
    'setoption name UCI_LimitStrength value false': [],
    'setoption name MultiPV value 1': [],
    isready: ['readyok'],
    'position fen start-fen': [],
    'go movetime 8000': [
      'info depth 25 seldepth 36 multipv 1 score cp 7 nodes 100 pv h2e2 h9g7',
      'info depth 26 seldepth 37 multipv 1 score cp 8 upperbound nodes 200 pv c0e2 h7e7',
      'bestmove c0e2 ponder h7e7',
    ],
  })
  engine.process.stdout.setEncoding('utf8')
  engine.process.stdout.on('data', (chunk) => engine.consume(chunk))
  engine.ready = true
  const result = await engine.bestMove({ fen: 'start-fen', level: '大师', analysis: true })
  assert.equal(result.move, 'h2e2')
  assert.deepEqual(result.score, { type: 'cp', value: 7 })
  engine.close()
})

test('Pikafish 将无合法应手解析为终局', async () => {
  const engine = new PikafishEngine({ binary: process.execPath, model: process.execPath })
  engine.process = new FakeProcess({
    'setoption name Skill Level value 5': [],
    'setoption name UCI_LimitStrength value true': [],
    'setoption name UCI_Elo value 1500': [],
    isready: ['readyok'],
    'position fen mate-fen': [],
    'go movetime 450': ['bestmove (none)'],
  })
  engine.process.stdout.setEncoding('utf8')
  engine.process.stdout.on('data', (chunk) => engine.consume(chunk))
  engine.ready = true
  const result = await engine.bestMove({ fen: 'mate-fen', level: '初级' })
  assert.equal(result.move, null)
  assert.equal(result.terminal, true)
  engine.close()
})
