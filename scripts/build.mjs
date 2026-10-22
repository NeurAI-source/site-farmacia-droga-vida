import { cp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { validateCatalog } from '../catalog-validation.js';
import { securityHeaders } from './security-policy.mjs';
import { forbiddenPath } from './security-check.mjs';
import { adminPath } from './admin-path.mjs';
const root = new URL('../', import.meta.url), dist = new URL('dist/', root);
const panelPath = adminPath();
await rm(dist, { recursive: true, force: true }); await mkdir(dist, { recursive: true });
// Copy only public assets. Never copy the checkout or environment files.
for (const file of ['index.html','produto.html','produto.js','produto.css','product-detail.js','robots.txt','sitemap.xml','styles.css','premium.css','app.js','analytics.js','campaign-utils.js','campaign-images.js','campaign-viewer.js','campaign-slider.js','campaigns.js','campaigns.css','catalog-utils.js','trier-inventory.js','product-stock.js','cart-chat.js','cart-stock.css','catalog-validation.js','content-evidence.js','assets']) await cp(new URL(file,root),new URL(file,dist),{recursive:true});
const url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
if (!!url !== !!key) throw Error('Configure both public Supabase values.');
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw Error('Invalid Supabase URL.');
if (key && !key.startsWith('sb_publishable_')) {
  let payload; try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch {}
  if (payload?.role !== 'anon') throw Error('Only a public publishable/anon key may be bundled.');
}
await writeFile(new URL('public-config.js', dist), `export const config = ${JSON.stringify({url,key})};\n`);
// A new entry point must never import an older cached inventory/cart module.
// Keep each public page's entire application graph at one content-specific URL.
for (const [entry,page] of [['app.js','index.html'],['produto.js','produto.html']]) {
  const result=await build({entryPoints:[fileURLToPath(new URL(entry,root))],bundle:true,format:'esm',platform:'browser',target:['safari15.4'],minify:true,external:['./public-config.js'],entryNames:entry.replace('.js','-[hash]'),outdir:fileURLToPath(dist),metafile:true});
  const bundle=Object.keys(result.metafile.outputs).find(file=>file.endsWith('.js')).split(/[\\/]/).pop();
  const source=await readFile(new URL(page,dist),'utf8');
  const pattern=new RegExp(`src="${entry.replace('.','\\.')}\\?[^" ]*"`);
  await writeFile(new URL(page,dist),source.replace(pattern,`src="${bundle}"`));
}
// Publish the entire carousel module graph together under a content-specific URL.
// An open browser must never combine a new controller with an older slider.
const carousel = await build({entryPoints:[fileURLToPath(new URL('campaigns.js',root))],bundle:true,format:'esm',platform:'browser',minify:true,external:['./public-config.js'],entryNames:'campaigns-[hash]',outdir:fileURLToPath(dist),metafile:true});
const carouselFile = Object.keys(carousel.metafile.outputs).find(file => file.endsWith('.js')).split(/[\\/]/).pop();
const carouselStyle = createHash('sha256').update(await readFile(new URL('campaigns.css',root))).digest('hex').slice(0,12);
const html = (await readFile(new URL('index.html',dist),'utf8')).replace('campaigns.js?v=20261001',carouselFile).replace('campaigns.css?v=20261001',`campaigns.css?v=${carouselStyle}`);
await writeFile(new URL('index.html',dist),html);
const panelDirectory = new URL(`${panelPath}/`,dist);
await mkdir(panelDirectory,{recursive:true});
for (const file of ['admin.css','campaigns.css']) await cp(new URL(`admin/${file}`,root),new URL(file,panelDirectory));
const adminBundle=await build({entryPoints:[fileURLToPath(new URL('admin/admin.js',root))],bundle:true,format:'esm',platform:'browser',minify:true,external:['../vendor/supabase.js','../public-config.js'],entryNames:'admin-[hash]',outdir:fileURLToPath(panelDirectory),metafile:true});
const adminFile=Object.keys(adminBundle.metafile.outputs).find(file=>file.endsWith('.js')).split(/[\\/]/).pop();
const adminHtml=(await readFile(new URL('admin/index.html',root),'utf8')).replace(/src="admin\.js\?[^\"]*"/,`src="${adminFile}"`);
await writeFile(new URL('index.html',panelDirectory),adminHtml);
await build({ stdin: { contents: "export { createClient } from '@supabase/supabase-js'", resolveDir: fileURLToPath(root) }, bundle:true,format:'esm',platform:'browser',minify:true,outfile:fileURLToPath(new URL('vendor/supabase.js',dist)) });
const source = process.env.CATALOG_FILE || new URL('catalog.json', root);
const catalog = validateCatalog(JSON.parse(await readFile(source, 'utf8')));
await writeFile(new URL('catalog.json', dist), JSON.stringify(catalog));
await writeFile(new URL('.nojekyll', dist), '');
await writeFile(new URL('404.html', dist), '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada | Droga Vida Popular</title><body><main><h1>Página não encontrada</h1><p>Este endereço não está disponível.</p><a href="/">Voltar para a Droga Vida Popular</a></main></body></html>');
console.log(`Site pronto em dist/. Integração: ${url ? 'configurada' : 'aguardando Supabase'}.`);
const htmlFiles=[];
async function inspect(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    if (forbiddenPath(entry.name)) throw Error('Arquivo de ambiente proibido no artefato público.');
    const target=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
    if(entry.isDirectory()) await inspect(target);
    else if(entry.name.endsWith('.html')) htmlFiles.push(await readFile(target,'utf8'));
  }
}
await inspect(dist);
await writeFile(new URL('_headers',dist),securityHeaders(htmlFiles,url,panelPath));

// Version the shared stock/price stylesheet so existing visitors receive updates.
const stockStyleVersion=createHash('sha256').update(await readFile(new URL('cart-stock.css',root))).digest('hex').slice(0,12);
for(const filename of ['index.html','produto.html']){
  const target=new URL(filename,dist);
  await writeFile(target,(await readFile(target,'utf8')).replace(/cart-stock\.css\?[^"\s]+/g,`cart-stock.css?v=${stockStyleVersion}`));
}
