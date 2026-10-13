import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'

// Compile only the pure helpers; all cloud and storage calls below are in-memory mocks.
const outputDir = mkdtempSync(join(tmpdir(), 'my-shows-sync-test-'))
after(() => rmSync(outputDir, { recursive: true, force: true }))
const compile = spawnSync(process.execPath, [
  resolve('node_modules/typescript/bin/tsc'),
  'src/hooks/cloudShowSync.ts', 'src/hooks/showProgress.ts',
  '--outDir', outputDir, '--target', 'es2023', '--module', 'commonjs',
  '--skipLibCheck', '--types', 'node', '--ignoreConfig',
], { encoding: 'utf8' })
assert.equal(compile.status, 0, compile.stdout + compile.stderr)
const require = createRequire(import.meta.url)
const { CloudShowSync } = require(join(outputDir, 'hooks/cloudShowSync.js'))
const { advanceEpisode, finishCurrentSeason } = require(join(outputDir, 'hooks/showProgress.js'))

function show(id = 'a', patch = {}) {
  return {
    id, tmdbId: 101, name: '测试剧集', englishName: 'Test Series', country: 'US',
    seasons: 2, episodes: 6, seasonEpisodes: [{ season: 1, episodes: 3 }, { season: 2, episodes: 3 }],
    status: 'ended', watchStatus: 'watching', currentSeason: 1, currentEpisode: 0,
    createdAt: '2026-10-13T00:00:00.000Z', ...patch,
  }
}

function harness({ remote = [show()], storage = new Map(), draftStorage, userId = 'account-a', ...overrides } = {}) {
  const server = new Map(remote.map((item) => [item.id, structuredClone(item)]))
  const states = []
  const writes = []
  const deletions = []
  const sync = new CloudShowSync(userId, {
    delay: 60_000,
    fetch: async () => [...server.values()],
    upsert: async (items) => {
      writes.push(structuredClone(items))
      for (const item of items) server.set(item.id, structuredClone(item))
    },
    remove: async (ids) => {
      deletions.push([...ids])
      for (const id of ids) server.delete(id)
    },
    storage: draftStorage ?? {
      read: (account) => structuredClone(storage.get(account) ?? null),
      write: (account, draft) => draft ? storage.set(account, structuredClone(draft)) : storage.delete(account),
    },
    onChange: (state) => states.push(structuredClone(state)),
    ...overrides,
  })
  return { sync, server, states, writes, deletions, storage, latest: () => states.at(-1) }
}

test('failed cloud read exposes no editable rows and retry loads the correct cloud library', async (t) => {
  let failRead = true
  const h = harness({ fetch: async () => {
    if (failRead) throw new Error('network unavailable')
    return [show('cloud-only')]
  } })
  t.after(() => h.sync.dispose())
  await h.sync.load()
  assert.equal(h.latest().cloudReady, false)
  assert.equal(h.latest().cloudLoading, false)
  assert.equal(h.latest().syncState, 'error')
  assert.deepEqual(h.latest().shows, [])
  h.sync.update(() => [show('local-example')])
  assert.deepEqual(h.latest().shows, [])
  assert.equal(h.storage.size, 0)
  failRead = false
  await h.sync.retry()
  assert.equal(h.latest().cloudReady, true)
  assert.deepEqual(h.latest().shows.map((item) => item.id), ['cloud-only'])
  assert.equal(h.writes.length, 0)
})

test('failed deletion cannot become saved through an upsert and waits for explicit retry', async (t) => {
  let failDelete = true
  let writes = 0
  let deletes = 0
  const h = harness({ remote: [show('a'), show('b')],
    upsert: async () => { writes += 1 },
    remove: async () => {
      deletes += 1
      if (failDelete) throw new Error('delete denied')
    },
  })
  t.after(() => h.sync.dispose())
  await h.sync.load()
  h.sync.update((items) => items.filter((item) => item.id !== 'a').map((item) => ({ ...item, currentEpisode: 1 })))
  await h.sync.retry()
  assert.equal(h.latest().syncState, 'error')
  assert.match(h.latest().syncError, /delete denied/)
  assert.deepEqual(h.storage.get('account-a').deletedIds, ['a'])
  assert.equal(h.storage.get('account-a').changedShows[0].currentEpisode, 1)
  h.sync.update((items) => items.map((item) => ({ ...item, currentEpisode: 2 })))
  await new Promise((done) => setTimeout(done, 10))
  assert.equal(writes, 1)
  assert.equal(deletes, 1)
  assert.equal(h.latest().syncState, 'error')
  failDelete = false
  await h.sync.retry()
  assert.equal(writes, 2)
  assert.equal(deletes, 2)
  assert.equal(h.latest().syncState, 'saved')
  assert.equal(h.storage.size, 0)
})

