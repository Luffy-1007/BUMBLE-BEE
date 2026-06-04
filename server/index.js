import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'

const PORT = process.env.PORT || process.env.BUMBLEBEE_PORT || 8787
const HOST = process.env.HOST || '0.0.0.0'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '..', 'public')

const appAliases = {
  browser: process.platform === 'win32' ? 'msedge' : 'https://www.google.com',
  chrome: 'chrome',
  google: 'chrome',
  edge: 'msedge',
  microsoftedge: 'msedge',
  'microsoft edge': 'msedge',
  vscode: 'code',
  'vs code': 'code',
  'visual studio code': 'code',
  spotify: 'spotify',
  terminal: process.platform === 'win32' ? 'wt' : 'x-terminal-emulator',
  notepad: process.platform === 'win32' ? 'notepad' : 'gedit'
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

function runDetached(command, args = []) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32'
  })
  child.unref()
}

function openTarget(target) {
  if (process.platform === 'win32') {
    runDetached('cmd', ['/c', 'start', '', target])
    return
  }
  if (process.platform === 'darwin') {
    runDetached('open', [target])
    return
  }
  runDetached('xdg-open', [target])
}

function normalizeCommandText(text) {
  return String(text || '')
    .trim()
    .replace(/[.!?。؟]+$/g, '')
    .replace(/\s+/g, ' ')
}

function normalizeTarget(target) {
  return normalizeCommandText(target)
    .replace(/^https?:\/\/\s+/i, 'https://')
    .replace(/^www\.\s+/i, 'www.')
}

function resolveOpenTarget(target) {
  const cleanTarget = normalizeTarget(target)
  const aliasKey = cleanTarget.toLowerCase()
  const resolved = appAliases[aliasKey] || cleanTarget
  const shouldOpenAsUrl = /\.[a-z]{2,}(?:\/.*)?$/i.test(resolved) && !/^https?:\/\//i.test(resolved)
  return {
    label: cleanTarget,
    target: shouldOpenAsUrl ? `https://${resolved}` : resolved,
    resolved
  }
}

async function walkForMatches(root, query, limit = 30) {
  const matches = []
  const needle = query.toLowerCase()

  async function walk(dir, depth) {
    if (matches.length >= limit || depth > 4) return
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (matches.length >= limit) return
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const fullPath = path.join(dir, entry.name)
      if (entry.name.toLowerCase().includes(needle)) {
        matches.push({
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'folder' : 'file'
        })
      }
      if (entry.isDirectory()) await walk(fullPath, depth + 1)
    }
  }

  await walk(root, 0)
  return matches
}

function parseCommand(text) {
  const input = normalizeCommandText(text)
  const lower = input.toLowerCase()

  if (!input) return { action: 'say', message: 'Tell me what you want me to do.' }

  if (appAliases[lower]) return { action: 'open', target: lower }

  const openMatch = lower.match(/^(open|launch|start)\s+(.+)$/)
  if (openMatch) {
    const target = normalizeTarget(openMatch[2])
    return { action: 'open', target }
  }

  const searchMatch = lower.match(/^(search|find)\s+(.+?)(?:\s+in\s+(.+))?$/)
  if (searchMatch) {
    return {
      action: 'search',
      query: searchMatch[2].trim(),
      location: searchMatch[3]?.trim() || os.homedir()
    }
  }

  const folderMatch = lower.match(/^(create|make)\s+(?:a\s+)?(?:new\s+)?folder\s+(.+)$/)
  if (folderMatch) return { action: 'create-folder', name: folderMatch[2].trim() }

  if (lower.includes('cpu') || lower.includes('memory') || lower.includes('system')) {
    return { action: 'system' }
  }

  if (
    lower.includes('shutdown') ||
    lower.includes('shut down') ||
    lower.includes('turn off') ||
    lower.includes('power off') ||
    lower.includes('switch off') ||
    lower.includes('restart')
  ) {
    return {
      action: 'dangerous',
      command: lower.includes('restart') ? 'restart' : 'shutdown',
      message: 'This system action needs an exact YES confirmation. Type YES if you really want to continue.'
    }
  }

  return {
    action: 'say',
    message: `I understood: "${input}". Try commands like "Open Chrome", "Find PDFs", "Create folder AI Project", or "Show system status".`
  }
}

