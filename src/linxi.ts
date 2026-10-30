import { LingxiAudioPlayer } from './audio-player'

export type LinxiState = 'idle' | 'connecting' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface LinxiEvent {
  type: 'state' | 'transcript' | 'reply' | 'error'
  state?: LinxiState
  text?: string
}

interface LinxiMessage {
  type: string
  state?: string
  text?: string
  message?: string
  is_aborted?: boolean
}

const PLAYBACK_WATCHDOG_MS = 12000

export class LinxiVoiceClient {
  private socket: WebSocket | null = null
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private frameBuffer = new PcmFrameBuffer(320)
  private player = new LingxiAudioPlayer()
  private recognitionTimer: number | null = null
  private playbackTimer: number | null = null
  private ttsStreamReady: Promise<void> = Promise.resolve()
  private state: LinxiState = 'idle'
  private playbackDone: Promise<void> | null = null
  private resolvePlaybackDone: (() => void) | null = null
  private suppressCurrentSpeech = false
  private acceptTranscript = false
  private readonly emit: (event: LinxiEvent) => void

  constructor(emit: (event: LinxiEvent) => void) {
    this.emit = emit
    this.player.setPlaybackEndHandler(() => this.endPlayback())
  }

  get currentState() {
    return this.state
  }

  get isConnected() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音')
    }

    this.setState('connecting')
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })

    await this.player.prepare()
    await this.connect()
    await this.startCapture()
    this.acceptTranscript = true
    this.socket?.send(JSON.stringify({ type: 'listen', state: 'start' }))
    this.setState('listening')
  }

  async prepareAudio() {
    await this.player.prepare()
  }

  async speakText(text: string) {
    await this.prepareAudio()
    this.acceptTranscript = false
    this.suppressCurrentSpeech = false
    this.endPlayback()
    if (this.socket && this.socket.readyState !== WebSocket.OPEN) this.abandonSocket(this.socket)
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.setState('connecting')
      await this.connect()
    }
    this.playbackDone = new Promise<void>((resolve) => { this.resolvePlaybackDone = resolve })
    this.startPlaybackWatchdog()
    this.socket?.send(JSON.stringify({ type: 'speak', text }))
  }

  async waitForPlayback() {
    await this.playbackDone
  }

  async stop() {
    if (this.state === 'listening') {
      this.frameBuffer.flush((frame) => this.sendFrame(frame))
      this.socket?.send(JSON.stringify({ type: 'listen', state: 'stop' }))
      this.setState('thinking')
      this.startRecognitionTimeout()
    }
    this.stopCapture()
  }

  disconnect() {
    this.clearRecognitionTimeout()
    this.clearPlaybackWatchdog()
    this.suppressCurrentSpeech = true
    this.stopCapture()
    void this.player.dispose()
    this.endPlayback()
    this.abandonSocket(this.socket)
    this.setState('idle')
  }

  private connect() {
    return new Promise<void>((resolve, reject) => {
      this.abandonSocket(this.socket)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${window.location.host}/linxi`)
      socket.binaryType = 'arraybuffer'
      this.socket = socket
      const timeout = window.setTimeout(() => {
        reject(new Error('连接灵矽超时'))
        socket.close()
      }, 10000)

      socket.onmessage = (event) => {
        if (this.socket !== socket) return
        if (event.data instanceof ArrayBuffer) {
          if (this.suppressCurrentSpeech) return
          void this.player.enqueue(event.data).catch(() => {
            this.emit({ type: 'error', text: '零七的语音播放失败，请重试' })
          })
          return
        }
        if (typeof event.data !== 'string') return
        const message = JSON.parse(event.data) as LinxiMessage
        if (message.type === 'ready') {
          window.clearTimeout(timeout)
          this.setState('ready')
          resolve()
        } else if (message.type === 'stt' && message.text) {
          if (!this.acceptTranscript) return
          this.acceptTranscript = false
          this.clearRecognitionTimeout()
          this.setState('thinking')
          this.emit({ type: 'transcript', text: message.text })
        } else if (message.type === 'tts') {
          if (message.state === 'start') {
            this.clearRecognitionTimeout()
            this.suppressCurrentSpeech = false
            this.setState('speaking')
            this.ttsStreamReady = this.player.startStream()
          }
          if (message.state === 'sentence_start' && message.text) {
            if (/时间过得真快|转眼间|期待和你下次对弈|期待和你下次再对弈/.test(message.text)) {
              this.suppressCurrentSpeech = true
              void this.player.stop()
              this.endPlayback()
            } else if (!this.suppressCurrentSpeech) {
              this.emit({ type: 'reply', text: message.text })
            }
          }
          if (message.state === 'stop') {
            this.clearRecognitionTimeout()
            const aborted = message.is_aborted === true
            void this.ttsStreamReady.then(() => {
              if (this.socket !== socket) return
              if (aborted) {
                void this.player.stop()
                this.endPlayback()
              } else {
                this.player.finishStream()
              }
            })
          }
        } else if (message.type === 'error') {
          this.clearRecognitionTimeout()
          const error = new Error(message.message || '灵矽服务发生错误')
          this.emit({ type: 'error', text: error.message })
          reject(error)
        } else if (message.type === 'disconnected') {
          this.suppressCurrentSpeech = true
          void this.player.stop()
          this.endPlayback()
          this.setState('error')
          this.emit({ type: 'error', text: '灵矽连接已断开，请重新按住语音按钮' })
        }
      }
      socket.onclose = () => {
        if (this.socket !== socket) return
        this.suppressCurrentSpeech = true
        void this.player.stop()
        this.endPlayback()
        if (this.state !== 'idle') {
          this.setState('error')
          this.emit({ type: 'error', text: '灵矽连接已断开，请重新按住语音按钮' })
        }
      }
      socket.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('无法连接本地灵矽桥接服务'))
      }
    })
  }

  private abandonSocket(socket: WebSocket | null) {
    if (!socket) {
      this.socket = null
      return
    }
    socket.onclose = null
    socket.onmessage = null
    socket.onerror = null
    socket.close()
    if (this.socket === socket) this.socket = null
  }

  private endPlayback() {
    this.clearPlaybackWatchdog()
    const resolve = this.resolvePlaybackDone
    this.resolvePlaybackDone = null
    this.playbackDone = null
    resolve?.()
    if (this.state === 'speaking') this.setState('ready')
  }

  private startPlaybackWatchdog() {
    this.clearPlaybackWatchdog()
    this.playbackTimer = window.setTimeout(() => {
      this.playbackTimer = null
      this.player.finishStream()
      this.endPlayback()
    }, PLAYBACK_WATCHDOG_MS)
  }

  private clearPlaybackWatchdog() {
    if (this.playbackTimer !== null) window.clearTimeout(this.playbackTimer)
    this.playbackTimer = null
  }

  private async startCapture() {
    if (!this.stream || !this.socket) return
    this.audioContext = new AudioContext()
    await this.audioContext.resume()
    this.source = this.audioContext.createMediaStreamSource(this.stream)
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)
    this.silentGain = this.audioContext.createGain()
    this.silentGain.gain.value = 0

    const inputRate = this.audioContext.sampleRate
    this.processor.onaudioprocess = (event) => {
      if (this.state !== 'listening' || this.socket?.readyState !== WebSocket.OPEN) return
      const pcm = resampleToPcm16(event.inputBuffer.getChannelData(0), inputRate, 16000)
      this.frameBuffer.push(pcm, (frame) => this.sendFrame(frame))
    }
    this.source.connect(this.processor)
    this.processor.connect(this.silentGain)
    this.silentGain.connect(this.audioContext.destination)
  }

  private sendFrame(frame: Int16Array) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(frame.slice().buffer)
  }

  private startRecognitionTimeout() {
    this.clearRecognitionTimeout()
    this.recognitionTimer = window.setTimeout(() => {
      this.setState('error')
      this.emit({ type: 'error', text: '没有收到识别结果，请靠近麦克风后重试' })
      this.socket?.close()
    }, 12000)
  }

  private clearRecognitionTimeout() {
    if (this.recognitionTimer !== null) window.clearTimeout(this.recognitionTimer)
    this.recognitionTimer = null
  }

  private stopCapture() {
    if (this.processor) this.processor.onaudioprocess = null
    this.source?.disconnect()
    this.processor?.disconnect()
    this.silentGain?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.audioContext?.close()
    this.stream = null
    this.audioContext = null
    this.source = null
    this.processor = null
    this.silentGain = null
  }

  private setState(state: LinxiState) {
    this.state = state
    this.emit({ type: 'state', state })
  }
}

export class PcmFrameBuffer {
  private pending = new Int16Array(0)
  private readonly frameSamples: number

  constructor(frameSamples: number) {
    this.frameSamples = frameSamples
  }

  push(input: Int16Array, emit: (frame: Int16Array) => void) {
    const combined = new Int16Array(this.pending.length + input.length)
    combined.set(this.pending)
    combined.set(input, this.pending.length)

    let offset = 0
    while (combined.length - offset >= this.frameSamples) {
      emit(combined.slice(offset, offset + this.frameSamples))
      offset += this.frameSamples
    }
    this.pending = combined.slice(offset)
  }

  flush(emit: (frame: Int16Array) => void) {
    if (this.pending.length > 0) {
      const padded = new Int16Array(this.frameSamples)
      padded.set(this.pending)
      emit(padded)
    }
    this.pending = new Int16Array(0)
  }
}

export function resampleToPcm16(input: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) return floatsToPcm16(input)
  const ratio = inputRate / outputRate
  const output = new Float32Array(Math.round(input.length / ratio))
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.min(Math.floor((index + 1) * ratio), input.length)
    let sum = 0
    for (let source = start; source < end; source += 1) sum += input[source]
    output[index] = sum / Math.max(1, end - start)
  }
  return floatsToPcm16(output)
}

function floatsToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length)
  for (let index = 0; index < input.length; index += 1) {
    const value = Math.max(-1, Math.min(1, input[index]))
    output[index] = value < 0 ? value * 0x8000 : value * 0x7fff
  }
  return output
}