test('updates arriving during a save are serialized and the newest progress wins', async (t) => {
  let releaseFirst
  const firstSave = new Promise((done) => { releaseFirst = done })
  const episodes = []
  let activeWrites = 0
  let maximumWrites = 0
  const h = harness({ upsert: async (items) => {
    activeWrites += 1
    maximumWrites = Math.max(maximumWrites, activeWrites)
    episodes.push(items[0].currentEpisode)
    if (episodes.length === 1) await firstSave
    activeWrites -= 1
  } })
  t.after(() => h.sync.dispose())
  await h.sync.load()
  h.sync.update((items) => items.map((item) => ({ ...item, currentEpisode: 1 })))
  const saving = h.sync.retry()
  h.sync.update((items) => items.map((item) => ({ ...item, currentEpisode: 2 })))
  await h.sync.retry()
  assert.deepEqual(episodes, [1])
  releaseFirst()
  await saving
  assert.deepEqual(episodes, [1, 2])
  assert.equal(maximumWrites, 1)
  assert.equal(h.latest().shows[0].currentEpisode, 2)
  assert.equal(h.latest().syncState, 'saved')
})

test('backup restore upserts before deleting only the known removed IDs', async (t) => {
  let failWrite = true
  const operations = []
  const h = harness({ remote: [show('old'), show('kept')],
    upsert: async (items) => {
      operations.push(['upsert', items.map((item) => item.id)])
      if (failWrite) throw new Error('save unavailable')
    },
    remove: async (ids) => { operations.push(['delete', [...ids]]) },
  })
  t.after(() => h.sync.dispose())
  await h.sync.load()
  h.sync.update(() => [show('new'), show('kept')])
  await h.sync.retry()
  assert.deepEqual(operations, [['upsert', ['new']]])
  assert.equal(h.latest().syncState, 'error')
  failWrite = false
  await h.sync.retry()
  assert.deepEqual(operations.at(-1), ['delete', ['old']])
  assert.equal(h.latest().syncState, 'saved')
})

test('refresh recovers account-scoped changes and tombstones without overwriting untouched remote rows', async (t) => {
  const storage = new Map()
  const first = harness({ remote: [show('a'), show('b'), show('deleted')], storage,
    upsert: async () => { throw new Error('offline') },
  })
  await first.sync.load()
  first.sync.update((items) => [
    ...items.filter((item) => item.id !== 'deleted').map((item) => item.id === 'a' ? { ...item, currentEpisode: 2 } : item),
    show('new'),
  ])
  await first.sync.retry()
  first.sync.dispose()
  const restored = harness({ storage, remote: [show('a'), show('b', { currentEpisode: 3 }), show('deleted')] })
  const otherAccount = harness({ storage, userId: 'account-b', remote: [show('other')] })
  t.after(() => { restored.sync.dispose(); otherAccount.sync.dispose() })
  await restored.sync.load()
  assert.equal(restored.latest().cloudReady, true)
  assert.equal(restored.latest().syncState, 'error')
  assert.equal(restored.latest().shows.find((item) => item.id === 'a').currentEpisode, 2)
  assert.equal(restored.latest().shows.find((item) => item.id === 'b').currentEpisode, 3)
  assert.equal(restored.latest().shows.some((item) => item.id === 'deleted'), false)
  assert.equal(restored.writes.length, 0)
  await otherAccount.sync.load()
  assert.deepEqual(otherAccount.latest().shows.map((item) => item.id), ['other'])
  assert.equal(otherAccount.latest().syncState, 'saved')
  await restored.sync.retry()
  assert.equal(restored.server.has('deleted'), false)
  assert.equal(restored.server.get('a').currentEpisode, 2)
  assert.equal(restored.server.get('b').currentEpisode, 3)
  assert.equal(storage.size, 0)
})

