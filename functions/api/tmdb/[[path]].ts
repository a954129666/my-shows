interface Env {
  TMDB_API_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

interface PagesContext {
  request: Request
  env: Env
  params: { path?: string | string[] }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (!context.env.TMDB_API_KEY) {
    return Response.json({ message: 'TMDB_API_KEY is not configured' }, { status: 503 })
  }

  const pathValue = context.params.path
  const path = Array.isArray(pathValue) ? pathValue.join('/') : pathValue ?? ''
  const incomingUrl = new URL(context.request.url)
  if (context.request.method !== 'GET') return Response.json({ message: 'Method not allowed' }, { status: 405 })
  if (!/^(search\/tv|tv\/\d+)$/.test(path)) return Response.json({ message: 'Not found' }, { status: 404 })
  const authorization = context.request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return Response.json({ message: 'Login required' }, { status: 401 })
  if (!context.env.VITE_SUPABASE_URL || !context.env.VITE_SUPABASE_ANON_KEY) {
    return Response.json({ message: 'Public beta protection is not configured' }, { status: 503 })
  }
  let user: { id?: string }
  try {
    const auth = await fetch(`${context.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: context.env.VITE_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(10000),
    })
    if (!auth.ok) return Response.json({ message: 'Login expired' }, { status: auth.status === 401 || auth.status === 403 ? 401 : 503 })
    user = await auth.json()
  } catch { return Response.json({ message: 'Authentication temporarily unavailable' }, { status: 503 }) }
  if (!user.id) return Response.json({ message: 'Login required' }, { status: 401 })
  try {
    const allowance = await fetch(`${context.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/consume_tmdb_request`, {
      method: 'POST', headers: { Authorization: authorization, apikey: context.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000),
    })
    if (!allowance.ok) return Response.json({ message: 'Rate protection unavailable' }, { status: 503 })
    if (!(await allowance.json())) return Response.json({ message: 'Please try again later' }, { status: 429, headers: { 'Retry-After': '60' } })
  } catch { return Response.json({ message: 'Rate protection unavailable' }, { status: 503 }) }
  const upstreamUrl = new URL(`https://api.themoviedb.org/3/${path}`)
  if (path === 'search/tv') {
    const query = incomingUrl.searchParams.get('query')?.trim() ?? ''
    if (!query || query.length > 100) return Response.json({ message: 'Invalid query' }, { status: 400 })
    upstreamUrl.searchParams.set('query', query)
  }
  upstreamUrl.searchParams.set('language', 'zh-CN')
  const cacheKey = new Request(new URL(`/api/tmdb/${path}?${upstreamUrl.searchParams}`, incomingUrl.origin).toString())
  const cache = (caches as unknown as { default: Cache }).default
  const cached = await cache.match(cacheKey)
  if (cached) return cached
  upstreamUrl.searchParams.set('api_key', context.env.TMDB_API_KEY)
  if (!upstreamUrl.searchParams.has('language')) upstreamUrl.searchParams.set('language', 'zh-CN')

  let response: Response | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(upstreamUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
      if (response.status < 500) break
      await response.body?.cancel()
      response = undefined
    } catch { response = undefined }
  }
  if (!response) return Response.json({ message: 'TMDB temporarily unavailable' }, { status: 502 })
  const result = new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': response.ok ? 'public, max-age=3600' : 'no-store',
    },
  })
  if (response.ok) await cache.put(cacheKey, result.clone())
  result.headers.set('Cache-Control', 'private, no-store')
  return result
}
