import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateCatalog } from '../catalog-validation.js';
const root = new URL('../', import.meta.url);
const original = JSON.parse(await readFile(new URL('catalog.json', root), 'utf8'));
test('accepts real catalog and rejects unsafe publication payloads', () => {
  assert.equal(validateCatalog(original), original);
  for (const change of [p=>p.priceCents=-1,p=>p.imageUrl='javascript:alert(1)',p=>p.stockQuantity='0\"><script>',p=>p.id='1 onclick=alert(1)',p=>p.active='true']) {
    const copy=structuredClone(original);change(copy.products[0]);assert.throws(()=>validateCatalog(copy));
  }
  const duplicate=structuredClone(original);duplicate.products.push(duplicate.products[0]);assert.throws(()=>validateCatalog(duplicate));
});
test('build rejects a server key passed as browser configuration', () => {
  const result = spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_secret_test_not_real'},encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Only a public/);
});
test('built site only contains public files and unconfigured admin stays locked', async () => {
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'server-only-canary'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const files=await readdir(new URL('dist/',root),{recursive:true});
  assert.ok(!files.some(f=>/(^|[\\/])(?:\.env|\.venv|node_modules|supabase)(?:[\\/]|$)/.test(f)));
  const config=await readFile(new URL('dist/public-config.js',root),'utf8');
  assert.ok(!config.includes('server-only-canary'));
  const html=await readFile(new URL('dist/admin/index.html',root),'utf8');
  assert.match(html,/<body class="locked">/);
  const main=await readFile(new URL('dist/index.html',root),'utf8');
  assert.doesNotMatch(main,/href=["'][^"']*admin\//);
});

test('reduced codes preserve leading zeros, allow old catalogs, and reject duplicates', () => {
  const copy = structuredClone(original);
  copy.products[0].shortCode = '001234';
  copy.products[1].shortCode = '1234';
  assert.equal(validateCatalog(copy).products[0].shortCode, '001234');
  copy.products[1].shortCode = '001234';
  assert.throws(() => validateCatalog(copy), /repetido/);
  copy.products[0].shortCode = 'Ab12'; copy.products[1].shortCode = 'aB12';
  assert.throws(() => validateCatalog(copy), /repetido/);
  copy.products[1].shortCode = '';
  const withVariant=structuredClone(copy);withVariant.products[0].shortCode='';withVariant.products[0].variants=[{id:900,size:'P',packageQuantity:20,stockQuantity:0,shortCode:'00077',priceCents:599}];
  assert.equal(validateCatalog(withVariant).products[0].variants[0].shortCode,'00077');
  withVariant.products[1].shortCode='00077';assert.throws(()=>validateCatalog(withVariant),/repetido/);
  for (const bad of [1234, ' 1234', '<script>', 'x'.repeat(41)]) {
    copy.products[0].shortCode = bad;
    assert.throws(() => validateCatalog(copy), /Código reduzido inválido/);
  }
});
