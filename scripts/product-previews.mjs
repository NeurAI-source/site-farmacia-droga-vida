import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_IMAGE = 5 * 1024 * 1024;

export function publicProductSource(value, projectUrl) {
  try {
    const url = new URL(value);
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(projectUrl) && url.origin === projectUrl &&
      !url.username && !url.password && !url.search && !url.hash &&
      /^\/storage\/v1\/object\/public\/product-images\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpe?g|webp)$/i.test(url.pathname);
  } catch { return false; }
}

export async function buildProductPreviews({ catalog, projectUrl, cacheDir, outDir, fetcher = fetch }) {
  const previews = {}, stats = { images: 0, sourceBytes: 0, previewBytes: 0 };
  const sources = [...new Set(catalog.products.map(p => p.imageUrl).filter(url => publicProductSource(url, projectUrl)))];
  await mkdir(join(cacheDir, 'originals'), { recursive: true });
  await mkdir(join(outDir, 'assets', 'product-previews'), { recursive: true });
  for (const source of sources) {
    const cached = join(cacheDir, 'originals', `${digest(source)}.bin`);
    let bytes;
    try { bytes = await readFile(cached); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!bytes) {
      const response = await fetcher(source, { redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('Public product preview download failed');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_IMAGE) throw Error('Public product image exceeds preview limit');
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
    }
    if (!bytes.length || bytes.length > MAX_IMAGE) throw Error('Invalid public image cache');
    // Preserve aspect ratio and alpha, never crop or enlarge; exclude SVG/animated inputs.
    const metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw Error('Unsupported public product image');
    const resized = await sharp(bytes, { limitInputPixels: 40000000 }).rotate()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86, effort: 5 }).toBuffer();
    const smaller = resized.length < bytes.length, body = smaller ? resized : bytes;
    const extension = smaller ? 'webp' : metadata.format === 'jpeg' ? 'jpg' : metadata.format;
    const relative = `assets/product-previews/${digest(body)}.${extension}`;
    await writeFile(join(outDir, relative), body);
    await writeFile(cached, bytes);
    previews[source] = relative;
    stats.images++; stats.sourceBytes += bytes.length; stats.previewBytes += body.length;
  }
  return { previews, stats };
}
