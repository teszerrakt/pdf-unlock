/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { SHARE_ACTION, SHARE_CACHE, SHARED_AT_HEADER, SHARED_FILE, SHARED_NAME_HEADER } from './share-target'

declare const self: ServiceWorkerGlobalScope

// Registered before Workbox so its router never sees the share POST.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== SHARE_ACTION) return
  event.respondWith(receiveShare(event.request))
})

async function receiveShare(request: Request) {
  const form = await request.formData().catch(() => new FormData())
  // Take the first file under any field name: browsers do not all use the manifest's name.
  const file = [...form.values()].find((value): value is File => value instanceof File)
  // Chrome 153 on Android sends an empty form for every file share (Chromium bugs 548571656, 547426657).
  if (!file) return Response.redirect('/?shared', 303)
  const cache = await caches.open(SHARE_CACHE)
  const headers = { [SHARED_NAME_HEADER]: encodeURIComponent(file.name), [SHARED_AT_HEADER]: String(Date.now()) }
  await cache.put(SHARED_FILE, new Response(file, { headers }))
  return Response.redirect('/?shared', 303)
}

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))
