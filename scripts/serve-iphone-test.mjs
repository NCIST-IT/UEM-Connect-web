import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../.local/iphone-test/', import.meta.url))
const port = Number(process.env.UEM_TEST_PORT ?? 5177)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid UEM_TEST_PORT')
const types = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.ics': 'text/calendar;charset=utf-8' }

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  const url = new URL(request.url, 'http://localhost')
  const path = url.pathname
  // Serve only this fixed page, its bundled assets, and the prepared calendar.
  const file = path === '/' || path === '/index.html' ? 'index.html'
    : path === '/calendar.ics' || path === '/import.ics' ? 'calendar.ics'
      : /^\/assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(path) ? path.slice(1) : undefined
  if (!file) {
    response.writeHead(404).end('Not found')
    return
  }
  try {
    const body = await readFile(resolve(root, file))
    response.writeHead(200, {
      'Content-Type': types[extname(file)],
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Let iOS handle text/calendar natively; do not suggest a file download via disposition.
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch (error) {
    const missing = error.code === 'ENOENT'
    response.writeHead(missing ? 404 : 500).end(missing ? 'Not found' : 'Server error')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`iPhone calendar test listening on http://0.0.0.0:${port}`)
})
