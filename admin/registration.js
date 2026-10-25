import { client,adminAction } from './backend.js';
import { invokeAdminRequest } from './backend-actions.js';
import { suggestRegistration,findDuplicates,reviewRegistration,sortRegistrationProducts,PENDING_IMAGE } from '../registration-utils.js';
import { ensureClassification,applyClassifications,classificationReview } from './category-intelligence.js';
import { money,normalize } from '../catalog-utils.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountRegistration({getCatalog,getVersion,reload,save,onEdit,onNew,setView,notify}) {
  const root=document.createElement('section');root.id='registration-view';root.className='view';root.hidden=true;
  root.innerHTML=`<section class="panel registration-intro"><p class="eyebrow">CADASTRO INTELIGENTE 2.0</p><h2>Importar da Trier</h2><p>Consulte a filial 2, selecione e revise. Nada é cadastrado ou publicado automaticamente.</p>
    <form data-search-form class="registration-search"><label>Buscar por<select name="mode"><option value="code">Código reduzido</option><option value="ean">EAN / leitor</option><option value="name">Nome</option><option value="browse">Listar produtos</option></select></label><label>Consulta<input name="query" maxlength="120" autocomplete="off" placeholder="Código, EAN ou nome"></label><label class="feature-check"><input name="activeOnly" type="checkbox" checked> Somente ativos na Trier</label><button class="button red" type="submit">Consultar Trier</button><button type="button" class="button white" data-scan>Usar câmera para EAN</button></form>
    <p role="status" data-import-status></p><p class="muted">Nome: busca local no backend em páginas limitadas, pois o endpoint oficial não oferece filtro de nome. Leitores USB/Bluetooth podem digitar no campo EAN.</p>
    <div class="registration-actions"><button class="button white" data-select-page>Selecionar página</button><button class="button white" data-select-all>Selecionar todos os resultados filtrados</button><label>Marca<select data-brand><option value="">Todas</option></select></label><label>Categoria sugerida<select data-category><option value="">Todas</option></select></label><button class="button white" data-clear>Limpar seleção</button><button class="button red" data-prepare>Revisar selecionados</button><span data-count>0 selecionados</span></div>
    <div class="table-scroll"><table><thead><tr><th>Selecionar</th><th>Produto</th><th>Origem / situação</th><th>Sugestão Neur.AI</th><th>Cadastro existente</th></tr></thead><tbody data-results></tbody></table></div><div class="registration-actions"><button class="button white" data-previous>Página anterior</button><button class="button white" data-next>Próxima página</button></div></section>`;
  document.querySelector('main footer').before(root);
  const reviewRoot=document.createElement('section');reviewRoot.id='registration-review-view';reviewRoot.className='view';reviewRoot.hidden=true;
  reviewRoot.innerHTML=`<section class="panel"><h2>Revisão Inteligente</h2><p>Confira pendências e aceite sugestões. Identificação, fotos, preço e disponibilidade continuam exigindo revisão individual.</p><div class="registration-actions"><button class="button white" data-review-refresh>Atualizar análise</button><button class="button white" data-history>Histórico de cadastros</button><button class="button red" data-apply-suggestions>Aplicar sugestões selecionadas</button><button class="button white" data-ignore-suggestions>Ignorar pendências selecionadas</button></div><p role="status" data-review-status></p><div data-review-list></div><div data-history-list></div></section>`;
  root.after(reviewRoot);
  const dialog=document.createElement('dialog');dialog.className='registration-dialog';dialog.setAttribute('aria-label','Revisar importação da Trier');document.body.append(dialog);
  const $=s=>root.querySelector(s), rs=s=>reviewRoot.querySelector(s), status=t=>$('[data-import-status]').textContent=t;
  const selected=new Map();let rows=[],offset=0,previous=[],nextOffset=0,hasMore=false,busy=false,prepared=[],member=null,reviewRows=[];
  const searchForm=$('[data-search-form]');
  const request=(action,body={})=>invokeAdminRequest(client,'trier-api',{body:{action,...body}});
  const showError=e=>e.requiresLogin?e.message:'Não foi possível concluir a consulta na Trier. Seu catálogo e a seleção foram preservados. Tente novamente.';
  function lock(value){busy=value;root.querySelectorAll('button,input,select').forEach(b=>b.disabled=value);dialog.querySelectorAll('button,input,select').forEach(b=>b.disabled=value);}
  function filtered(){return rows.filter(r=>(!$('[data-brand]').value||r.suggestion.brand===$('[data-brand]').value)&&(!$('[data-category]').value||r.suggestion.category===$('[data-category]').value));}
  function draw(){
    $('[data-count]').textContent=`${selected.size} selecionados`;
    $('[data-results]').innerHTML=filtered().map(r=>`<tr><td><input type="checkbox" aria-label="Selecionar ${esc(r.shortCode)}" data-select="${esc(r.shortCode)}" ${selected.has(r.shortCode)?'checked':''}></td><td><strong>${esc(r.name)}</strong><small>Código ${esc(r.shortCode)} · EAN ${esc(r.ean||'Não informado')}</small></td><td>Filial 2 · ${r.active?'Ativo':'Inativo'}<small>${r.priceCents?money(r.priceCents):'Preço para revisar'} · ${r.stockQuantity} no estoque consultado<br>${esc(new Date(r.fetchedAt).toLocaleString('pt-BR'))}</small></td><td>${esc(r.suggestion.brand||'Marca para revisar')}<small>${esc(r.suggestion.category||'Categoria para revisar')} / ${esc(r.suggestion.subcategory||'—')}</small></td><td>${r.duplicates.map(d=>`<button type="button" class="text-button" data-existing="${d.productId}">${esc(d.name)}${d.size?' · '+esc(d.size):''}</button><small>${esc(d.reasons.join(', '))}</small>`).join('')||'Novo'}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum resultado nesta página. Se houver próxima página, continue a busca.</td></tr>';
    $('[data-previous]').disabled=busy||!previous.length;$('[data-next]').disabled=busy||!hasMore;
  }
  function params(){return {mode:searchForm.elements.mode.value,query:searchForm.elements.query.value.trim(),activeOnly:searchForm.elements.activeOnly.checked};}
  async function search(newOffset=0){
    if(busy)return;lock(true);status('Consultando a Trier pelo backend…');
    try{const result=await request('registration-search',{...params(),offset:newOffset});offset=newOffset;nextOffset=result.nextOffset;hasMore=result.hasMore;
      rows=result.rows.map(r=>({...r,suggestion:suggestRegistration(r,getCatalog().categories,getCatalog().products.map(p=>p.brand)),duplicates:findDuplicates(r,getCatalog().products)}));
      for(const [sel,values] of [['[data-brand]',rows.map(r=>r.suggestion.brand)],['[data-category]',rows.map(r=>r.suggestion.category)]]){const control=$(sel),value=control.value;control.innerHTML='<option value="">Todas</option>'+[...new Set(values.filter(Boolean))].map(s=>`<option>${esc(s)}</option>`).join('');control.value=value;}
      status(`${rows.length} resultados nesta página. ${result.stale?'Cache antigo: não é confirmação atual. ':''}${result.note||''}`);
    }catch(e){status(showError(e));}finally{lock(false);draw();}
  }
  searchForm.onsubmit=e=>{e.preventDefault();previous=[];search(0);};
  $('[data-next]').onclick=()=>{previous.push(offset);search(nextOffset);};$('[data-previous]').onclick=()=>search(previous.pop()??0);
  $('[data-brand]').onchange=$('[data-category]').onchange=draw;
  function selectPage(){for(const r of filtered())selected.set(r.shortCode,r);draw();}
  $('[data-select-page]').onclick=selectPage;$('[data-clear]').onclick=()=>{selected.clear();draw();};
  $('[data-select-all]').onclick=async()=>{
    if(busy)return;lock(true);let cursor=0,count=0;const settings=params(),brand=$('[data-brand]').value,category=$('[data-category]').value;
    try{do{status(`Selecionando resultados filtrados… ${count} registros examinados (limite 2.000).`);const result=await request('registration-search',{...settings,offset:cursor});if(result.stale)throw Error();
      for(const r of result.rows){const suggestion=suggestRegistration(r,getCatalog().categories,getCatalog().products.map(p=>p.brand));if((!brand||brand===suggestion.brand)&&(!category||category===suggestion.category))selected.set(r.shortCode,r);}
      count+=result.nextOffset-cursor;if(!result.hasMore)break;if(result.nextOffset<=cursor)throw Error();cursor=result.nextOffset;
    }while(count<2000);status(`${selected.size} selecionados. Limite de seleção: 2.000 registros examinados por operação. Revise antes de importar.`);}catch(e){status(showError(e));}finally{lock(false);draw();}
  };
  root.addEventListener('change',e=>{const code=e.target.dataset.select;if(!code)return;if(e.target.checked)selected.set(code,rows.find(r=>r.shortCode===code));else selected.delete(code);draw();});
  root.addEventListener('click',e=>{const b=e.target.closest('[data-existing]');if(b){setView('products');onEdit(Number(b.dataset.existing));}});
  async function prepare(){
    if(busy||!selected.size)return;lock(true);prepared=[];
    try{await reload();const codes=[...selected.keys()];for(let i=0;i<codes.length;i+=30){status(`Validando preços, estoque e promoções: ${i} de ${codes.length}…`);const result=await request('registration-preview',{codes:codes.slice(i,i+30)});prepared.push(result);}
      renderPreview();dialog.showModal();status('Confira os itens. Novos produtos serão rascunhos inativos e pendentes de foto.');
    }catch(e){status(showError(e));}finally{lock(false);draw();}
  }
  $('[data-prepare]').onclick=prepare;
  function renderPreview(){
    dialog.innerHTML=`<div class="editor-body"><div class="panel-heading"><h2>Revisar importação da Trier</h2><button class="text-button" data-close>Cancelar</button></div><p>As sugestões de conteúdo são baseadas em regras e nos atributos retornados pela Trier. Confira cada campo. O fabricante/laboratório não é presumido como marca.</p><p>Sem foto confiável, o produto fica inativo com indicação de foto pendente. Publicação e ativação continuam separadas.</p>
    ${prepared.flatMap((batch,bi)=>batch.rows.map((r,ri)=>{
      const suggestion=suggestRegistration(r,getCatalog().categories,getCatalog().products.map(p=>p.brand)),dups=findDuplicates({...r,trier:{id:r.externalId}},getCatalog().products),exact=dups.find(d=>d.exact);
      return `<fieldset data-choice="${bi}:${ri}"><legend>${esc(r.name)} · Código ${esc(r.shortCode)}</legend><p>Filial 2 · ${r.active?'Ativo':'Inativo'} · Estoque ${r.stockQuantity} · ${r.regularPriceCents?'De '+money(r.regularPriceCents)+' / ':''}Por ${r.priceCents?money(r.priceCents):'Indisponível'}<br>Promoção: ${r.discountStatus==='checked'?'verificada, sem reaplicar percentual':'não confirmada; usando preço normal'} · ${esc(new Date(r.fetchedAt).toLocaleString('pt-BR'))}</p>
      ${dups.length?`<div class="registration-comparison"><strong>Comparação com cadastros existentes</strong>${dups.map(d=>{const p=getCatalog().products.find(p=>p.id===d.productId);return `<p>${esc(d.name)} · ${esc(d.size||'')} · ${esc(d.reasons.join(', '))}<br>Atual: ${money(p.priceCents)} · código ${esc(p.shortCode||p.variants.find(v=>v.id===d.variantId)?.shortCode||'')}<button class="text-button" type="button" data-edit-duplicate="${p.id}">Editar existente</button></p>`;}).join('')}</div>`:''}
      <div class="form-grid"><label>Ação<select name="mode"><option value="skip" ${exact?'selected':''}>Ignorar / cancelar este item</option><option value="new" ${exact?'disabled':'selected'}>Criar rascunho separado</option><option value="update" ${exact?'':'disabled'}>Atualizar vínculo existente</option><option value="variant" ${exact?'disabled':''}>Vincular como nova variante</option></select></label><label>Produto existente (atualização ou variante)<select name="productId">${getCatalog().products.map(p=>`<option value="${p.id}" ${p.id===exact?.productId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
      <input type="hidden" name="variantId" value="${exact?.variantId||''}"><label>Nome sugerido<input name="name" maxlength="120" value="${esc(suggestion.name)}"></label><label>Marca sugerida<input name="brand" maxlength="80" value="${esc(suggestion.brand)}"></label><label>Apresentação<input name="detail" maxlength="160" value="${esc(suggestion.detail)}"></label><label>Categoria<input name="category" list="registration-categories" maxlength="160" value="${esc(suggestion.category)}"></label><label>Subcategoria<input name="subcategory" maxlength="160" value="${esc(suggestion.subcategory)}"></label><label>Tamanho (fralda ou nova variante)<input name="size" maxlength="15" value="${esc(suggestion.size)}"></label><label>Quantidade por pacote (fralda ou variante)<input name="packageQuantity" type="number" min="1"></label></div>
      <label class="feature-check"><input name="confirmSeparate" type="checkbox"> Conferi possíveis semelhanças e são produtos diferentes</label><label class="feature-check"><input name="updateCommercial" type="checkbox"> Confirmo atualizar preço e quantidade do vínculo existente com esta consulta da Trier (nome, foto, categoria e marca serão preservados)</label><p class="muted">${esc(suggestion.confidence==='review'?'Baixa confiança: escolha a categoria manualmente.':suggestion.reason)}</p></fieldset>`;
    })).join('')}<datalist id="registration-categories">${getCatalog().categories.map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist><p role="status" data-commit-status></p><button class="button red" data-commit>Confirmar importação no rascunho</button></div>`;
    dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close();};dialog.querySelector('[data-commit]').onclick=commit;
    dialog.querySelectorAll('[data-edit-duplicate]').forEach(b=>b.onclick=()=>{dialog.close();setView('products');onEdit(Number(b.dataset.editDuplicate));});
  }
  const recoveryKey=()=>`dv-registration-recovery:${member?.userId||''}`;
  async function sendBatch(payload){try{localStorage.setItem(recoveryKey(),JSON.stringify(payload));}catch{}const result=await adminAction('registration-commit',payload);try{localStorage.removeItem(recoveryKey());}catch{}return result;}
  async function commit(){
    if(busy)return;lock(true);const message=dialog.querySelector('[data-commit-status]');let completed=0;
    try{
      for(let bi=0;bi<prepared.length;bi++){
        if(prepared[bi].completed)continue;
        const choices=prepared[bi].rows.map((r,ri)=>{const node=dialog.querySelector(`[data-choice="${bi}:${ri}"]`),v=n=>node.querySelector(`[name="${n}"]`);return {code:r.shortCode,mode:v('mode').value,productId:Number(v('productId').value),variantId:Number(v('variantId').value)||null,...Object.fromEntries(['name','brand','detail','category','subcategory','size','packageQuantity'].map(n=>[n,v(n).value])),confirmSeparate:v('confirmSeparate').checked,updateCommercial:v('updateCommercial').checked};});
        if(choices.every(c=>c.mode==='skip'))continue;
        message.textContent=`Salvando lote ${bi+1} de ${prepared.length}…`;
        if(prepared[bi].pendingPayload&&JSON.stringify(prepared[bi].pendingPayload.choices)!==JSON.stringify(choices))throw Error('Recupere o lote pendente antes de alterar a seleção.');
        const payload=prepared[bi].pendingPayload??={batchId:crypto.randomUUID(),version:getVersion(),previewId:prepared[bi].previewId,choices};
        const result=await sendBatch(payload);prepared[bi].completed=true;completed+=result.report.filter(r=>r.status!=='ignored').length;
        for(const c of choices)selected.delete(c.code);await reload();
      }
      dialog.close();status(`${completed} itens salvos no rascunho. Complete fotos, confira e publique pelo fluxo normal.`);prepared=[];
    }catch(e){message.textContent=`${completed} itens confirmados nesta operação. ${e.message} Os lotes já concluídos foram preservados. Use “Recuperar importação” antes de tentar outra importação.`;}
    finally{lock(false);draw();}
  }
  const recover=document.createElement('button');recover.type='button';recover.className='button white';recover.textContent='Recuperar importação';root.querySelector('.registration-actions').append(recover);
  recover.onclick=async()=>{if(busy)return;let payload;try{payload=JSON.parse(localStorage.getItem(recoveryKey()));}catch{}if(!payload){status('Nenhuma importação pendente neste navegador.');return;}lock(true);try{const check=await adminAction('registration-result',{batchId:payload.batchId});const result=check.completed?check:await sendBatch(payload);localStorage.removeItem(recoveryKey());await reload();status(`Importação recuperada: ${result.report.length} itens. Revise o rascunho.`);dialog.close();}catch(e){status(e.message);}finally{lock(false);draw();}};
  async function scan(){
    if(!('BarcodeDetector' in window)){status('Leitura automática pela câmera indisponível neste navegador. Use leitor externo ou digite o EAN.');return;}
    let stream;const camera=document.createElement('dialog');camera.className='registration-dialog';camera.innerHTML='<h2>Escanear EAN</h2><video autoplay playsinline muted style="width:100%"></video><p role="status">Aponte para o código de barras.</p><button class="button white">Fechar câmera</button>';document.body.append(camera);
    const close=()=>{stream?.getTracks().forEach(t=>t.stop());camera.close();camera.remove();};camera.querySelector('button').onclick=close;camera.addEventListener('cancel',e=>{e.preventDefault();close();});camera.showModal();
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});if(!camera.open){stream.getTracks().forEach(t=>t.stop());return;}const video=camera.querySelector('video');video.srcObject=stream;await video.play();const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a']});while(camera.open){const values=await detector.detect(video);const code=values.find(x=>/^\d{8,14}$/.test(x.rawValue))?.rawValue;if(code){searchForm.elements.mode.value='ean';searchForm.elements.query.value=code;close();search(0);break;}await new Promise(r=>setTimeout(r,400));}}
    catch{close();status('Não foi possível ler a câmera. Confira a permissão ou digite o EAN.');}
  }
  $('[data-scan]').onclick=scan;
  async function analyze(){
    try{await reload();let inventory=[],error=false;try{inventory=(await adminAction('registration-inventory')).inventory||[];}catch{error=true;}reviewRows=reviewRegistration(getCatalog(),inventory);
      rs('[data-review-list]').innerHTML=reviewRows.map(r=>`<article class="registration-issue"><input type="checkbox" data-review-id="${r.id}" aria-label="Revisar ${esc(r.name)}"><div><strong>${esc(r.name)}</strong><p>${r.issues.map(i=>esc(i.label)).join(' · ')}</p><small>Sugestão: ${esc(r.suggestion.category||'Revisão manual')} / ${esc(r.suggestion.subcategory||'—')} · ${esc(r.suggestion.brand||'Marca não identificada')}</small></div><button class="text-button" data-review-edit="${r.id}">Corrigir individualmente</button></article>`).join('')||'<p>Nenhuma pendência encontrada nestas verificações.</p>';
      const names=new Map(),duplicates=[];for(const c of getCatalog().categories){const key=normalize(c.name).trim();if(names.has(key))duplicates.push(`${names.get(key)} / ${c.name}`);else names.set(key,c.name);const subs=new Set();for(const s of c.subcategories){const k=normalize(s.name).trim();if(subs.has(k))duplicates.push(`${c.name} → ${s.name}`);subs.add(k);}}
      rs('[data-review-status]').textContent=`${reviewRows.length} produtos para revisar. ${duplicates.length?'Categorias/subcategorias possivelmente duplicadas: '+duplicates.join('; ')+'. Revise no gerenciador de Categorias. ':''}${error?'Não foi possível consultar o cache privado de sincronização; use o status da integração.':''}`;
    }catch(e){rs('[data-review-status]').textContent=e.message;}
  }
  rs('[data-review-refresh]').onclick=analyze;
  reviewRoot.onclick=e=>{const b=e.target.closest('[data-review-edit]');if(b){setView('products');onEdit(Number(b.dataset.reviewEdit));}};
  rs('[data-apply-suggestions]').onclick=async()=>{
    const ids=[...reviewRoot.querySelectorAll('[data-review-id]:checked')].map(n=>Number(n.dataset.reviewId));
    if(!ids.length||!confirm(`Aplicar sugestões de marca/apresentação vazias e classificações não protegidas para ${ids.length} produtos? Preço, estoque e identificação serão preservados.`))return;
    try{const next=structuredClone(getCatalog());const rows=classificationReview(next).filter(r=>ids.includes(r.id)&&!r.review&&!r.locked);let result=rows.length?applyClassifications(next,rows):next;
      for(const p of result.products.filter(p=>ids.includes(p.id))){const s=suggestRegistration(p,result.categories,result.products.map(p=>p.brand));if(!p.brand&&s.brand)p.brand=s.brand;if(!p.detail&&s.detail)p.detail=s.detail;}
      await save(result);await analyze();rs('[data-review-status]').textContent='Sugestões conferidas e salvas no rascunho.';
    }catch(e){rs('[data-review-status]').textContent=e.message;}
  };
  rs('[data-ignore-suggestions]').onclick=async()=>{const ids=[...reviewRoot.querySelectorAll('[data-review-id]:checked')].map(n=>Number(n.dataset.reviewId));if(!ids.length)return;
    try{const next=structuredClone(getCatalog());for(const p of next.products.filter(p=>ids.includes(p.id))){const issue=reviewRows.find(r=>r.id===p.id);p.reviewIgnores=issue.issues.map(i=>({key:i.key,fingerprint:JSON.stringify([p.name,p.brand,p.category,p.subcategory,p.imageUrl,p.shortCode,p.ean,p.variants])}));}await save(next);await analyze();}catch(e){rs('[data-review-status]').textContent=e.message;}};
  rs('[data-history]').onclick=async()=>{const {data,error}=await client.from('registration_history').select('id,product_id,actor_id,catalog_version,before_product,after_product,created_at').order('id',{ascending:false}).limit(50);rs('[data-history-list]').innerHTML=error?'<p>Histórico indisponível.</p>':(data||[]).map(h=>`<details><summary>${esc(h.after_product?.name||h.before_product?.name)} · versão ${h.catalog_version} · ${esc(new Date(h.created_at).toLocaleString('pt-BR'))}</summary><p>Responsável: ${esc(h.actor_id||'Sistema')}</p><pre>${esc(JSON.stringify({antes:h.before_product,depois:h.after_product},null,2))}</pre></details>`).join('')||'<p>Nenhuma alteração registrada após a instalação.</p>';};
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  return {enable(m){member=m;},show(){draw();},showReview:analyze,openSearch(){setView('registration');searchForm.elements.query.focus();}};
}
