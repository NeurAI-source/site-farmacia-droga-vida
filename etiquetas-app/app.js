import {config} from './config.js';
import {brl,escapeHtml,priceToCents,validateLabel,labelFromTrier,parseLabelCsv,printDocument} from './labels-core.js';

const $ = selector => document.querySelector(selector);
const enc = escapeHtml;
let session = null, demo = false, batch = [], results = [];
const setStatus = (id, value) => $(id).textContent = value;
const ready = () => !!(config.supabaseUrl && config.supabasePublishableKey);
const origin = () => config.supabaseUrl.replace(/\/+$/,'');
function toggleWorkspace(){
  $('#gate').hidden = true;
  $('#workspace').hidden = false;
  $('#session-state').textContent = demo ? 'Demonstração' : 'Equipe autorizada';
  $('#demo-alert').hidden = !demo;
  renderBatch();
}
function showTab(tab){
  $('#create-panel').hidden = tab !== 'create';
  $('#monitor-panel').hidden = tab !== 'monitor';
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active',button.dataset.tab===tab);
  });
}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.tab)));
$('#demo-entry').onclick=()=>{demo=true;toggleWorkspace();};
$('#signout').onclick=()=>{session=null;demo=false;batch=[];results=[];$('#workspace').hidden=true;$('#gate').hidden=false;setStatus('#signin-status',ready()?'Entre novamente para usar a Trier.':'Integração ainda não configurada. Use o modo demonstração.');};
if(!ready()){
  $('#signin-form').querySelector('button').disabled=true;
  setStatus('#signin-status','Esta versão não tem credenciais configuradas. Você pode experimentar localmente com dados fictícios.');
}
async function service(url,options){
  const response=await fetch(url,{...options,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Falha de comunicação ('+response.status+').');
  return data;
}
async function signIn(email,password){
  if(!ready())throw Error('Configuração pública do Supabase ainda não instalada.');
  const data=await service(origin()+'/auth/v1/token?grant_type=password',{
    method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({email,password})
  });
  if(!data?.access_token || !data?.user?.id)throw Error('Sessão inválida.');
  const membership=await service(origin()+'/rest/v1/team_members?select=role,active&user_id=eq.'+encodeURIComponent(data.user.id),{
    headers:{apikey:config.supabasePublishableKey,Authorization:'Bearer '+data.access_token}
  });
  if(!Array.isArray(membership)||!membership.some(row=>row.active===true && ['admin','owner','manager','editor'].includes(row.role))){
    throw Error('Acesso não autorizado para esta conta.');
  }
  return {accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+Number(data.expires_in??3600)*1000};
}
$('#signin-form').onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button');
  button.disabled=true;setStatus('#signin-status','Conferindo acesso...');
  try{
    const data=await signIn(form.elements.email.value.trim(),form.elements.password.value);
    form.elements.password.value='';session=data;demo=false;toggleWorkspace();
  }catch(error){setStatus('#signin-status',error.message);}
  finally{button.disabled=false;}
};
async function authorize(){
  if(!session)throw Error('Entre com a conta autorizada ou use o modo demonstração.');
  if(Date.now()>session.expiresAt-90000){
    const refreshed=await service(origin()+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:session.refreshToken})
    });
    if(!refreshed.access_token)throw Error('Sessão expirada. Entre novamente.');
    session={accessToken:refreshed.access_token,refreshToken:refreshed.refresh_token,expiresAt:Date.now()+Number(refreshed.expires_in||3600)*1000};
  }
  return session.accessToken;
}
async function trier(action,body={}){
  const token=await authorize();
  return service(origin()+'/functions/v1/trier-api',{
    method:'POST',headers:{
      apikey:config.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'
    },body:JSON.stringify({action,...body})
  });
}
function renderBatch(){
  $('#count-labels').textContent=String(batch.length);
  $('#batch-counter').textContent=String(batch.length);
  $('#count-pages').textContent=String(Math.ceil(batch.length/8));
  $('#print').disabled=batch.length===0;
  $('#batch').innerHTML=batch.length?batch.map((item,i)=>
    '<div class="batch-item"><span class="batch-index">'+(i+1)+'</span>'+
    '<div class="batch-description"><strong>'+enc(item.name)+'</strong><small>'+enc(item.size||'Sem apresentação')+
    ' · Loja '+enc(item.store)+' · '+enc(item.code||'sem código')+' · '+(item.origin==='trier'?'Consultado na Trier':item.origin==='demo'?'DEMONSTRAÇÃO':'Manual/CSV')+'</small></div>'+
    '<div class="batch-price">'+(item.regularPriceCents!==null?'<del>'+enc(brl(item.regularPriceCents))+'</del>':'')+
    '<strong>'+enc(brl(item.priceCents))+'</strong></div>'+
    '<div class="batch-buttons"><button data-edit="'+i+'" title="Editar">✎</button><button data-up="'+i+'" '+(!i?'disabled':'')+' title="Subir">↑</button>'+
    '<button data-down="'+i+'" '+(i===batch.length-1?'disabled':'')+' title="Descer">↓</button>'+
    '<button class="remove" data-remove="'+i+'" title="Remover">×</button></div></div>'
  ).join(''):'<p class="empty">Nenhuma etiqueta adicionada.</p>';
}
$('#batch').onclick=event=>{
  const button=event.target.closest('button');
  if(!button)return;
  const i=Number(button.dataset.edit ?? button.dataset.up ?? button.dataset.down ?? button.dataset.remove);
  if(!Number.isInteger(i)||i<0||i>=batch.length)return;
  if(button.hasAttribute('data-remove')){batch.splice(i,1);}
  else if(button.hasAttribute('data-up')&&i>0){[batch[i],batch[i-1]]=[batch[i-1],batch[i]];}
  else if(button.hasAttribute('data-down')&&i<batch.length-1){[batch[i],batch[i+1]]=[batch[i+1],batch[i]];}
  else if(button.hasAttribute('data-edit')){
    const item=batch[i],form=$('#manual-form');
    form.elements.name.value=item.name;form.elements.size.value=item.size;
    form.elements.code.value=item.code;form.elements.price.value=(item.priceCents/100).toFixed(2).replace('.',',');
    form.elements.old.value=item.regularPriceCents===null?'':(item.regularPriceCents/100).toFixed(2).replace('.',',');
    $('#store').value=item.store;form.dataset.editIndex=String(i);
    $('#manual-submit').textContent='Salvar alteração';showTab('create');
    form.scrollIntoView({block:'center',behavior:'smooth'});
    setStatus('#manual-status','Editando etiqueta '+(i+1)+'. Salve para aplicar alterações.');
    return;
  }
  renderBatch();
};
$('#store').onchange=()=>{
  results=[];$('#search-results').innerHTML='';
  setStatus('#search-status',$('#store').value==='1'?'Loja 1: somente cadastro manual ou CSV até integrar a filial.':'Loja 2: consulta Trier disponível após autenticação.');
};
$('#manual-form').onsubmit=event=>{
  event.preventDefault();
  const form=event.currentTarget;
  try{
    const item=validateLabel({
      name:form.elements.name.value,size:form.elements.size.value,code:form.elements.code.value,
      priceCents:priceToCents(form.elements.price.value),regularPriceCents:priceToCents(form.elements.old.value),
      store:$('#store').value,origin:demo?'demo':'manual'
    });
    const editIndex=form.dataset.editIndex;
    if(editIndex!==undefined && editIndex!=='')batch[Number(editIndex)]=item;
    else batch.push(item);
    delete form.dataset.editIndex;
    form.reset();$('#manual-submit').textContent='Adicionar etiqueta';
    setStatus('#manual-status','Etiqueta pronta para revisão.');
    renderBatch();
  }catch(error){setStatus('#manual-status',error.message);}
};
$('#trier-search').onsubmit=async event=>{
  event.preventDefault();
  if(demo){setStatus('#search-status','A Trier está desativada na demonstração. Use o exemplo ou a importação CSV.');return;}
  if($('#store').value!=='2'){setStatus('#search-status','A integração da Loja 1 ainda não foi validada.');return;}
  const form=event.currentTarget,button=form.querySelector('button[type=submit]');
  button.disabled=true;results=[];$('#search-results').innerHTML='';
  setStatus('#search-status','Consultando produtos no Trier...');
  try{
    const response=await trier('registration-search',{
      mode:form.elements.mode.value,query:form.elements.query.value.trim(),offset:0,activeOnly:false
    });
    results=response.rows??[];
    $('#search-results').innerHTML=results.length?results.map((p,i)=>
      '<div class="search-hit"><div><strong>'+enc(p.name)+'</strong><small>Cód. '+enc(p.shortCode)+
      ' · '+(Number.isSafeInteger(p.priceCents)?enc(brl(p.priceCents)):'Preço indisponível')+'</small></div>'+
      '<button type="button" class="outline" data-add="'+i+'">Conferir preço</button></div>'
    ).join(''):'<p class="empty">Nenhum produto nesta pesquisa.</p>';
    setStatus('#search-status',results.length+' produto(s) encontrados. '+(response.note||''));
  }catch(error){setStatus('#search-status',error.message+' Verifique a URL independente nas origens autorizadas do Supabase.');}
  finally{button.disabled=false;}
};
$('#search-results').onclick=async event=>{
  const button=event.target.closest('button[data-add]');
  if(!button)return;
  const p=results[Number(button.dataset.add)];
  if(!p)return;
  button.disabled=true;button.textContent='Conferindo...';
  try{
    const response=await trier('registration-preview',{codes:[p.shortCode]});
    const row=response.rows?.find(item=>item.shortCode===p.shortCode);
    if(!row)throw Error('O item não retornou preço validado.');
    batch.push(labelFromTrier(row));renderBatch();
    button.textContent='Adicionada';
  }catch(error){setStatus('#search-status','Não foi possível validar o preço: '+error.message);button.disabled=false;button.textContent='Tentar novamente';}
};
$('#csv-file').onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>1024*1024)throw Error('O limite do arquivo é 1 MB.');
    const data=parseLabelCsv(await file.text(),$('#store').value);
    batch.push(...data.rows.map(row=>({...row,origin:demo?'demo':'csv'})));
    renderBatch();
    setStatus('#file-status',data.rows.length+' etiqueta(s) importada(s). '+(data.errors.length?data.errors.slice(0,6).join(' | '):'Confira os valores antes de imprimir.'));
  }catch(error){setStatus('#file-status',error.message);}
  finally{event.target.value='';}
};
$('#load-examples').onclick=()=>{
  const examples=[
    ['PAMPERS BABY SHARK','M68 G60 XG56 XXG50',7904,7699],
    ['FRALDA INFANTIL','P70 M60 G54 XG48 XXG42',5939,4999],
    ['FRALDA INFANTIL','M34 G30 XG26 XXG22',5085,4299],
    ['FRALDA INFANTIL','P20 M18 G16 XG12 XXG12',2399,2099],
    ['NUTREN SENIOR','740G ZERO LACTOSE',20480,13999],
    ['LAVITAN COLÁGENO','HIDROLISADO 300G',13747,6499],
    ['ACETONA LUTEX','AP 100mL',1499,999],
    ['TINTA NATUCOR','6.7',1810,1099]
  ];
  batch.push(...examples.map(([name,size,regularPriceCents,priceCents])=>
    validateLabel({name,size,store:$('#store').value,regularPriceCents,priceCents,origin:'demo'})));
  renderBatch();setStatus('#file-status','8 exemplos fictícios adicionados. Não utilize esses preços na loja.');
};
$('#clear-batch').onclick=()=>{
  if(batch.length && !window.confirm('Limpar todas as etiquetas do lote?'))return;
  batch=[];renderBatch();setStatus('#batch-status','Lote esvaziado.');
};
$('#print').onclick=()=>{
  if(!batch.length)return;
  const popup=window.open('','_blank');
  if(!popup){setStatus('#batch-status','Permita janelas pop-up para imprimir o PDF.');return;}
  try{
    popup.document.open();popup.document.write(printDocument(batch,{logoUrl:config.logoUrl}));
    popup.document.close();
    popup.document.getElementById('print-labels')?.addEventListener('click',()=>popup.print());
  }catch(error){popup.close();setStatus('#batch-status',error.message);}
};
$('#load-history').onclick=async event=>{
  if(demo){setStatus('#history-status','O monitor real não é acessado em modo demonstração.');return;}
  const button=event.currentTarget;button.disabled=true;setStatus('#history-status','Consultando últimas remarcações...');
  try{
    const data=await trier('labels-history'),entries=data.entries??[];
    $('#history-list').innerHTML=entries.length?entries.map(item=>
      '<div class="history-entry"><div><strong>'+enc(item.name||'Produto')+'</strong><small>Cód. '+enc(item.shortCode||'—')+
      ' · '+enc(new Date(item.changedAt).toLocaleString('pt-BR'))+'</small></div>'+
      '<div><del>'+enc(item.beforeCents===null?'—':brl(item.beforeCents))+'</del><strong>'+enc(item.afterCents===null?'—':brl(item.afterCents))+'</strong></div></div>'
    ).join(''):'<p class="empty">Nenhuma remarcação encontrada.</p>';
    setStatus('#history-status',entries.length+' registro(s) recentes da Loja 2.');
  }catch(error){setStatus('#history-status','Monitor ainda não implantado: '+error.message);}
  finally{button.disabled=false;}
};
