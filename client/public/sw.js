// Klipz Service Worker for PWA and Share Target functionality
const CACHE_NAME = 'klipz-cache-v1';
const SHARE_TARGET_CACHE = 'klipz-share-target';

// Assets to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== SHARE_TARGET_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - handle share target and network requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Handle Share Target POST requests
  if (url.pathname === '/share' && event.request.method === 'POST') {
    console.log('[SW] Handling share target request');
    event.respondWith(handleShareTarget(event.request));
    return;
  }
  
  // For other requests, try network first, then cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Only cache same-origin requests
            if (url.origin === self.location.origin) {
              cache.put(event.request, responseClone);
            }
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});

// Handle Share Target POST requests
async function handleShareTarget(request) {
  console.log('[SW] Processing share target...');
  
  try {
    const formData = await request.formData();
    
    // Extract shared data
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';
    const files = formData.getAll('media');
    
    console.log('[SW] Shared data:', { title, text, url, filesCount: files.length });
    
    // Store files in cache for the share page to retrieve
    if (files.length > 0) {
      const cache = await caches.open(SHARE_TARGET_CACHE);
      const fileData = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file instanceof File) {
          // Store file in cache
          const fileKey = `shared-file-${Date.now()}-${i}`;
          const response = new Response(file, {
            headers: {
              'Content-Type': file.type,
              'X-File-Name': encodeURIComponent(file.name),
              'X-File-Size': file.size.toString(),
            },
          });
          await cache.put(fileKey, response);
          fileData.push({
            key: fileKey,
            name: file.name,
            type: file.type,
            size: file.size,
          });
        }
      }
      
      // Store file metadata in sessionStorage via client
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({
          type: 'SHARE_TARGET_FILES',
          files: fileData,
        });
      }
    }
    
    // Build redirect URL with query params
    const shareUrl = new URL('/share', self.location.origin);
    if (title) shareUrl.searchParams.set('title', title);
    if (text) shareUrl.searchParams.set('text', text);
    if (url) shareUrl.searchParams.set('url', url);
    
    // Redirect to share page
    return Response.redirect(shareUrl.toString(), 303);
    
  } catch (error) {
    console.error('[SW] Error handling share target:', error);
    // Redirect to share page even on error
    return Response.redirect('/share?error=processing', 303);
  }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);
  
  if (event.data.type === 'GET_SHARED_FILES') {
    // Retrieve cached files and send back to client
    caches.open(SHARE_TARGET_CACHE).then(async (cache) => {
      const keys = await cache.keys();
      const files = [];
      
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          const fileName = decodeURIComponent(response.headers.get('X-File-Name') || 'unknown');
          const file = new File([blob], fileName, { type: blob.type });
          files.push(file);
          // Clean up after retrieval
          await cache.delete(request);
        }
      }
      
      event.source.postMessage({
        type: 'SHARED_FILES_RESULT',
        files: files,
      });
    });
  }
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service worker loaded');
