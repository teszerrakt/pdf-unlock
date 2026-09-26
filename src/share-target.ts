// Android share sheet: the service worker parks the shared PDF here, the page takes it and deletes the cache.
export const SHARE_ACTION = '/share-target'
export const SHARE_CACHE = 'shared-pdf'
export const SHARED_FILE = '/shared-file'
export const SHARED_NAME_HEADER = 'x-file-name'
export const SHARED_AT_HEADER = 'x-shared-at'

// Another window may be mid-share, so only a file parked longer ago than this is a leftover to sweep.
export const isLeftover = (sharedAt: string | null, now: number) => now - Number(sharedAt ?? 0) > 60_000