function systemInfo() {
  const total = os.totalmem()
  const free = os.freemem()
  return {
    platform: process.platform,
    hostname: os.hostname(),
    uptime: os.uptime(),
    cpuCount: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
    memory: {
      total,
      free,
      used: total - free,
      percent: Math.round(((total - free) / total) * 100)
    }
  }
}

async function handleCommand(body) {
  const text = String(body?.text || '')
  const intent = parseCommand(text)

  try {
    if (intent.action === 'open') {
      const resolvedTarget = resolveOpenTarget(intent.target)
      openTarget(resolvedTarget.target)
      return {
        status: 200,
        body: {
          intent: { ...intent, target: resolvedTarget.label },
          reply: `Opening ${resolvedTarget.label}.`,
          steps: [`Resolved target: ${resolvedTarget.resolved}`, 'Launch request sent to the OS']
        }
      }
    }

    if (intent.action === 'search') {
      const base = intent.location === 'downloads' ? path.join(os.homedir(), 'Downloads') : intent.location
      const results = await walkForMatches(base, intent.query)
      return { status: 200, body: { intent, reply: `Found ${results.length} matching item${results.length === 1 ? '' : 's'}.`, results } }
    }

    if (intent.action === 'create-folder') {
      const destination = path.join(os.homedir(), 'Desktop', intent.name.replace(/[<>:"/\\|?*]/g, '').trim() || 'Bumblebee Folder')
      await fs.mkdir(destination, { recursive: true })
      return { status: 200, body: { intent, reply: `Created folder on Desktop: ${path.basename(destination)}.`, path: destination } }
    }

    if (intent.action === 'system') {
      const info = systemInfo()
      return {
        status: 200,
        body: {
        intent,
        reply: `System is online. Memory usage is ${info.memory.percent} percent across ${info.cpuCount} CPU threads.`,
        system: {
          platform: process.platform,
          uptime: os.uptime(),
          memoryPercent: info.memory.percent
        }
        }
      }
    }

    if (intent.action === 'dangerous') {
      return { status: 202, body: { intent, reply: intent.message, requiresConfirmation: true } }
    }

    return { status: 200, body: { intent, reply: intent.message } }
  } catch (error) {
    return { status: 500, body: { intent, reply: 'I could not complete that action.', error: error.message } }
  }
}

function handleConfirm(body) {
  const phrase = String(body?.phrase || '').trim()
  const command = String(body?.command || '').trim().toLowerCase()
  if (phrase !== 'YES') {
    return { status: 400, body: { reply: 'Confirmation rejected. Type YES exactly to continue.' } }
  }
  if (command === 'shutdown') {
    execFile(process.platform === 'win32' ? 'shutdown' : 'shutdown', process.platform === 'win32' ? ['/s', '/t', '60'] : ['-h', '+1'])
    return { status: 200, body: { reply: 'Shutdown scheduled for 1 minute from now.' } }
  }
  if (command === 'restart') {
    execFile(process.platform === 'win32' ? 'shutdown' : 'shutdown', process.platform === 'win32' ? ['/r', '/t', '60'] : ['-r', '+1'])
    return { status: 200, body: { reply: 'Restart scheduled for 1 minute from now.' } }
  }
  return { status: 400, body: { reply: 'Unsupported confirmed command.' } }
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(body))
}

async function serveStatic(req, res) {
  const requestedPath = new URL(req.url, `http://${req.headers.host}`).pathname
  const safePath = requestedPath === '/' ? '/index.html' : requestedPath
  const filePath = path.resolve(publicDir, `.${safePath}`)
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  try {
    const content = await fs.readFile(filePath)
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' })
    res.end(content)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }
    if (req.url === '/healthz' && req.method === 'GET') {
      sendJson(res, 200, { ok: true })
      return
    }
    if (req.url === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, platform: process.platform, home: os.homedir() })
      return
    }
    if (req.url === '/api/system' && req.method === 'GET') {
      sendJson(res, 200, systemInfo())
      return
    }
    if (req.url === '/api/command' && req.method === 'POST') {
      const result = await handleCommand(await readJson(req))
      sendJson(res, result.status, result.body)
      return
    }
    if (req.url === '/api/confirm' && req.method === 'POST') {
      const result = handleConfirm(await readJson(req))
      sendJson(res, result.status, result.body)
      return
    }
    await serveStatic(req, res)
  } catch (error) {
    sendJson(res, 500, { reply: 'Bumblebee backend error.', error: error.message })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Bumblebee backend running on http://${HOST}:${PORT}`)
})
