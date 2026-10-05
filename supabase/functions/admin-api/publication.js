// GitHub credentials stay in this server-only module. A DB claim makes retries safe.
export const checked = result => { if (result.error) throw Error(result.error.message); return result.data; };
export async function dispatchNext(db, env, fetcher = fetch, retry = false) {
  if (!env('GITHUB_DEPLOY_TOKEN') || !env('GITHUB_REPOSITORY')) return { notice: 'Publicação não configurada. Os preços estão salvos; tente publicar após configurar o serviço.' };
  const job = checked(await db.rpc('catalog_dispatch_claim', { retry_pending: retry }));
  if (!job) return { notice: 'Aguardando publicação. Outra publicação pode estar em andamento.' };
  try {
    const response = await fetcher(`https://api.github.com/repos/${env('GITHUB_REPOSITORY')}/actions/workflows/publish.yml/dispatches`, {
      method: 'POST', headers: { Authorization: `Bearer ${env('GITHUB_DEPLOY_TOKEN')}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ ref: 'main', inputs: { publication_id: job.id } }), signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      // A 5xx is ambiguous: GitHub may already have accepted the dispatch.
      const uncertain = response.status >= 500;
      checked(await db.from('publications').update({ dispatch_state: uncertain ? 'uncertain' : 'rejected', ...(uncertain ? {} : { status: 'failed', finished_at: new Date().toISOString() }), error_message: `GitHub retornou HTTP ${response.status}.` }).eq('id', job.id).eq('status', 'pending'));
      return { notice: uncertain ? 'Envio sem confirmação. Use Consultar / tentar novamente; o mesmo lote será preservado.' : 'Falha ao solicitar publicação no GitHub. Os preços continuam salvos.' };
    }
    checked(await db.from('publications').update({ dispatch_state: 'accepted', error_message: null }).eq('id', job.id).eq('status', 'pending'));
    return { notice: 'Aguardando publicação no GitHub Actions.' };
  } catch {
    // Do not mark as failed and create another snapshot after an uncertain dispatch.
    await db.from('publications').update({ dispatch_state: 'uncertain', error_message: 'Não foi possível confirmar o envio ao GitHub.' }).eq('id', job.id).eq('status', 'pending');
    return { notice: 'Conexão interrompida ao solicitar publicação. Os preços estão salvos; consulte o andamento antes de tentar novamente.' };
  }
}
export async function reconcilePublication(db, env, job, fetcher = fetch) {
  if (!job?.run_id || job.status !== 'building' || !env('GITHUB_DEPLOY_TOKEN')) return;
  const headers = { Authorization: `Bearer ${env('GITHUB_DEPLOY_TOKEN')}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const base = `https://api.github.com/repos/${env('GITHUB_REPOSITORY')}/actions/runs/${job.run_id}`;
  const response = await fetcher(base, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return;
  const run = await response.json();
  if (run.status !== 'completed') return;
  const jobsResponse = await fetcher(`${base}/jobs?per_page=100`, { headers, signal: AbortSignal.timeout(10000) });
  if (!jobsResponse.ok) return;
  const jobs = await jobsResponse.json();
  const deployed = jobs.jobs?.some(j => j.steps?.some(s => ['Implantar no GitHub Pages', 'Publicar no Cloudflare Pages'].includes(s.name) && s.conclusion === 'success'));
  // A failed status callback does not mean the website deployment failed.
  checked(await db.rpc('catalog_publication_finish', { publication_id: job.id, worker_run: String(job.run_id), result_status: deployed ? 'published' : 'failed' }));
}
export async function neuraiAction({ body, db, user, env, fetcher = fetch }) {
  if (body.action === 'price-batch') {
    const batch = checked(await db.rpc('neurai_save_batch', { actor_id: user.id, batch_id: body.batchId, expected_version: body.version, changes: body.rows, auto_publish: body.autoPublish === true, restores_id: body.restoresId || null, actor_email: user.email || null }));
    let delivery = {};
    if (batch.publication_id) {
      try { delivery = await dispatchNext(db, env, fetcher); } catch { delivery = { notice: 'Preços salvos. Não foi possível consultar a publicação; tente novamente pelo histórico.' }; }
    }
    return { batch, ...delivery };
  }
  if (body.action === 'price-history') {
    const rows = checked(await db.from('price_batches').select('id,actor_id,actor_label,created_at,before_version,after_version,changes,auto_publish,publication_id,restores_id').order('created_at', { ascending: false }).range(Math.max(0, Number(body.offset) || 0), Math.max(0, Number(body.offset) || 0) + 19));
    const ids = rows.map(row => row.publication_id).filter(Boolean);
    const publications = ids.length ? checked(await db.from('publications').select('id,status,draft_version,error_message,run_id,dispatch_state').in('id', ids)) : [];
    return { batches: rows.map(row => ({ ...row, publication: publications.find(p => p.id === row.publication_id) || null })) };
  }
  if (body.action === 'publication-status' || body.action === 'retry-publication') {
    const member = checked(await db.from('team_members').select('role').eq('user_id', user.id).eq('active', true).single());
    if (body.action === 'retry-publication' && member.role !== 'admin') throw Error('Somente administradores podem publicar.');
    let job = body.id ? checked(await db.from('publications').select('id,status,run_id,draft_version,error_message,dispatch_state').eq('id', body.id).single()) : null;
    try { await reconcilePublication(db, env, job, fetcher); } catch { /* Keep the last verified state on network failure. */ }
    if (body.action === 'retry-publication') checked(await db.rpc('catalog_retry_publication', { actor_id: user.id, publication_id: body.id }));
    // Only the existing publishing role may initiate/retry jobs from a browser request.
    let delivery = {};
    if (member.role === 'admin') delivery = await dispatchNext(db, env, fetcher, body.action === 'retry-publication');
    if (body.id) job = checked(await db.from('publications').select('id,status,run_id,draft_version,error_message,dispatch_state').eq('id', body.id).single());
    return { publication: job, ...delivery };
  }
  return null;
}
