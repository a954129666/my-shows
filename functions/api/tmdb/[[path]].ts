interface Env {
  TMDB_API_KEY?: string
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
  const upstreamUrl = new URL(`https://api.themoviedb.org/3/${path}`)
  incomingUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, value))
  upstreamUrl.searchParams.set('api_key', context.env.TMDB_API_KEY)
  if (!upstreamUrl.searchParams.has('language')) upstreamUrl.searchParams.set('language', 'zh-CN')

  const response = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } })
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': path.startsWith('tv/') ? 'public, max-age=3600' : 'no-store',
    },
  })
}
