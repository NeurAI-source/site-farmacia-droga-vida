import { money } from '../catalog-utils.js';
import { analyzePrices, applyPrices, catalogCheckup } from './neurai-utils.js?v=20261002';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = { queued:'Aguardando publicação',pending:'Aguardando publicação',building:'Publicação em andamento',published:'Publicação concluída',failed:'Falha na publicação' };
const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k,v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k,v); } catch {} } };
export function mountNeurAI({ getCatalog, getVersion, reloadCatalog, action, onSaved, onEdit }) {
  const launcher = document.createElement('button');
  launcher.className = 'neur-launcher'; launcher.type = 'button'; launcher.hidden = true; launcher.textContent = '✦ Neur.AI'; launcher.setAttribute('aria-haspopup','dialog'); launcher.setAttribute('aria-label','Abrir assistente Neur.AI');
  const dialog = document.createElement('dialog'); dialog.className = 'neur-dialog'; dialog.setAttribute('aria-labelledby','neur-title');
  dialog.innerHTML = `<div class="editor-body">
    <div class="panel-heading"><div><p class="eyebrow">ASSISTENTE DO CATÁLOGO</p><h2 id="neur-title">Neur.AI</h2></div><button type="button" class="text-button" data-close>Fechar</button></div>
    <section><h3>Remarcação em lote</h3><p>Um produto por linha: <strong>código + novo preço</strong>. Até 100 produtos. Confira a prévia antes de confirmar.</p>
    <label for="neur-input">Códigos e preços</label><textarea id="neur-input" rows="6" maxlength="8000" spellcheck="false" placeholder="001234 19,99&#10;5678 8,50"></textarea>
    <button type="button" class="button red" data-analyze>Analisar lote</button>
    <label class="neur-auto"><input type="checkbox" data-auto> Publicar automaticamente após confirmação</label>
    <p class="muted" data-permission></p><p class="muted">A publicação envia a versão revisada do catálogo inteiro, incluindo outros rascunhos já salvos nessa versão.</p>
    <p data-message role="status" aria-live="polite"></p><div data-preview hidden></div>
    <button type="button" class="button red" data-confirm hidden>Confirmar remarcação</button>
    <button type="button" class="button red" data-recover hidden>Recuperar confirmação do lote</button>
    <p data-publication role="status" aria-live="polite"></p>
    </section>
    <section class="neur-checkup"><div class="panel-heading"><h3>Histórico de remarcações</h3><button type="button" class="text-button" data-history-refresh>Atualizar histórico</button></div><p data-history-message role="status"></p><div data-history></div><div class="panel-heading"><button type="button" class="text-button" data-previous>Mais recentes</button><button type="button" class="text-button" data-next>Mais antigas</button></div></section>
    <section class="neur-checkup"><div class="panel-heading"><h3>Check-up do cadastro</h3><button type="button" class="text-button" data-refresh>Atualizar check-up</button></div><div data-checkup></div></section>
    <p class="muted">Análise baseada no catálogo. Não há registro de buscas por produto para gerar rankings de interesse.</p>
  </div>`;
  document.body.append(launcher,dialog);
  const $ = s => dialog.querySelector(s), input = $('#neur-input'), confirm = $('[data-confirm]'), preview = $('[data-preview]'), message = $('[data-message]'), automatic = $('[data-auto]');
  let rows=[], previewVersion, busy=false, canPublish=false, key='', recoveryKey='', pending=null, restoresId=null, history=[], offset=0, tracked=null, polling=false;
  function lock(value) { busy=value; dialog.querySelectorAll('button,textarea,input').forEach(el=>el.disabled=value); automatic.disabled=value||!canPublish; $('[data-analyze]').disabled=value||!!pending; input.disabled=value||!!pending; }
  function reset() { rows=[]; restoresId=null; preview.hidden=true; preview.replaceChildren(); confirm.hidden=true; message.textContent=''; }
  function checkup() { const issues=catalogCheckup(getCatalog().products); $('[data-checkup]').innerHTML=issues.length?`<p>${issues.length} produtos para revisar.</p><ul class="neur-issues">${issues.map(p=>`<li><div><strong>${esc(p.name)}</strong><p>${p.issues.map(esc).join(' · ')}</p></div><button type="button" class="text-button" data-neur-edit="${p.id}">Editar</button></li>`).join('')}</ul>`:'<p>Nenhuma pendência encontrada nestas verificações.</p>'; }
  function table(items) { return `<div class="table-scroll"><table><thead><tr><th>Produto / código</th><th>Preço anterior</th><th>Novo preço</th><th>Status</th></tr></thead><tbody>${items.map(r=>`<tr><td><strong>${esc(r.name||r.raw)}</strong><small>${esc(r.code)} · ${esc(r.detail||'')}</small></td><td>${r.previousCents!=null?money(r.previousCents):'—'}</td><td>${r.priceCents?money(r.priceCents):'—'}</td><td>${esc(r.error||'Validado')}</td></tr>`).join('')}</tbody></table></div>`; }
  function showPreview() { const errors=rows.filter(r=>r.error).length; previewVersion=getVersion(); message.textContent=errors?`${errors} linhas precisam de correção. Nenhum preço será alterado enquanto houver erros.`:`${rows.length} produtos identificados. Confira os preços abaixo${restoresId?' para recuperar os valores anteriores':''}.`; preview.innerHTML=table(rows); preview.hidden=false; confirm.hidden=!!errors; confirm.textContent=restoresId?'Confirmar recuperação dos preços':'Confirmar remarcação'; }
  async function loadHistory() {
    try { const result=await action('price-history',{offset}); history=result.batches;
      $('[data-history]').innerHTML=history.map(b=>`<details class="neur-history"><summary><strong>${b.changes.length} produtos · ${esc(labels[b.publication?.status]||'Alterações salvas — rascunho')}</strong><small>${esc(new Date(b.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))} · ${esc(b.actor_label)} · versão ${b.after_version}</small></summary>${table(b.changes)}<p>${esc(b.publication?.error_message||'')}${b.restores_id?' Recuperação de preços anteriores.':''}</p><button type="button" class="text-button" data-restore="${esc(b.id)}">Revisar recuperação dos preços</button>${canPublish&&b.publication&&b.publication.status!=='published'?`<button type="button" class="text-button" data-retry="${esc(b.publication.id)}">Consultar / tentar novamente</button>`:''}</details>`).join('')||'<p>Nenhum lote registrado nesta página.</p>';
      $('[data-previous]').hidden=offset===0; $('[data-next]').hidden=history.length<20; $('[data-history-message]').textContent='';
    } catch(e) { $('[data-history-message]').textContent=e.message; }
  }
  async function poll() {
    if (polling||busy||!dialog.open||document.hidden) return; polling=true;
    try { const result=await action('publication-status',tracked?{id:tracked}:{}); if(result.publication) $('[data-publication]').textContent=labels[result.publication.status]+'.'; await loadHistory(); } catch { $('[data-history-message]').textContent='Sem conexão para consultar o andamento. Os registros salvos foram preservados.'; } finally { polling=false; }
  }
  async function submit() {
    if(busy||!pending) return; lock(true);
    try {
      const result=await action('price-batch',pending);
      storage.set(recoveryKey,null); pending=null; $('[data-recover]').hidden=true; input.value=''; reset(); tracked=result.batch.publication_id;
      message.textContent=`Alterações salvas: ${result.batch.changes.length} produtos. ${tracked?'':'Rascunho salvo; publique pelo painel quando estiver pronto.'}`;
      $('[data-publication]').textContent=result.notice||'';
      try { await reloadCatalog(); onSaved(); checkup(); } catch { message.textContent+=' Recarregue o catálogo para ver os valores salvos.'; }
      offset=0; await loadHistory();
    } catch(e) {
      message.textContent=e.message;
      if(e.definitive) { pending=null; storage.set(recoveryKey,null); reset(); message.textContent=e.message; }
      else { confirm.hidden=true; $('[data-recover]').hidden=false; message.textContent+=' Use Recuperar confirmação do lote para consultar/repetir com segurança a mesma solicitação.'; }
    } finally { lock(false); }
  }
  launcher.onclick=async()=>{ if(!getCatalog())return; if(!pending)reset(); checkup(); dialog.showModal(); await loadHistory(); await poll(); };
  $('[data-close]').onclick=()=>{if(!busy)dialog.close();}; dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  automatic.onchange=()=>storage.set(key,automatic.checked?'true':'false'); input.oninput=reset;
  $('[data-analyze]').onclick=async()=>{ if(busy||pending)return; reset(); lock(true); try { await reloadCatalog(); rows=analyzePrices(input.value,getCatalog().products); showPreview(); } catch(e){message.textContent=e.message;}finally{lock(false);} };
  confirm.onclick=()=>{ if(busy||!rows.length||rows.some(r=>r.error))return; try {if(previewVersion!==getVersion())throw Error('O catálogo mudou. Analise novamente.'); applyPrices(getCatalog(),rows); pending={batchId:crypto.randomUUID(),version:previewVersion,rows:rows.map(({productId,code,previousCents,priceCents})=>({productId,code,previousCents,priceCents})),autoPublish:canPublish&&automatic.checked,restoresId}; storage.set(recoveryKey,JSON.stringify(pending)); submit();}catch(e){reset();message.textContent=e.message;} };
  $('[data-recover]').onclick=submit; $('[data-refresh]').onclick=checkup; $('[data-history-refresh]').onclick=poll;
  $('[data-previous]').onclick=()=>{offset=Math.max(0,offset-20);loadHistory();}; $('[data-next]').onclick=()=>{offset+=20;loadHistory();};
  dialog.addEventListener('click',async event=>{
    if(busy||pending)return;
    const edit=event.target.closest('[data-neur-edit]'); if(edit){dialog.close();onEdit(Number(edit.dataset.neurEdit));return;}
    const restore=event.target.closest('[data-restore]'),retry=event.target.closest('[data-retry]');
    if(!restore&&!retry)return; lock(true);
    try {
      if(retry) {const result=await action('retry-publication',{id:retry.dataset.retry});tracked=retry.dataset.retry;$('[data-publication]').textContent=`${labels[result.publication?.status]||''}. ${result.notice||''}`;await loadHistory();}
      if(restore) {const batch=history.find(b=>b.id===restore.dataset.restore); await reloadCatalog(); reset(); rows=batch.changes.map(r=>({...r,previousCents:r.priceCents,priceCents:r.previousCents,error:''})); applyPrices(getCatalog(),rows); restoresId=batch.id; showPreview(); preview.scrollIntoView({block:'nearest'});}
    } catch(e){reset();message.textContent=e.message;}finally{lock(false);}
  });
  setInterval(poll,10000);
  return { enable(member) {canPublish=member.role==='admin';key=`neurai:auto:${member.userId}`;recoveryKey=`neurai:pending:${member.userId}`;automatic.checked=canPublish&&storage.get(key)==='true';automatic.disabled=!canPublish;$('[data-permission]').textContent=canPublish?'Preferência salva neste navegador para sua conta. Só publica após sua confirmação.':'Seu perfil pode salvar preços. A publicação é restrita aos administradores.';try{pending=JSON.parse(storage.get(recoveryKey));}catch{pending=null;}if(pending){$('[data-recover]').hidden=false;message.textContent='Há uma confirmação sem resposta. Recupere o lote antes de iniciar outro.';}lock(false);launcher.hidden=false;} };
}
