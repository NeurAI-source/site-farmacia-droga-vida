import { client } from './backend.js?v=20260929';
import { campaignStatus, validateCampaign, saoPauloInput, saoPauloISO, inspectImage, MAX_PAGES, MAX_IMAGE_BYTES } from '../campaign-utils.js';
import { createCampaignViewer } from '../campaign-viewer.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={active:'Ativa',scheduled:'Programada',expired:'Vencida',draft:'Rascunho',inactive:'Inativa',archived:'Arquivada'};
const date=iso=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(iso));
const normalized=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function mountCampaignManager(member) {
  const root=document.querySelector('#campaigns-view');
  const admin=member.role==='admin';let all=[],kind='post',editing=null,cover=null,pages=[],busy=false,loaded=false,clockOffset=0;
  const viewer=createCampaignViewer();
  root.innerHTML=`<div class="campaign-admin-intro"><div><strong>Suas campanhas, no momento certo.</strong><p>Prepare as artes e programe a exibição. Os horários seguem São Paulo.</p></div><button class="button red" id="campaign-new">+ Nova campanha</button></div>
    <div class="stats campaign-stats" id="campaign-stats"></div>
    <section class="panel campaign-management"><div class="campaign-tabs" role="tablist" aria-label="Tipo de campanha"><button type="button" role="tab" aria-selected="true" data-kind="post">Posts promocionais</button><button type="button" role="tab" aria-selected="false" data-kind="flyer">Encartes</button></div>
    <div class="campaign-filters"><label>Pesquisar<input id="campaign-search" type="search" placeholder="Buscar pelo nome da campanha"></label><label>Status<select id="campaign-status-filter"><option value="">Todos, exceto arquivados</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>Validade<select id="campaign-period-filter"><option value="">Todos os períodos</option><option value="current">Dentro do período</option><option value="future">Início futuro</option><option value="ended">Período encerrado</option></select></label><button class="button white" id="campaign-reload">↻ Atualizar</button></div>
    <p id="campaign-feedback" role="status" aria-live="polite"></p><div id="campaign-list" role="tabpanel" aria-label="Campanhas"></div></section>
    <p class="campaign-help">${admin?'Publicar aqui atualiza somente o carrossel. O catálogo continua com seu fluxo de publicação atual.':'Você pode preparar rascunhos. Um administrador aprova e publica as campanhas.'} Campanhas vencidas ficam no histórico.</p>`;
  const dialog=document.createElement('dialog');dialog.id='campaign-editor';dialog.className='campaign-editor';dialog.setAttribute('aria-labelledby','campaign-editor-title');
  dialog.innerHTML=`<form id="campaign-form"><div class="dialog-heading"><div><p class="eyebrow">CARROSSEL E ENCARTES</p><h2 id="campaign-editor-title">Nova campanha</h2></div><button type="button" data-close aria-label="Fechar cadastro">×</button></div>
    <div class="campaign-editor-body"><div class="campaign-fields"><label>Título<input name="title" maxlength="120" required placeholder="Ex.: Ofertas para cuidar da família"></label>
    <div class="campaign-form-grid"><label>Tipo<select name="kind"><option value="post">Post promocional</option><option value="flyer">Encarte</option></select></label><label>Ordem no carrossel<input name="sort_order" type="number" min="0" max="9999" step="1" required value="0"></label></div>
    <label>Link de destino (opcional)<input name="link_url" type="url" placeholder="https://..."></label>
    <div class="campaign-form-grid"><label>Início · São Paulo<input name="starts_at" type="datetime-local" required></label><label>Término · São Paulo<input name="ends_at" type="datetime-local" required></label></div><small>A campanha permanece válida até o final do minuto de término.</small>
    <label class="campaign-check"><input name="active" type="checkbox" checked> Ativa para exibição após a publicação</label>
    <div class="campaign-upload"><label>Imagem de capa<input id="campaign-cover-upload" type="file" accept="image/jpeg,image/png,image/webp"></label><p>JPG, PNG ou WebP · até 5 MB por imagem · sem cortes</p></div>
    <div id="campaign-pages-field"><div class="campaign-pages-heading"><strong>Páginas do encarte</strong><button type="button" class="text-button" id="campaign-use-cover">Usar capa como página</button></div><label>Adicionar páginas (até 30)<input id="campaign-pages-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><ol id="campaign-pages"></ol><small>Use as setas para reorganizar as páginas. A capa pode ser diferente das páginas internas.</small></div></div>
    <aside class="campaign-form-preview"><p class="eyebrow">PRÉVIA DA CAPA</p><div id="campaign-cover-preview">Envie uma imagem para visualizar.</div><strong id="campaign-live-title"></strong><p>As imagens aparecem completas, preservando preços e textos.</p><button type="button" class="button white" id="campaign-preview-form">Prévia no site ↗</button></aside></div>
    <p class="campaign-form-note">Salvar como rascunho retira esta campanha do site até uma nova aprovação.</p><p id="campaign-form-feedback" role="alert"></p>
    <div class="campaign-form-actions"><button type="button" class="button white" data-close>Cancelar</button><button type="submit" class="button white" value="draft">Salvar rascunho</button><button type="submit" class="button red" value="published" ${admin?'':'hidden'}>Publicar campanha →</button></div></form>`;
  document.body.append(dialog);
  const preview=document.createElement('dialog');preview.className='campaign-preview-dialog';preview.setAttribute('aria-label','Prévia da campanha no site');
  preview.innerHTML='<div class="dialog-heading"><h2>Prévia no site</h2><button type="button" aria-label="Fechar prévia">×</button></div><div class="campaign-section"><div class="campaign-heading"><h2>Confira nossas ofertas e novidades</h2></div><div class="campaign-shell"><div class="campaign-slide"></div><div class="campaign-caption"><div><strong class="campaign-name"></strong><span class="campaign-hint"></span></div></div></div></div><p class="campaign-help">Esta é uma prévia. Nada será publicado ao visualizar.</p>';
  document.body.append(preview);preview.querySelector('button').onclick=()=>preview.close();
  const $=s=>root.querySelector(s),f=dialog.querySelector('form'),field=n=>f.elements.namedItem(n);
  function message(text){$('#campaign-feedback').textContent=text;}
  async function api(action,payload={}) {
    const {data,error}=await client.functions.invoke('campaign-api',{body:{action,...payload}});
    if(error){let text;try{text=(await error.context.json()).error;}catch{}throw Error(text||'Não foi possível acessar as campanhas. Confira a conexão e a instalação do módulo.');}
    if(data.error)throw Error(data.error);return data;
  }
  async function load(){
    $('#campaign-reload').disabled=true;message('Carregando campanhas…');
    try{const rows=[];let page=0,result;do{result=await api('list',{page:page++});rows.push(...result.campaigns);clockOffset=Date.parse(result.server_now)-Date.now();}while(result.has_more);all=rows;loaded=true;render();message(`${all.filter(c=>c.kind===kind).length} campanhas deste tipo cadastradas.`);}catch(e){message(e.message);}finally{$('#campaign-reload').disabled=false;}
  }
  function render(){
    const now=Date.now()+clockOffset;
    $('#campaign-stats').innerHTML=[['Campanhas ativas',all.filter(c=>campaignStatus(c,now)==='active').length,'No site agora'],['Programadas',all.filter(c=>campaignStatus(c,now)==='scheduled').length,'Publicação automática'],['Vencidas',all.filter(c=>campaignStatus(c,now)==='expired').length,'Mantidas no histórico'],['Total cadastrado',all.length,'Posts e encartes']].map(([label,n,note])=>`<article class="stat"><span>${label}</span><strong>${n}</strong><small>${note}</small></article>`).join('');
    const query=normalized($('#campaign-search').value),status=$('#campaign-status-filter').value,period=$('#campaign-period-filter').value;
    const rows=all.filter(c=>c.kind===kind&&normalized(c.title).includes(query)&&(status?campaignStatus(c,now)===status:c.publication_state!=='archived')&&(!period||period==='current'&&Date.parse(c.starts_at)<=now&&now<Date.parse(c.ends_at)||period==='future'&&Date.parse(c.starts_at)>now||period==='ended'&&Date.parse(c.ends_at)<=now));
    $('#campaign-list').innerHTML=rows.length?rows.map(c=>{const state=campaignStatus(c,now);return `<article class="campaign-row"><img src="${esc(c.cover_url)}" alt="Capa de ${esc(c.title)}" loading="lazy"><div class="campaign-row-info"><div><strong>${esc(c.title)}</strong><span class="campaign-badge ${state}">${labels[state]}</span></div><p>${date(c.starts_at)} até ${date(Date.parse(c.ends_at)-1)}</p><small>Ordem ${c.sort_order} · ${c.kind==='post'?'Post promocional':'Encarte'}</small></div><div class="campaign-row-actions">${[['edit','Editar'],['preview','Prévia'],['duplicate','Duplicar'],...(c.active&&c.publication_state!=='archived'?[['deactivate','Desativar']]:[]),...(c.publication_state!=='archived'?[['archive','Arquivar']]:admin?[['delete','Excluir']]:[])].map(([a,l])=>`<button type="button" data-action="${a}" data-id="${c.id}" class="text-button">${l}</button>`).join('')}</div></article>`;}).join(''):'<div class="campaign-empty"><span>▧</span><h3>Nenhuma campanha por aqui</h3><p>Cadastre uma campanha ou ajuste os filtros para consultar o histórico.</p></div>';
  }
  function current(state='draft'){
    return validateCampaign({id:editing?.id||f.dataset.newId,version:editing?.version||0,title:field('title').value,kind:field('kind').value,cover_id:cover?.id,pages:field('kind').value==='flyer'?pages.map(p=>p.id):[],link_url:field('link_url').value,starts_at:saoPauloISO(field('starts_at').value),ends_at:saoPauloISO(field('ends_at').value,true),sort_order:Number(field('sort_order').value),active:field('active').checked,publication_state:state});
  }
  function drawForm(){
    dialog.querySelector('#campaign-pages-field').hidden=field('kind').value!=='flyer';
    dialog.querySelector('#campaign-cover-preview').innerHTML=cover?`<img src="${esc(cover.url)}" alt="Prévia da capa">`:'Envie uma imagem para visualizar.';
    dialog.querySelector('#campaign-live-title').textContent=field('title').value||'Título da campanha';
    dialog.querySelector('#campaign-pages').innerHTML=pages.map((p,i)=>`<li><img src="${esc(p.url)}" alt="Página ${i+1}"><span>Página ${i+1}</span><button type="button" data-up="${i}" aria-label="Mover página ${i+1} para cima" ${i?'':'disabled'}>↑</button><button type="button" data-down="${i}" aria-label="Mover página ${i+1} para baixo" ${i===pages.length-1?'disabled':''}>↓</button><button type="button" data-remove="${i}" aria-label="Remover página ${i+1}">×</button></li>`).join('');
  }
  function edit(c=null){
    editing=c;cover=c?{id:c.cover_id,url:c.cover_url}:null;pages=c?structuredClone(c.pages):[];f.reset();f.dataset.newId=crypto.randomUUID();
    for(const n of ['title','link_url','sort_order'])field(n).value=c?.[n]??(n==='sort_order'?0:'');
    field('kind').value=c?.kind||kind;field('active').checked=c?.active??true;
    field('starts_at').value=saoPauloInput(c?.starts_at||Date.now()+clockOffset);
    field('ends_at').value=saoPauloInput(c?Date.parse(c.ends_at)-1:Date.now()+clockOffset+7*86400000);
    dialog.querySelector('#campaign-editor-title').textContent=c?'Editar campanha':'Nova campanha';dialog.querySelector('#campaign-form-feedback').textContent='';drawForm();dialog.showModal();
  }
  function showPreview(c){
    preview.querySelector('.campaign-name').textContent=c.title;preview.querySelector('.campaign-hint').textContent=c.kind==='flyer'?`${c.pages.length} páginas · Toque para abrir e ampliar`:c.link_url?'Toque para abrir o link':'Toque para ampliar';
    const node=document.createElement(c.kind==='post'&&c.link_url?'a':'button');node.className='campaign-art';
    if(node.tagName==='A'){node.href=c.link_url;node.target='_blank';node.rel='noopener noreferrer';}else{node.type='button';node.onclick=()=>viewer.open({...c,pages:c.pages.map(p=>typeof p==='string'?p:p.url)});}
    const img=document.createElement('img');img.src=c.cover_url;img.alt=c.title;node.append(img);preview.querySelector('.campaign-slide').replaceChildren(node);preview.showModal();
  }
  async function upload(file){
    if(file.size>MAX_IMAGE_BYTES)throw Error('Use imagens de até 5 MB.');
    inspectImage(new Uint8Array(await file.arrayBuffer()),file.type);
    const image=await createImageBitmap(file);image.close();
    const {data,error}=await client.functions.invoke('campaign-api?action=upload',{body:file,headers:{'Content-Type':file.type}});
    if(error){let text;try{text=(await error.context.json()).error;}catch{}throw Error(text||'Não foi possível enviar a imagem.');}if(data.error)throw Error(data.error);return data;
  }
  function lock(value){busy=value;f.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);if(!value)drawForm();}
  async function uploadFiles(input,isCover){
    const files=[...input.files];if(!files.length)return;
    const feedback=dialog.querySelector('#campaign-form-feedback');
    if(!isCover&&pages.length+files.length>MAX_PAGES){feedback.textContent='O encarte pode ter até 30 páginas.';input.value='';return;}
    lock(true);try{for(let i=0;i<files.length;i++){feedback.textContent=`Enviando imagem ${i+1} de ${files.length}…`;const asset=await upload(files[i]);if(isCover)cover=asset;else pages.push(asset);}feedback.textContent='Imagens enviadas. Revise a prévia antes de salvar.';}catch(e){feedback.textContent=e.message;}finally{input.value='';lock(false);}
  }
  root.addEventListener('click',async e=>{
    const tab=e.target.closest('[data-kind]');if(tab){kind=tab.dataset.kind;root.querySelectorAll('[data-kind]').forEach(t=>t.setAttribute('aria-selected',String(t===tab)));render();}
    const b=e.target.closest('[data-action]');if(!b||busy)return;const c=all.find(c=>c.id===b.dataset.id);b.disabled=true;
    try{if(b.dataset.action==='edit'||b.dataset.action==='preview'){const {campaign}=await api('get',{id:c.id});if(b.dataset.action==='edit')edit(campaign);else showPreview(campaign);}else{const action=b.dataset.action;if(['delete','archive'].includes(action)&&!confirm(action==='delete'?`Excluir definitivamente a campanha “${c.title}”?`:`Arquivar “${c.title}” e retirar do site?`))return;await api(action,{campaign:{id:c.id,version:c.version}});await load();message(action==='duplicate'?'Cópia criada como rascunho inativo. Revise o período antes de publicar.':'Campanha atualizada.');}}catch(error){message(error.message);}finally{b.disabled=false;}
  });
  $('#campaign-new').onclick=()=>edit();$('#campaign-reload').onclick=load;
  for(const id of ['campaign-search','campaign-status-filter','campaign-period-filter'])$('#'+id).oninput=render;
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  field('kind').onchange=drawForm;field('title').oninput=()=>dialog.querySelector('#campaign-live-title').textContent=field('title').value;
  dialog.querySelector('#campaign-cover-upload').onchange=e=>uploadFiles(e.target,true);dialog.querySelector('#campaign-pages-upload').onchange=e=>uploadFiles(e.target,false);
  dialog.querySelector('#campaign-use-cover').onclick=()=>{if(!cover||pages.length>=MAX_PAGES||pages.some(p=>p.id===cover.id))return;pages.push({...cover});drawForm();};
  dialog.querySelector('#campaign-pages').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.remove!==undefined)pages.splice(Number(b.dataset.remove),1);else{const i=Number(b.dataset.up??b.dataset.down),j=i+(b.dataset.up!==undefined?-1:1);[pages[i],pages[j]]=[pages[j],pages[i]];}drawForm();};
  dialog.querySelector('#campaign-preview-form').onclick=()=>{try{const c=current();showPreview({...c,cover_url:cover.url,pages:c.kind==='flyer'?pages:[]});}catch(e){dialog.querySelector('#campaign-form-feedback').textContent=e.message;}};
  f.onsubmit=async e=>{e.preventDefault();if(busy)return;const feedback=dialog.querySelector('#campaign-form-feedback');try{const campaign=current(e.submitter?.value||'draft');if(campaign.publication_state==='published'&&Date.parse(campaign.ends_at)<=Date.now()+clockOffset)throw Error('Atualize o período antes de publicar uma campanha vencida.');lock(true);feedback.textContent='Salvando campanha…';await api('save',{campaign});dialog.close();kind=campaign.kind;root.querySelectorAll('[data-kind]').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.kind===kind)));await load();message(campaign.publication_state==='published'?'Campanha aprovada. A exibição seguirá o período e o status configurados.':'Rascunho salvo. Somente a equipe autorizada pode visualizá-lo.');}catch(error){feedback.textContent=error.message;}finally{lock(false);}};
  setInterval(()=>{if(loaded&&!root.hidden&&!dialog.open&&!preview.open)render();},30000);
  return {show(){if(!loaded)load();else render();}};
}
