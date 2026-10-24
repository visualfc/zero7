import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const certDir = join(root, '.cert')
const certFile = join(certDir, 'localhost.pem')
const keyFile = join(certDir, 'localhost-key.pem')
const host = process.env.ZERO7_DEV_HOST ?? 'localhost'

if (existsSync(certFile) && existsSync(keyFile)) {
  console.log(`开发证书已存在：${certFile}`)
  process.exit(0)
}

mkdirSync(certDir, { recursive: true })
try {
  execFileSync('mkcert', ['-cert-file', certFile, '-key-file', keyFile, 'localhost', '127.0.0.1', host], { cwd: root, stdio: 'inherit' })
} catch {
  console.error('未找到 mkcert。请先安装 mkcert，并运行：mkcert -install')
  process.exit(1)
}
