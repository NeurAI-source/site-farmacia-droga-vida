import { CONTENT_FIELDS, draftFromCatalog, mergeDraftContent, parseEvidence, needsProfessionalReview, validEvidenceUrl } from '../content-generator.js';
import { client } from './backend.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountContentAI({ getCatalog, getVersion, reloadCatalog, save, onEdit, notify }) {
 const root=document.createElement('dialog');
 root.id='content-ai-dialog';root.className='content-ai-dialog';root.setAttribute('aria-labelledby','content-ai-title');
 root.innerHTML=`<div class="content-ai-wrap">
 <div class="content-ai-heading"><div><p class="eyebrow">CENTRAL NEUR.AI</p><h2 id="content-ai-title">Descrições inteligentes de produtos</h2></div><button type="button" data-close aria-label="Fechar">×</button></div>
 <p class="content-ai-intro">As sugestões não alteram o site automaticamente. Revise as informações antes de salvar o produto e publicar o catálogo. Para medicamentos, consulte o farmacêutico responsável.</p>
 <div class="content-ai-status" role="status" aria-live="polite"></div>
 <section class="content-ai-single">
  <label>Produto<select data-product></select></label>
  <label>Texto da embalagem, ficha ou fabricante (opcional)<textarea data-label rows="4" maxlength="10000" placeholder="Cole aqui as informações oficiais, incluindo os títulos: Para que serve, Benefícios, Modo de uso, Advertências..."></textarea></label>
  <label>Link da fonte oficial (opcional)<input data-source type="url" maxlength="1000" placeholder="https://www.fabricante.com.br/produto"></label>
  <div class="content-ai-actions">
   <button type="button" class="button white" data-free>✦ Gerar base gratuita</button>
   <button type="button" class="button red" data-ai>✦ Pesquisar com IA</button>
  </div>
  <p class="content-ai-hint">A base gratuita organiza somente dados existentes e trechos informados da embalagem. A pesquisa por IA requer configuração de API externa e pode gerar custos. Nenhuma opção publica textos sozinha.</p>
  <div data-review hidden>
   <h3>Confira e ajuste os textos sugeridos</h3>
   <p data-review-note></p><div class="content-ai-fields" data-fields></div>
   <div data-sources></div>
   <button type="button" class="button red" data-apply>Aplicar no editor para revisar</button>
  </div>
 </section>
 <details class="content-ai-bulk"><summary>Preencher descrições básicas de vários produtos</summary>
 <p>Gera até 10 bases de descrição por vez, sem IA paga. Não inventa indicações, benefícios, dosagens ou advertências. Medicamentos ficam de fora.</p>
 <button type="button" class="button white" data-bulk-preview>Preparar até 10 produtos pendentes</button>
 <div data-bulk-list></div>
 <button type="button" class="button red" data-bulk-save hidden>Salvar os selecionados no rascunho</button>
 </details>
 </div>`;
 document.body.append(root);
 const $=s=>root.querySelector(s);
 let selectedId=null, proposal=null, evidence=[], previewVersion=null, batch=[], batchVersion=null, busy=false;
 const status=(msg,error=false)=>{const box=$('.content-ai-status');box.textContent=msg;box.classList.toggle('error',error)};
 const setBusy=v=>{busy=v;root.querySelectorAll('button,select,input,textarea').forEach(el=>el.disabled=v)};
 const products=()=>getCatalog()?.products||[];
 function productChoice() {
  const list=products().filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  $('[data-product]').innerHTML=list.map(p=>`<option value="${p.id}">${esc(p.name)}${p.content?.description?'':' · Pendente'}</option>`).join('');
  if(selectedId&&list.some(p=>p.id===selectedId))$('[data-product]').value=String(selectedId);
  else selectedId=Number($('[data-product]').value)||null;
 }
 function resetProposal(){proposal=null;evidence=[];previewVersion=null;$('[data-review]').hidden=true;$('[data-fields]').replaceChildren();$('[data-sources]').replaceChildren();}
 function fillReview(draft, sources, note){
  proposal=draft; evidence=[...new Set(sources.filter(validEvidenceUrl))].slice(0,5);previewVersion=getVersion();
  $('[data-fields]').innerHTML=CONTENT_FIELDS.map(([key,title])=>`<label>${esc(title)}<textarea data-key="${key}" rows="3" maxlength="2400">${esc(draft[key]||'')}</textarea></label>`).join('');
  $('[data-sources]').innerHTML=evidence.length?'<h4>Fontes para conferir</h4><ul>'+evidence.map(url=>`<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a></li>`).join('')+'</ul>':'<p class="content-ai-hint">Nenhuma fonte externa verificada. Confira todas as informações antes de aprovar.</p>';
  $('[data-review-note]').textContent=note;
  $('[data-review]').hidden=false;
 }
 function currentProduct(){
  const p=products().find(x=>x.id===Number($('[data-product]').value));
  if(!p)throw Error('Selecione um produto válido.');
  if(needsProfessionalReview(p))throw Error('Para medicamentos, a descrição deve ser revisada pelo farmacêutico responsável. Use o editor manual e a bula oficial.');
  return p;
 }
 async function open(id){
  if(!getCatalog())return;
  selectedId=id||selectedId;productChoice();resetProposal();status('Rascunhos não são publicados automaticamente.');
  $('[data-label]').value='';$('[data-source]').value='';root.showModal();
  try{const {data,error}=await client.functions.invoke('product-content-ai',{body:{action:'status'}});
   if(!error)$('[data-ai]').textContent=data?.configured?'✦ Pesquisar com IA (custo por consulta)':'✦ Pesquisar com IA (requer configuração)';
  }catch{/* offline mode remains usable */}
 }
 async function freeDraft(){
  try{const p=currentProduct();resetProposal();
   const text=$('[data-label]').value.trim(),url=$('[data-source]').value.trim();
   if(url&&!validEvidenceUrl(url))throw Error('Informe um link HTTPS válido para a fonte.');
   const draft=draftFromCatalog(p,text); const sources=url?[url]:[];
   fillReview(draft,sources,text?'Sugestões extraídas do texto informado. Confira se ele pertence à apresentação correta.':'Gerado apenas a partir de dados cadastrais. Campos clínicos permanecem vazios.');
   status('Prévia criada. Revise e clique em Aplicar no editor.');
  }catch(e){status(e.message,true)}
 }
 async function aiDraft(){
  if(busy)return;
  try{
   const p=currentProduct();
   if(!confirm('A pesquisa com IA externa pode gerar custo na API. Deseja fazer UMA consulta para este produto, sem publicar automaticamente?'))return;
   resetProposal();setBusy(true);status('Pesquisando fontes e preparando sugestões para revisão...');
   const {data,error}=await client.functions.invoke('product-content-ai',{body:{action:'generate',productId:p.id,labelText:$('[data-label]').value.trim(),sourceUrl:$('[data-source]').value.trim()}});
   if(error){let message;try{message=(await error.context?.json())?.error}catch{}throw Error(message||'Não foi possível gerar a descrição. Confira a configuração do serviço.');}
   if(data?.error)throw Error(data.error);
   if(!data?.fields)throw Error('A IA não retornou informações válidas.');
   const sources=Array.isArray(data.sources)?data.sources.map(v=>typeof v==='string'?v:v.url):[];
   fillReview(data.fields,sources,data?.notice||'Sugestão automática. Verifique nomes, apresentação, fontes e alegações antes de aprovar.');
   status('Rascunho gerado. Nenhum dado foi salvo ou publicado.');
  }catch(e){status(e.message,true)}finally{setBusy(false)}
 }
 function apply(){
  try{
   const p=currentProduct();
   if(!proposal||previewVersion!==getVersion())throw Error('O catálogo mudou. Gere novamente a sugestão.');
   const proposed=Object.fromEntries([...root.querySelectorAll('[data-fields] textarea[data-key]')].map(el=>[el.dataset.key,el.value.trim().slice(0,2400)]));
   const existing=p.content||{};const overlaps=CONTENT_FIELDS.some(([k])=>existing[k]?.trim()&&proposed[k]?.trim()&&existing[k].trim()!==proposed[k].trim());
   if(overlaps&&!confirm('Esse produto já tem textos aprovados. Deseja substituir no editor (sem salvar automaticamente)?'))return;
   root.close();onEdit(p.id,{content:mergeDraftContent(existing,proposed,true),sources:evidence});
   notify('Sugestão aplicada ao formulário. Confira e clique em Salvar produto; depois publique se aprovar.');
  }catch(e){status(e.message,true)}
 }
 function prepareBulk(){
  try{
   resetProposal();
   batch=products().filter(p=>p.active&&!needsProfessionalReview(p)&&!p.content?.description?.trim()).sort((a,b)=>a.id-b.id).slice(0,10).map(p=>({id:p.id,name:p.name,draft:draftFromCatalog(p)}));
   batchVersion=getVersion();
   $('[data-bulk-list]').innerHTML=batch.map((b,i)=>`<div class="content-ai-bulk-item"><label><input type="checkbox" data-bulk-index="${i}" checked> <strong>${esc(b.name)}</strong></label><textarea data-bulk-text="${i}" rows="2" maxlength="2400">${esc(b.draft.description)}</textarea><small>${esc(b.draft.specifications.replace(/\n/g,' · '))}</small></div>`).join('');
   $('[data-bulk-save]').hidden=!batch.length;
   status(batch.length?`Revise as ${batch.length} descrições, selecione quais deseja salvar. Nenhum texto foi publicado.`:'Todos os produtos elegíveis já têm descrição básica.');
  }catch(e){status(e.message,true)}
 }
 async function saveBulk(){
  if(busy)return;
  try{
   if(batchVersion!==getVersion())throw Error('O catálogo mudou. Prepare o lote novamente.');
   const selected=[...root.querySelectorAll('[data-bulk-index]:checked')].map(el=>Number(el.dataset.bulkIndex));
   if(!selected.length)throw Error('Selecione pelo menos um produto.');
   if(!confirm(`Salvar ${selected.length} descrições revisadas no RASCUNHO, sem publicar? O histórico permitirá restaurar.`))return;
   setBusy(true);
   const next=structuredClone(getCatalog());let changed=0;
   for(const i of selected){
    const item=batch[i],p=next.products.find(x=>x.id===item.id);
    if(!p||p.content?.description?.trim()||needsProfessionalReview(p))continue;
    const description=$(`[data-bulk-text="${i}"]`)?.value.trim().slice(0,2400);
    if(!description)continue;
    p.content=mergeDraftContent(p.content,{description,specifications:item.draft.specifications});
    p.updatedAt=new Date().toISOString();changed++;
   }
   if(!changed)throw Error('Não há itens novos para salvar.');
   await save(next);batch=[];batchVersion=null;
   $('[data-bulk-list]').replaceChildren();$('[data-bulk-save]').hidden=true;
   productChoice();status(`${changed} descrições salvas no rascunho. Use Publicar no site quando estiver tudo revisado.`);
   notify(`${changed} descrições salvas no rascunho.`);
  }catch(e){status(e.message,true)}finally{setBusy(false)}
 }
 $('[data-close]').onclick=()=>{if(!busy)root.close()};
 root.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 $('[data-product]').onchange=()=>{selectedId=Number($('[data-product]').value);resetProposal()};
 $('[data-free]').onclick=freeDraft;$('[data-ai]').onclick=aiDraft;$('[data-apply]').onclick=apply;
 $('[data-bulk-preview]').onclick=prepareBulk;$('[data-bulk-save]').onclick=saveBulk;
 return {open};
}
