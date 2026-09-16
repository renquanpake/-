// studyfarm service worker — 最小 cache-first（离线可开）
const CACHE = 'studyfarm-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request)
      const refresh = fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') cache.put(request, res.clone())
          return res
        })
        .catch(() => hit)
      return hit || refresh
    })
  )
})
