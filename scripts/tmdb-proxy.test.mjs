import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../functions/api/tmdb/[[path]].ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
const { onRequest } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const originalFetch = globalThis.fetch
const originalCaches = globalThis.caches
const env = { TMDB_API_KEY: 'test', VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test' }
const context = (path, token = true) => ({ env, params: { path: path.split('/') }, request: new Request(`https://test.pages.dev/api/tmdb/${path}?query=test`, { headers: token ? { Authorization: 'Bearer test' } : {} }) })
try {
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('should not call upstream') }
  assert.equal((await onRequest(context('search/tv', false))).status, 401)
  assert.equal((await onRequest(context('account/1'))).status, 404)
  assert.equal(calls, 0)
  globalThis.fetch = async (url) => String(url).includes('/auth/') ? Response.json({ id: 'user-a' }) : Response.json(false)
  assert.equal((await onRequest(context('search/tv'))).status, 429)
  const stored = new Map()
  globalThis.caches = { default: { match: async key => stored.get(key.url)?.clone(), put: async (key, value) => stored.set(key.url, value) } }
  let upstream = 0
  globalThis.fetch = async (url) => {
    if (String(url).includes('/auth/')) return Response.json({ id: 'user-a' })
    if (String(url).includes('/rpc/')) return Response.json(true)
    upstream++
    return Response.json({ results: [] })
  }
  assert.equal((await onRequest(context('search/tv'))).status, 200)
  assert.equal((await onRequest(context('search/tv'))).status, 200)
  assert.equal(upstream, 1)
  stored.clear()
  globalThis.fetch = async (url) => {
    if (String(url).includes('/auth/')) return Response.json({ id: 'user-a' })
    if (String(url).includes('/rpc/')) return Response.json(true)
    throw new Error('network unavailable')
  }
  assert.equal((await onRequest(context('search/tv'))).status, 502)
  console.log('TMDB proxy: anonymous access, route allowlist, quota, cache and network failure passed')
} finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches }
