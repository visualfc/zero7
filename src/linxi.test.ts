import { describe, expect, it } from 'vitest'
import { PcmFrameBuffer, resampleToPcm16 } from './linxi'

describe('灵矽音频处理', () => {
  it('将 48kHz 音频降采样为 16kHz PCM16', () => {
    const input = new Float32Array(480)
    input.fill(0.5)
    const output = resampleToPcm16(input, 48000, 16000)
    expect(output).toHaveLength(160)
    expect(output[0]).toBeGreaterThan(16000)
    expect(output[0]).toBeLessThan(16400)
  })

  it('把超出范围的浮点采样裁剪到 PCM16 范围', () => {
    const output = resampleToPcm16(new Float32Array([-2, 2]), 16000, 16000)
    expect(output[0]).toBe(-32768)
    expect(output[1]).toBe(32767)
  })

  it('严格切分为每帧 320 个采样点并补齐尾帧', () => {
    const buffer = new PcmFrameBuffer(320)
    const frames: Int16Array[] = []
    buffer.push(new Int16Array(500).fill(7), (frame) => frames.push(frame))
    buffer.push(new Int16Array(200).fill(9), (frame) => frames.push(frame))
    buffer.flush((frame) => frames.push(frame))

    expect(frames).toHaveLength(3)
    expect(frames.every((frame) => frame.length === 320)).toBe(true)
    expect(frames[0][0]).toBe(7)
    expect(frames[2][59]).toBe(9)
    expect(frames[2][60]).toBe(0)
  })
})
