import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { validateCatalog } from '../catalog-validation.js';
const root = new URL('../', import.meta.url), dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true }); await mkdir(dist, { recursive: true });
// Copy only public assets. Never copy the checkout or environment files.
for (const file of ['index.html','robots.txt','sitemap.xml','styles.css','app.js','analytics.js','campaign-utils.js','campaign-viewer.js','campaigns.js','campaigns.css','catalog-utils.js','catalog-validation.js','assets','admin']) await cp(new URL(file,root),new URL(file,dist),{recursive:true});
const url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
if (!!url !== !!key) throw Error('Configure both public Supabase values.');
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw Error('Invalid Supabase URL.');
if (key && !key.startsWith('sb_publishable_')) {
  let payload; try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch {}
  if (payload?.role !== 'anon') throw Error('Only a public publishable/anon key may be bundled.');
}
await writeFile(new URL('public-config.js', dist), `export const config = ${JSON.stringify({url,key})};\n`);
await build({ stdin: { contents: "export { createClient } from '@supabase/supabase-js'", resolveDir: fileURLToPath(root) }, bundle:true,format:'esm',platform:'browser',minify:true,outfile:fileURLToPath(new URL('vendor/supabase.js',dist)) });
const source = process.env.CATALOG_FILE || new URL('catalog.json', root);
const catalog = validateCatalog(JSON.parse(await readFile(source, 'utf8')));
await writeFile(new URL('catalog.json', dist), JSON.stringify(catalog));
await writeFile(new URL('.nojekyll', dist), '');
await writeFile(new URL('404.html', dist), '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada | Droga Vida Popular</title><body><main><h1>Página não encontrada</h1><p>Este endereço não está disponível.</p><a href="/">Voltar para a Droga Vida Popular</a></main></body></html>');
console.log(`Site pronto em dist/. Integração: ${url ? 'configurada' : 'aguardando Supabase'}.`);
