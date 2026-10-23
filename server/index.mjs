import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'

const port = Number(process.env.LINXI_BRIDGE_PORT || 8787)
const app = express()
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`灵矽桥接服务已启动：http://127.0.0.1:${port}`)
})
const browserServer = new WebSocketServer({ server, path: '/linxi' })

app.get('/', (_request, response) => {
  response.type('html').send(`<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>小象棋伴｜灵矽桥接服务</title>
<style>body{font:16px system-ui;color:#26324a;background:#f7f3ea;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#fffdf8;border:1px solid #e6dfd2;border-radius:20px;padding:32px;max-width:560px;box-shadow:0 12px 30px #0000000d}h1{margin-top:0;color:#d95642}code{background:#f0ebe2;padding:3px 7px;border-radius:6px}a{color:#548aa8}</style>
<div class="card"><h1>灵矽桥接服务运行正常</h1><p>这里是语音桥接端口，不是小象棋伴网页。</p><p>请启动完整开发服务后，打开终端中标记为“网页”的地址，通常是：</p><p><a href="http://localhost:5173/"><code>http://localhost:5173/</code></a></p><p>如果 5173 被占用，请以终端实际显示的地址为准。</p></div></html>`)
})

app.get('/api/linxi/status', (_request, response) => {
  response.json({
    configured: Boolean(process.env.LINXI_DEVICE_ID && (process.env.LINXI_TOKEN || process.env.LINXI_USE_OTA === 'true')),
    mode: process.env.LINXI_USE_OTA === 'true' ? 'ota' : 'token',
  })
})

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

async function resolveCredentials(clientId) {
  const deviceId = process.env.LINXI_DEVICE_ID
  if (!deviceId) throw new Error('缺少 LINXI_DEVICE_ID')

  if (process.env.LINXI_USE_OTA === 'true') {
    const otaUrl = process.env.LINXI_OTA_URL || 'https://xrobo.qiniuapi.com/v1/ota/'
    const otaResponse = await fetch(otaUrl, {
      method: 'POST',
      headers: {
        'Activation-Version': '1',
        'Accept-Language': 'zh-CN',
        'Content-Type': 'application/json',
        'Device-Id': deviceId,
        'Client-Id': clientId,
        'User-Agent': 'xiaoxiang-qiban/0.1.0',
      },
      body: JSON.stringify({
        version: 0,
        uuid: clientId,
        application: { name: 'xiaoxiang-qiban', version: '0.1.0', elf_sha256: 'web-client' },
        ota: { label: 'xiaoxiang-qiban' },
        board: { type: 'xiaoxiang-qiban-web', ssid: '', rssi: 0, channel: 0, ip: '127.0.0.1', mac: deviceId },
        flash_size: 0,
        minimum_free_heap_size: 0,
        mac_address: deviceId,
        chip_model_name: 'web',
        partition_table: [],
      }),
    })
    if (!otaResponse.ok) throw new Error(`OTA 获取连接信息失败（${otaResponse.status}）`)
    const data = await otaResponse.json()
    if (data.activation?.code) throw new Error(`设备尚未绑定，激活码：${data.activation.code}`)
    if (!data.websocket?.token) throw new Error(data.error || 'OTA 响应中没有 WebSocket Token')
    return { deviceId, token: data.websocket.token, url: data.websocket.url }
  }

  const token = process.env.LINXI_TOKEN
  if (!token) throw new Error('缺少 LINXI_TOKEN')
  return { deviceId, token, url: process.env.LINXI_WS_URL || 'wss://xrobo-io.qiniuapi.com/v1/ws/' }
}

browserServer.on('connection', async (browser) => {
  let upstream
  let sessionId = ''
  let audioFrames = 0
  let audioBytes = 0
  const clientId = process.env.LINXI_CLIENT_ID || crypto.randomUUID()
  console.log('[灵矽] 浏览器语音会话开始')

  const closeUpstream = () => {
    if (upstream?.readyState === WebSocket.OPEN) upstream.close(1000, '浏览器会话结束')
  }

  browser.on('close', closeUpstream)
  browser.on('error', closeUpstream)

  try {
    const credentials = await resolveCredentials(clientId)
    upstream = new WebSocket(credentials.url, {
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        'Device-Id': credentials.deviceId,
        'Client-Id': clientId,
        'Protocol-Version': '1',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
    })

    upstream.binaryType = 'arraybuffer'
    upstream.on('open', () => {
      upstream.send(JSON.stringify({
        type: 'hello',
        version: 1,
        features: { mcp: false },
        transport: 'websocket',
        agent_params: {
          assistant_title: '零七教练',
          application: 'ZERO7 儿童象棋闯关',
        },
        audio_params: {
          format: 'pcm',
          sample_rate: 16000,
          channels: 1,
          bit_depth: 16,
          endianness: 'little',
          frame_duration: 20,
          frame_size: 320,
          sample_format: 'signed_int16',
          play_buffer_duration: 1000,
        },
      }))
    })

    upstream.on('message', (data, isBinary) => {
      if (isBinary) return
      try {
        const message = JSON.parse(data.toString())
        if (message.type === 'hello') {
          sessionId = message.session_id || ''
          console.log(`[灵矽] 握手成功，会话：${sessionId || '未返回 ID'}`)
          send(browser, { type: 'ready', sessionId })
          return
        }
        if (message.type === 'stt') console.log(`[灵矽] 识别结果：${message.text || '空文本'}`)
        if (message.type === 'tts') console.log(`[灵矽] TTS 状态：${message.state || '未知'}`)
        send(browser, message)
      } catch {
        send(browser, { type: 'error', message: '收到无法解析的灵矽消息' })
      }
    })

    upstream.on('unexpected-response', (_request, response) => {
      send(browser, { type: 'error', message: `灵矽连接被拒绝（${response.statusCode}）` })
    })
    upstream.on('error', (error) => send(browser, { type: 'error', message: `灵矽连接失败：${error.message}` }))
    upstream.on('close', () => send(browser, { type: 'disconnected' }))
  } catch (error) {
    send(browser, { type: 'error', message: error instanceof Error ? error.message : '灵矽配置无效' })
  }

  browser.on('message', (data, isBinary) => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return
    if (isBinary) {
      audioFrames += 1
      audioBytes += data.byteLength
      upstream.send(data, { binary: true })
      return
    }
    try {
      const message = JSON.parse(data.toString())
      if (message.type === 'listen') {
        console.log(message.state === 'start'
          ? '[灵矽] 开始录音'
          : `[灵矽] 停止录音，已发送 ${audioFrames} 帧 / ${audioBytes} 字节`)
        upstream.send(JSON.stringify({
          session_id: sessionId,
          type: 'listen',
          state: message.state,
          mode: 'manual',
        }))
      }
    } catch {
      send(browser, { type: 'error', message: '浏览器消息格式错误' })
    }
  })
})

function shutdown() {
  browserServer.close()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
