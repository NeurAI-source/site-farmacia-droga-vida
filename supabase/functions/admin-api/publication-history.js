// Read-only publishing visibility. Authentication, membership and quotas are checked by index.ts.
const fields = 'id,status,run_id,draft_version,error_message,dispatch_state,created_at,started_at:dispatched_at,finished_at';
const active = ['queued','pending','building'];
const check = result => { if (result.error) throw Error('Não foi possível consultar o histórico.'); return result.data; };
const numeric = value => /^\d{1,20}$/.test(String(value || ''));
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || '');
const friendlyStep = name => ({'Set up job':'Iniciando publicação','Run actions/checkout@v4':'Carregando a versão do site','Run actions/setup-node@v4':'Preparando o ambiente','Run node scripts/security-check.mjs':'Verificando segurança','Run node scripts/cloud-catalog.mjs fetch':'Carregando o catálogo desta publicação','Run npm ci':'Preparando os arquivos necessários','Run npm test':'Conferindo o funcionamento do site','Run npm run build':'Preparando a nova versão','Publicar no Cloudflare Pages':'Enviando a nova versão ao site','Implantar no GitHub Pages':'Enviando a nova versão ao site','Registrar falha':'Registrando o resultado','Iniciar próxima publicação da fila':'Organizando a fila de publicações'})[name] || (name.startsWith('Post ') || name==='Complete job' ? 'Finalizando a execução' : name);
export function runProgress(run, jobs = []) {
  const steps = jobs.flatMap(job => job.steps || []);
  const deployed = steps.some(step => ['Implantar no GitHub Pages','Publicar no Cloudflare Pages'].includes(step.name) && step.conclusion === 'success');
  if (run.status === 'completed') return { status: deployed ? 'published' : run.conclusion === 'success' ? 'skipped' : 'failed', percent: deployed ? 100 : null, stage: deployed ? 'Site publicado' : run.conclusion === 'success' ? 'Execução encerrada sem nova implantação' : 'Publicação interrompida', steps: steps.map(s => ({ name:friendlyStep(s.name), status:s.status, conclusion:s.conclusion })) };
  const relevant = steps.filter(s => !s.name.startsWith('Post ') && s.name !== 'Complete job');
  const finished = relevant.filter(s => s.status === 'completed').length;
  return { status: run.status === 'queued' || run.status === 'waiting' ? 'pending' : 'building', percent: relevant.length ? Math.min(95, Math.floor(finished / relevant.length * 95)) : 0, stage: friendlyStep(relevant.find(s => s.status === 'in_progress')?.name || 'Aguardando execução'), steps: steps.map(s => ({name:friendlyStep(s.name),status:s.status,conclusion:s.conclusion})) };
}
function github(env, fetcher) {
  const repository = env('GITHUB_REPOSITORY');
  return async path => {
    if (!env('GITHUB_DEPLOY_TOKEN') || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw Error('Andamento indisponível no momento.');
    const response = await fetcher(`https://api.github.com/repos/${repository}/${path}`, { headers: { Authorization:`Bearer ${env('GITHUB_DEPLOY_TOKEN')}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' }, signal:AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Andamento indisponível no momento.');
    return response.json();
  };
}
const stageFallback = job => ({ ...job, kind:'catalog', percent:job.status === 'published' ? 100 : null, stage:({queued:'Aguardando a publicação anterior',pending:'Aguardando execução',building:'Publicando o site',published:'Site publicado',failed:'Publicação interrompida'})[job.status], progressAvailable:false });
const cleanRun = (run, progress) => ({ id:`github:${run.id}`, kind:'code', run_id:String(run.id), created_at:run.created_at, started_at:run.run_started_at, finished_at:run.status === 'completed' ? run.updated_at : null, title:String(run.head_commit?.message || 'Atualização do site').split('\n')[0].slice(0,240), commit:run.head_sha, ...progress, progressAvailable:true });
export function catalogChanges(before, after) {
  if (!before) return { baselineAvailable:false, changes:[] };
  const changes=[];
  const labels = {name:'Nome',brand:'Marca',detail:'Descrição',priceCents:'Preço',oldPriceCents:'Preço anterior',stockQuantity:'Estoque',active:'Disponibilidade',featured:'Destaque',badge:'Selo',imageUrl:'Imagem',category:'Categoria',subcategory:'Subcategoria',shortCode:'Código reduzido',ean:'EAN',availableStore1:'Unidade Solo Sagrado',availableStore2:'Unidade Nature 1',variants:'Tamanhos e preços por tamanho',sortOrder:'Ordem',tone:'Cor',content:'Conteúdo do produto'};
  const old = new Map((before.products || []).map(p=>[p.id,p]));
  const next = new Map((after.products || []).map(p=>[p.id,p]));
  for (const [id,p] of next) {
    const prior=old.get(id);
    if (!prior) changes.push({entity:p.name,field:'Produto',before:null,after:'Adicionado'});
    else for (const key of new Set([...Object.keys(prior),...Object.keys(p)])) {
      if (['updatedAt','createdAt','id'].includes(key)) continue;
      if (JSON.stringify(prior[key] ?? null)!==JSON.stringify(p[key] ?? null)) changes.push({entity:p.name,field:labels[key] || key,before:prior[key] ?? null,after:p[key] ?? null,money:key.endsWith('Cents')});
    }
  }
  for (const [id,p] of old) if (!next.has(id)) changes.push({entity:p.name,field:'Produto',before:'Existente',after:'Removido'});
  for (const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    if (['products','updatedAt','createdAt'].includes(key)) continue;
    if (JSON.stringify(before[key] ?? null)!==JSON.stringify(after[key] ?? null)) changes.push({entity:'Site',field:({categories:'Categorias',stores:'Lojas',expandedProductPage:'Página individual de produto'})[key] || key,before:before[key] ?? null,after:after[key] ?? null});
  }
  return {baselineAvailable:true,changes};
}
export async function publicationHistory({body,db,env,fetcher=fetch}) {
  const get=github(env,fetcher);
  if (body.action === 'publication-history') {
    const offset=Number(body.offset ?? 0);
    if (!Number.isInteger(offset) || offset<0 || offset>10000 || offset%20) throw Error('Página inválida.');
    const rows=check(await db.from('publications').select(fields).order('created_at',{ascending:false}).range(offset,offset+19));
    const running=offset===0 ? check(await db.from('publications').select(fields).in('status',active).order('created_at',{ascending:false}).limit(5)) : [];
    const all=[...new Map([...running,...rows].map(row=>[row.id,row])).values()];
    let warning='', runs=[],totalRuns=0;
    try {const result=await get(`actions/workflows/publish.yml/runs?per_page=20&page=${offset/20+1}`);runs=result.workflow_runs || [];totalRuns=result.total_count || 0;} catch {warning='Não foi possível atualizar o andamento. Os registros do catálogo continuam disponíveis.';}
    const items=all.map(stageFallback);
    // Join by recorded run id. Never infer success from an accepted dispatch.
    const known=new Set(all.map(row=>String(row.run_id)));
    let inspected=0;
    const sorted=[...runs].sort((a,b)=>Number(a.status==='completed')-Number(b.status==='completed'));
    const queries=[];
    for (const run of sorted) {
      if (!numeric(run.id)) continue;
      const existing=items.find(item=>String(item.run_id)===String(run.id));
      const match=String(run.display_title || '').match(/Publicar catálogo ([a-f0-9-]{36})/i);
      if (!existing && match && uuid(match[1])) continue; // catalog rows have their own pagination
      // Completed catalogue records are authoritative; avoid fetching jobs for every old row.
      if (existing && ['published','failed'].includes(existing.status)) continue;
      const fallback={status:run.status==='completed'?(run.conclusion==='success'?'completed':'failed'):run.status==='queued'?'pending':'building',percent:null,stage:'Abra os detalhes para consultar as etapas desta execução'};
      if(inspected++>=5){if(!existing)items.push(cleanRun(run,fallback));continue;}
      queries.push((async()=>{
        let progress;
        try {const result=await get(`actions/runs/${run.id}/jobs?per_page=100`);progress=runProgress(run,result.jobs || []);}
        catch {warning='Algumas etapas não puderam ser atualizadas. Mostrando o último estado confirmado.';if(existing)return;progress=fallback;}
        if(existing)Object.assign(existing,progress,{progressAvailable:true});
        else if(!known.has(String(run.id)))items.push(cleanRun(run,progress));
      })());
    }
    await Promise.all(queries);
    items.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    return {items,hasMore:rows.length===20 || totalRuns>offset+20,warning,checkedAt:new Date().toISOString()};
  }
  if(body.action === 'publication-detail') {
    if(typeof body.id !== 'string')throw Error('Publicação inválida.');
    if(body.id.startsWith('github:')) {
      const id=body.id.slice(7);if(!numeric(id))throw Error('Publicação inválida.');
      const run=await get(`actions/runs/${id}`);
      // Restrict details to this site's publishing workflow, not arbitrary Actions runs.
      if(run.path!=='.github/workflows/publish.yml')throw Error('Publicação inválida.');
      const jobs=await get(`actions/runs/${id}/jobs?per_page=100`);
      const previous=await get(`actions/workflows/publish.yml/runs?status=success&per_page=30`);
      const baseline=(previous.workflow_runs || []).find(r=>r.id!==run.id && r.created_at<run.created_at && /^[a-f0-9]{40}$/.test(r.head_sha || ''));
      let files=[],filesAvailable=false,filesTruncated=false;
      if(baseline && /^[a-f0-9]{40}$/.test(run.head_sha || '')) {
        try { const comparison=await get(`compare/${baseline.head_sha}...${run.head_sha}`);files=(comparison.files || []).map(f=>({name:f.filename,status:f.status,additions:f.additions,deletions:f.deletions}));filesAvailable=true;filesTruncated=files.length>=300; }catch{/* Keep run details available if comparison fails. */}
      }
      return {publication:cleanRun(run,runProgress(run,jobs.jobs || [])),files,filesAvailable,filesTruncated};
    }
    if(!uuid(body.id))throw Error('Publicação inválida.');
    const row=check(await db.from('publications').select(`${fields},catalog`).eq('id',body.id).single());
    const prior=check(await db.from('publications').select('catalog,draft_version').eq('status','published').lt('draft_version',row.draft_version).order('draft_version',{ascending:false}).limit(1));
    const {catalog,...metadata}=row;
    return {publication:stageFallback(metadata),catalog,...catalogChanges(prior[0]?.catalog,catalog),baselineVersion:prior[0]?.draft_version ?? null};
  }
  throw Error('Consulta inválida.');
}