test('disposing during an upsert prevents the remaining delete and state callbacks', async () => {
  let release
  const gate = new Promise((done) => { release = done })
  const h = harness({ upsert: async () => gate })
  await h.sync.load()
  h.sync.update(() => [])
  const pending = h.sync.retry()
  h.sync.dispose()
  const count = h.states.length
  release()
  await pending
  assert.equal(h.deletions.length, 0)
  assert.equal(h.states.length, count)
  assert.deepEqual(h.storage.get('account-a').deletedIds, ['a'])
})

test('blocked draft storage warns immediately and promptly saves to cloud before clearing the warning', async (t) => {
  let release
  const gate = new Promise((done) => { release = done })
  let blocked = true
  let writes = 0
  const h = harness({
    upsert: async () => { writes += 1; await gate },
    draftStorage: {
      read: () => null,
      write: () => { if (blocked) throw new Error('quota exceeded') },
    },
  })
  t.after(() => h.sync.dispose())
  await h.sync.load()
  h.sync.update((items) => items.map((item) => ({ ...item, currentEpisode: 1 })))
  assert.equal(writes, 1)
  assert.equal(h.latest().syncState, 'saving')
  assert.match(h.latest().syncError, /请勿刷新/)
  blocked = false
  release()
  await new Promise((done) => setImmediate(done))
  assert.equal(h.latest().syncState, 'saved')
  assert.equal(h.latest().syncError, null)
})

test('episode advancement starts at zero and advances across seasons only on another watched episode', () => {
  const start = show('a', { currentEpisode: 0, watchStatus: 'planned' })
  const first = advanceEpisode(start)
  assert.equal(first.currentSeason, 1)
  assert.equal(first.currentEpisode, 1)
  assert.equal(first.watchStatus, 'watching')
  const rollover = advanceEpisode(show('a', { currentEpisode: 3 }))
  assert.equal(rollover.currentSeason, 2)
  assert.equal(rollover.currentEpisode, 1)
  assert.equal(rollover.watchStatus, 'watching')
})

test('ongoing series never advance into an announced season with no aired episodes', () => {
  const waiting = show('a', {
    currentSeason: 1, currentEpisode: 3, status: 'ongoing',
    seasonEpisodes: [{ season: 1, episodes: 3 }, { season: 2, episodes: 0 }],
  })
  assert.deepEqual(advanceEpisode(waiting), waiting)
  const upcoming = { ...waiting, currentSeason: 2, currentEpisode: 0 }
  assert.deepEqual(advanceEpisode(upcoming), upcoming)
  const released = { ...waiting, seasonEpisodes: [{ season: 1, episodes: 3 }, { season: 2, episodes: 2 }] }
  assert.equal(advanceEpisode(released).currentSeason, 2)
  assert.equal(advanceEpisode(released).currentEpisode, 1)
})

test('watching the final aired episode completes ended series while ongoing series remain watching', () => {
  const ended = advanceEpisode(show('a', { currentSeason: 2, currentEpisode: 2 }))
  assert.equal(ended.currentEpisode, 3)
  assert.equal(ended.watchStatus, 'completed')
  const ongoing = show('a', { currentSeason: 2, currentEpisode: 2, status: 'ongoing' })
  const lastKnown = advanceEpisode(ongoing)
  assert.equal(lastKnown.currentEpisode, 3)
  assert.equal(lastKnown.watchStatus, 'watching')
  assert.deepEqual(advanceEpisode(lastKnown), lastKnown)
})

test('finishing a season records its final episode without starting the next season', () => {
  const next = finishCurrentSeason(show())
  assert.equal(next.currentSeason, 1)
  assert.equal(next.currentEpisode, 3)
  assert.equal(next.watchStatus, 'watching')
  assert.equal(finishCurrentSeason(show('a', { currentSeason: 2 })).watchStatus, 'completed')
  assert.equal(finishCurrentSeason(show('a', { currentSeason: 2, status: 'ongoing' })).watchStatus, 'watching')
})
