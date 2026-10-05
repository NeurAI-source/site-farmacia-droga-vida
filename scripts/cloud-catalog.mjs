import { readFile, writeFile, mkdir, cp, appendFile } from 'node:fs/promises';
import { validateCatalog } from '../catalog-validation.js';
const action = process.argv[2];
if (action === 'prepare') {
  await mkdir('supabase/functions/_shared', { recursive: true });
  await cp('catalog-validation.js', 'supabase/functions/_shared/catalog-validation.js');
  await cp('campaign-utils.js', 'supabase/functions/_shared/campaign-utils.js');
  process.exit(0);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLICATION_ID } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw Error('Supabase server configuration is missing.');
// Built-in fetch keeps failure reporting available even when npm ci fails.
const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
async function request(path, body, extraHeaders = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: {...headers,...extraHeaders}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Falha no serviço de publicação (HTTP ${response.status}).`);
  const raw = await response.text(); return raw ? JSON.parse(raw) : null;
}
const rpc = (name, body) => request(`rpc/${name}`, body);
if (action === 'seed') {
  const catalog = validateCatalog(JSON.parse(await readFile('catalog.json', 'utf8')));
  await request('catalog_draft?on_conflict=id', { id:1,catalog }, {Prefer:'resolution=ignore-duplicates'});
  console.log('Catálogo inicial preparado; rascunhos existentes preservados.');
} else if (action === 'fetch') {
  let catalog;
  if (PUBLICATION_ID) {
    catalog = await rpc('catalog_publication_start', { publication_id: PUBLICATION_ID, worker_run: process.env.GITHUB_RUN_ID });
    if (!catalog) {
      if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'skip=true\n');
      console.log('Publicação já assumida ou encerrada; execução duplicada ignorada.');
      process.exit(0);
    }
  } else {
    const rows = await request('publications?select=catalog&status=eq.published&order=draft_version.desc&limit=1');
    catalog = rows[0]?.catalog || JSON.parse(await readFile('catalog.json', 'utf8'));
  }
  await writeFile('published-catalog.json', JSON.stringify(validateCatalog(catalog)));
} else if (['published','failed'].includes(action) && PUBLICATION_ID) {
  await rpc('catalog_publication_finish', { publication_id: PUBLICATION_ID, worker_run: process.env.GITHUB_RUN_ID, result_status: action });
} else if (action === 'dispatch-next') {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-api`, {method:'POST',headers:{Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({action:'dispatch-next'}),signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('Não foi possível iniciar a próxima publicação; consulte o painel.');
} else if (!['published','failed'].includes(action)) throw Error('Unknown action');
