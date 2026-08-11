import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function tmdbDevProxy(apiKey?: string): Plugin {
  return {
    name: 'tmdb-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/tmdb/')) return next()
        if (!apiKey) {
          response.statusCode = 503
          response.end(JSON.stringify({ message: 'TMDB_API_KEY is not configured' }))
          return
        }

        try {
          const pathAndQuery = request.url.slice('/api/tmdb'.length)
          const upstreamUrl = new URL(`https://api.themoviedb.org/3${pathAndQuery}`)
          upstreamUrl.searchParams.set('api_key', apiKey)
          const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } })
          response.statusCode = upstream.status
          response.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
          response.end(Buffer.from(await upstream.arrayBuffer()))
        } catch {
          response.statusCode = 502
          response.end(JSON.stringify({ message: 'TMDB request failed' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  // 让构建产物可从本地文件夹直接打开，而非仅能由 Web 服务器提供。
  base: './',
  plugins: [react(), tailwindcss(), tmdbDevProxy(env.TMDB_API_KEY)],
  }
})
