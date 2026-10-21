// Private campaign images are immutable UUID objects. Reuse downloaded bytes only
// in this page's memory; never persist signed URLs or change bucket permissions.
export function createCampaignImageCache({ origin, fetcher = globalThis.fetch, urls = URL, maxBytes = 40 * 1024 * 1024, maxEntries = 64 } = {}) {
  const entries = new Map(), assignments = new WeakMap();
  let bytes = 0;
  function keyFor(source) {
    try {
      const url = new URL(source);
      if (url.origin !== origin || !/^\/storage\/v1\/object\/sign\/campaign-images\/[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(url.pathname) || !url.searchParams.get('token')) return null;
      return url.origin + url.pathname;
    } catch { return null; }
  }
  function discard(key, entry) {
    if (entries.get(key) !== entry) return;
    entries.delete(key); bytes -= entry.bytes;
    if (entry.url) urls.revokeObjectURL(entry.url);
  }
  async function resolve(source) {
    const key = keyFor(source);
    if (!key) return source;
    let entry = entries.get(key);
    if (entry) { entries.delete(key); entries.set(key, entry); return entry.promise; }
    // Bound concurrent downloads as well as retained blobs.
    if (entries.size >= maxEntries) {
      const oldest = [...entries].find(([, item]) => item.url);
      if (!oldest) return source;
      discard(...oldest);
    }
    entry = { bytes: 0, url: null, promise: null };
    entries.set(key, entry);
    entry.promise = (async () => {
      try {
        const response = await fetcher(source, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
        if (!response.ok || !/^image\/(png|jpeg|webp)(;|$)/i.test(response.headers.get('content-type') || '')) throw Error('Image unavailable');
        const blob = await response.blob();
        if (blob.size > 5 * 1024 * 1024 || blob.size > maxBytes) throw Error('Image too large');
        while (bytes + blob.size > maxBytes) {
          const oldest = [...entries].find(([, item]) => item.url);
          if (!oldest) throw Error('Cache full');
          discard(...oldest);
        }
        entry.url = urls.createObjectURL(blob); entry.bytes = blob.size; bytes += blob.size;
        return entry.url;
      } catch {
        discard(key, entry);
        return source; // Preserve ordinary image loading if CORS/network blocks fetch.
      }
    })();
    return entry.promise;
  }
  return {
    async setSource(image, source) {
      const assignment = {}; assignments.set(image, assignment);
      const resolved = await resolve(source);
      if (assignments.get(image) === assignment && image.getAttribute('src') !== resolved) image.src = resolved;
    },
    clear() { for (const [key, entry] of entries) if (entry.url) discard(key, entry); },
  };
}
