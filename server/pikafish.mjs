import { access } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultBinary = path.join(root, '.local', 'pikafish', 'pikafish')
const defaultModel = path.join(root, '.local', 'pikafish', 'pikafish.nnue')

export class PikafishEngine {
  constructor({ binary = process.env.PIKAFISH_PATH || defaultBinary, model = process.env.PIKAFISH_MODEL || defaultModel } = {}) {
    this.binary = binary
    this.model = model
    this.process = null
    this.ready = false
    this.name = ''
    this.buffer = ''
    this.waiters = []
    this.queue = Promise.resolve()
  }

  async status() {
    try {
      await access(this.binary)
      await access(this.model)
      await this.start()
      return { available: true, name: this.name || 'Pikafish', binary: path.basename(this.binary) }
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : 'Pikafish 不可用' }
    }
  }

  async bestMove({ fen, level = '初级', moveTime, mateDepth, analysis = false }) {
    const task = this.queue.then(async () => {
      await this.start()
      const options = levelOptions(level)
      await this.command(`setoption name Skill Level value ${options.skill}`, null)
      await this.command(`setoption name UCI_LimitStrength value ${options.limitStrength}`, null)
      if (options.elo) await this.command(`setoption name UCI_Elo value ${options.elo}`, null)
      await this.command('isready', /^readyok$/)
      await this.command(`position fen ${fen}`, null)
      const infoLines = []
      const search = Number.isInteger(mateDepth) && mateDepth > 0 ? `go mate ${Math.min(mateDepth, 20)}` : `go movetime ${Math.max(100, Math.min(Number(moveTime) || options.moveTime, 5000))}`
      let line
      try {
        line = await this.command(search, /^bestmove\s+/i, 30000, (currentLine) => {
          if ((analysis || mateDepth) && currentLine.startsWith('info ') && currentLine.includes(' score ')) infoLines.push(currentLine)
        })
      } catch (error) {
        this.reset(error instanceof Error ? error : new Error('Pikafish 搜索失败'))
        throw error
      }
      const match = line.match(/^bestmove\s+([a-i][0-9][a-i][0-9])/i)
      const noMove = /^bestmove\s+(?:\(none\)|none|0000)/i.test(line)
      if (!match && !noMove) throw new Error(`Pikafish 没有返回有效走法：${line}`)
      const score = parseAnalysisScore(infoLines.at(-1))
      return { move: match?.[1].toLowerCase() ?? null, terminal: noMove, score, engine: this.name || 'Pikafish', level }
    })
    this.queue = task.catch(() => undefined)
    return task
  }

  async start() {
    if (this.ready && this.process && !this.process.killed) return
    await access(this.binary)
    await access(this.model)
    this.process = spawn(this.binary, [], {
      cwd: path.dirname(this.model),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    this.buffer = ''
    this.process.stdout.setEncoding('utf8')
    this.process.stdout.on('data', (chunk) => this.consume(chunk))
    this.process.stderr.setEncoding('utf8')
    this.process.stderr.on('data', (chunk) => console.error(`[Pikafish] ${chunk.trim()}`))
    this.process.on('exit', () => {
      this.ready = false
      this.process = null
      this.rejectAll(new Error('Pikafish 进程已退出'))
    })
    const idLine = await this.command('uci', /^uciok$/, 10000, (line) => {
      if (line.startsWith('id name ')) this.name = line.slice(8)
    })
    if (idLine !== 'uciok') throw new Error('Pikafish UCI 握手失败')
    await this.command(`setoption name EvalFile value ${this.model}`, null)
    await this.command('setoption name Threads value 1', null)
    await this.command('setoption name Hash value 64', null)
    await this.command('isready', /^readyok$/, 15000)
    this.ready = true
    console.log(`[Pikafish] 已就绪：${this.name || this.binary}`)
  }

  command(text, matcher, timeout = 5000, onLine) {
    if (!this.process?.stdin.writable) return Promise.reject(new Error('Pikafish 进程未启动'))
    if (!matcher) {
      this.process.stdin.write(`${text}\n`)
      return Promise.resolve('')
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter)
        reject(new Error(`Pikafish 命令超时：${text}`))
      }, timeout)
      const waiter = { matcher, resolve, reject, timer, onLine }
      this.waiters.push(waiter)
      this.process.stdin.write(`${text}\n`)
    })
  }

  consume(chunk) {
    this.buffer += chunk
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() || ''
    for (const line of lines) {
      for (const waiter of [...this.waiters]) {
        waiter.onLine?.(line)
        if (waiter.matcher.test(line)) {
          clearTimeout(waiter.timer)
          this.waiters = this.waiters.filter((item) => item !== waiter)
          waiter.resolve(line)
        }
      }
    }
  }

  rejectAll(error) {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    this.waiters = []
  }

  reset(error = new Error('Pikafish 进程已重置')) {
    const process = this.process
    this.process = null
    this.ready = false
    this.buffer = ''
    this.rejectAll(error)
    process?.kill()
  }

  close() {
    if (this.process?.stdin.writable) this.process.stdin.write('quit\n')
    this.reset(new Error('Pikafish 进程已关闭'))
  }
}

function parseAnalysisScore(lines) {
  const match = lines?.match(/score\s+(cp|mate)\s+(-?\d+)/i)
  if (!match) return null
  return { type: match[1].toLowerCase(), value: Number(match[2]) }
}

function levelOptions(level) {
  if (level === '入门') return { skill: 0, limitStrength: 'true', elo: 1280, moveTime: 250 }
  if (level === '中级') return { skill: 10, limitStrength: 'true', elo: 1900, moveTime: 800 }
  return { skill: 5, limitStrength: 'true', elo: 1500, moveTime: 450 }
}
