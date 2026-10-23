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
  engine.close()
})
