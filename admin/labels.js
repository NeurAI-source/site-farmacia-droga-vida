import {brl,escapeHtml,priceToCents,validateLabel,labelFromTrier,parseLabelCsv,printDocument,LABELS_PER_SHEET} from './labels-core.js';
import {invokeAdminRequest} from './backend-actions.js';

export function mountLabels({client}) {
  const root=document.createElement('section');
  root.id='labels-view';root.className='view labels-workspace';root.hidden=true;
  root.innerHTML='<div class="label-intro"><div><p class="eyebrow">NEUR.AI ETIQUETAS · PROTÓTIPO</p><h2>Etiquetas de preço</h2><p>Monte até 8 etiquetas por folha A4. A consulta Trier existente é exclusiva da unidade 2.</p></div><div class="label-stats"><strong data-total>0</strong><small>etiquetas no lote</small><strong data-pages>0</strong><small>folhas A4</small></div></div>'+
  '<div class="labels-tabs"><button type="button" data-tab="build" class="selected">Montar etiquetas</button><button type="button" data-tab="monitor">Monitor de remarcações</button></div>'+
  '<div data-pane="build"><div class="labels-grid">'+
  '<section class="labels-panel"><h3>1. Filial e consulta Trier</h3><label>Unidade<select data-store><option value="2">Unidade 2 · Nature 1 (Trier)</option><option value="1">Unidade 1 · Solo Sagrado (manual/CSV)</option></select></label>'+
  '<form data-search-form class="labels-form"><label>Pesquisar por<select name="mode"><option value="code">Código reduzido</option><option value="ean">EAN</option><option value="name">Nome</option></select></label><label>Busca<input name="query" autocomplete="off" maxlength="120" placeholder="Ex.: 12345" required></label><button type="submit">Consultar Trier</button></form>'+
  '<p class="labels-help">Busca somente leitura. Antes de adicionar, o sistema faz uma prévia de preço e desconto na Trier. Preços e promoções podem variar por unidade.</p><div data-search-status role="status"></div><div data-search-results class="label-results"></div></section>'+
  '<section class="labels-panel"><h3>2. Adicionar manualmente</h3><form data-manual-form class="labels-form labels-manual">'+
  '<label>Nome do produto<input name="name" maxlength="120" required placeholder="Ex.: Pampers Baby Shark"></label>'+
  '<label>Tamanhos / apresentação<input name="size" maxlength="80" placeholder="M68 G60 XG56 XXG50"></label>'+
  '<label>Código reduzido<input name="code" maxlength="40" placeholder="Opcional"></label>'+
  '<label>De (R$)<input name="old" inputmode="decimal" placeholder="79,04"></label>'+
  '<label>Por (R$)<input name="price" inputmode="decimal" placeholder="76,99" required></label>'+
  '<button type="submit">Adicionar ao lote</button></form></section>'+
  '<section class="labels-panel labels-import"><h3>3. Importar planilha</h3><p>Importe CSV separado por ponto e vírgula. Excel: salve como CSV UTF-8.</p><input type="file" accept=".csv,text/csv,text/plain" data-file>'+
  '<small>Colunas: <code>codigo;produto;tamanhos;de;por;loja</code>. Até 500 produtos por arquivo.</small><button type="button" class="labels-secondary" data-example>Carregar 8 etiquetas fictícias (demonstração)</button></section>'+
  '</div><section class="labels-panel"><div class="labels-actions"><div><h3>Lote pronto para impressão</h3><p>É possível misturar tamanhos, preços e produtos; a impressão respeita a ordem da lista.</p></div><div><button type="button" class="labels-secondary" data-clear>Limpar</button><button type="button" data-print>Visualizar / imprimir A4</button></div></div><p data-batch-status role="status"></p><div data-batch class="labels-batch"></div></section></div>'+
  '<div data-pane="monitor" hidden><section class="labels-panel"><h3>Monitor de remarcações · Unidade 2</h3><p>Mostra apenas mudanças reais de preço registradas pela sincronização Trier. Não confunde mudança de estoque com remarcação.</p><button type="button" data-history>Consultar alterações</button><p data-history-status role="status">A consulta dependerá da instalação da nova rota administrativa, ainda não publicada.</p><div data-history-list></div><p class="labels-help">Somente a unidade 2 está integrada. A consulta histórica da unidade 1 depende de sua própria configuração de ERP.</p></section></div>';
  document.querySelector('main footer').before(root);
  const $=selector=>root.querySelector(selector);
  const status=(selector,text)=>$(selector).textContent=text;
  const request=(action,payload={})=>invokeAdminRequest(client,'trier-api',{body:{action,...payload}});
  const labels=[];let found=[];
  const store=()=> $('[data-store]').value;
  const showPane=name=>{
    root.querySelectorAll('[data-pane]').forEach(node=>node.hidden=node.dataset.pane!==name);
    root.querySelectorAll('[data-tab]').forEach(node=>node.classList.toggle('selected',node.dataset.tab===name));
  };
  const escape=escapeHtml;
  const format=v=>v===null?'—':brl(v);
  function renderBatch(){
    $('[data-total]').textContent=String(labels.length);
    $('[data-pages]').textContent=String(Math.ceil(labels.length/LABELS_PER_SHEET));
    $('[data-print]').disabled=labels.length===0;
    $('[data-batch]').innerHTML=labels.length?labels.map((item,index)=>
      '<div class="labels-row"><span class="labels-number">'+(index+1)+'</span><div class="labels-description"><strong>'+escape(item.name)+'</strong><small>'+escape(item.size || 'Sem tamanho')+
      ' · Loja '+escape(item.store)+' · '+escape(item.code||'sem código')+' · '+(item.origin==='trier'?'Trier (prévia)':'Manual/CSV (conferir)')+'</small></div>'+
      '<div class="labels-value">'+(item.regularPriceCents?'<del>'+escape(brl(item.regularPriceCents))+'</del>':'')+
      '<strong>'+escape(brl(item.priceCents))+'</strong></div>'+
      '<div class="labels-item-actions"><button type="button" data-up="'+index+'" '+(index===0?'disabled':'')+' title="Subir" aria-label="Subir etiqueta">↑</button>'+
      '<button type="button" data-down="'+index+'" '+(index===labels.length-1?'disabled':'')+' title="Descer" aria-label="Descer etiqueta">↓</button>'+
      '<button type="button" data-remove="'+index+'" title="Remover etiqueta" aria-label="Remover etiqueta">×</button></div></div>').join(''):'<p class="labels-empty">Nenhuma etiqueta adicionada. Busque na Trier, cadastre manualmente ou importe CSV.</p>';
  }
  $('[data-store]').onchange=()=>{
    found=[];$('[data-search-results]').innerHTML='';
    status('[data-search-status]',store()==='1'?'Unidade 1: informe preços manualmente ou importe CSV. A API atual é da unidade 2.':'Unidade 2 selecionada: consultas disponíveis.');
  };
  $('[data-search-form]').onsubmit=async event=>{
    event.preventDefault();found=[];
    const form=event.currentTarget,mode=form.elements.mode.value,query=form.elements.query.value.trim();
    if(store()!=='2'){status('[data-search-status]','Consulta indisponível para a unidade 1. Use cadastro manual ou CSV.');return;}
    status('[data-search-status]','Consultando a Trier...');$('[data-search-results]').innerHTML='';
    const button=form.querySelector('button');button.disabled=true;
    try{
      const response=await request('registration-search',{mode,query,offset:0,activeOnly:false});
      found=response.rows||[];
      $('[data-search-results]').innerHTML=found.length?found.map((item,index)=>
        '<div class="labels-found"><div><strong>'+escape(item.name)+'</strong><small>Cód. '+escape(item.shortCode)+
        ' · '+(Number.isSafeInteger(item.priceCents)?escape(brl(item.priceCents)):'Preço não informado')+'</small></div>'+
        '<button type="button" data-add="'+index+'">Conferir e adicionar</button></div>').join(''):'<p>Nenhum produto encontrado nesta consulta.</p>';
      status('[data-search-status]',found.length+' produto(s) encontrado(s). '+(response.stale?'Cache desatualizado: valide antes de imprimir.':response.note||''));
    }catch(error){status('[data-search-status]','Não foi possível consultar a Trier: '+error.message);}
    finally{button.disabled=false;}
  };
  $('[data-search-results]').onclick=async event=>{
    const button=event.target.closest('[data-add]');if(!button)return;
    const product=found[Number(button.dataset.add)];if(!product)return;
    button.disabled=true;button.textContent='Conferindo...';
    try{
      const response=await request('registration-preview',{codes:[product.shortCode]});
      const row=response.rows?.find(item=>item.shortCode===product.shortCode);
      if(!row)throw Error('Produto não confirmado na prévia Trier.');
      labels.push(labelFromTrier(row));
      renderBatch();status('[data-batch-status]','Produto consultado e incluído. Confira o preço e o tamanho na etiqueta.');
      button.textContent='Adicionado';
    }catch(error){status('[data-search-status]','Não foi possível validar o preço: '+error.message);button.disabled=false;button.textContent='Tentar novamente';}
  };
  $('[data-manual-form]').onsubmit=event=>{
    event.preventDefault();const form=event.currentTarget;
    try{
      labels.push(validateLabel({name:form.elements.name.value,size:form.elements.size.value,code:form.elements.code.value,
        priceCents:priceToCents(form.elements.price.value),
        regularPriceCents:priceToCents(form.elements.old.value),store:store(),origin:'manual'}));
      renderBatch();form.reset();status('[data-batch-status]','Etiqueta manual incluída. Confira valores antes de imprimir.');
    }catch(error){status('[data-batch-status]',error.message);}
  };
  $('[data-file]').onchange=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>1024*1024){status('[data-batch-status]','CSV acima de 1 MB. Divida em arquivos menores.');return;}
    try{
      const result=parseLabelCsv(await file.text(),store());
      labels.push(...result.rows);renderBatch();
      status('[data-batch-status]',result.rows.length+' etiqueta(s) importada(s). '+(result.errors.length?result.errors.slice(0,8).join(' | ')+' (mais erros podem existir)':'Revise os preços do arquivo antes de imprimir.'));
    }catch(error){status('[data-batch-status]',error.message);}
    event.target.value='';
  };
  $('[data-example]').onclick=()=>{
    const data=[
      ['Pampers Baby Shark','M68 G60 XG56 XXG50',7904,7699],
      ['Fralda Infantil','P70 M60 G54 XG48',5939,4999],
      ['Fralda Econômica','M34 G30 XG26 XXG22',5685,4299],
      ['Fralda Infantil Especial','P20 M18 G16 XG12',3299,2699],
      ['Shampoo','350 mL',2499,1999],['Sabonete','90 g',499,399],
      ['Hidratante','200 mL',2990,2290],['Lenços umedecidos','48 unidades',1699,1299]
    ];
    for(const [name,size,regularPriceCents,priceCents] of data)
      labels.push(validateLabel({name:name+' (DEMO)',size,regularPriceCents,priceCents,store:store(),origin:'demo'}));
    renderBatch();status('[data-batch-status]','Dados fictícios adicionados: NÃO usar estes preços na loja.');
  };
  $('[data-batch]').onclick=event=>{
    const up=event.target.closest('[data-up]'),down=event.target.closest('[data-down]'),remove=event.target.closest('[data-remove]');
    if(remove){labels.splice(Number(remove.dataset.remove),1);}
    if(up){const i=Number(up.dataset.up);if(i>0)[labels[i],labels[i-1]]=[labels[i-1],labels[i]];}
    if(down){const i=Number(down.dataset.down);if(i<labels.length-1)[labels[i],labels[i+1]]=[labels[i+1],labels[i]];}
    renderBatch();
  };
  $('[data-clear]').onclick=()=>{if(labels.length && !window.confirm('Limpar o lote de etiquetas?'))return;labels.length=0;renderBatch();status('[data-batch-status]','Lote limpo.');};
  $('[data-print]').onclick=()=>{
    if(!labels.length)return;
    const popup=window.open('','_blank');
    if(!popup){status('[data-batch-status]','O navegador bloqueou a janela. Permita pop-ups para visualizar o PDF.');return;}
    try{
      const logoUrl=new URL('../assets/logo.png',location.href).href;
      popup.document.open();popup.document.write(printDocument(labels,{logoUrl}));popup.document.close();
    }catch(error){popup.close();status('[data-batch-status]',error.message);}
  };
  $('[data-history]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;status('[data-history-status]','Consultando histórico...');
    try{
      const result=await request('labels-history');
      const entries=Array.isArray(result.entries)?result.entries:[];
      $('[data-history-list]').innerHTML=entries.length?entries.map(item=>
        '<div class="labels-history-row"><div><strong>'+escape(item.name||'Produto '+item.productId)+'</strong>'+
        '<small>Cod. '+escape(item.shortCode||'—')+' · '+escape(new Date(item.changedAt).toLocaleString('pt-BR'))+'</small></div>'+
        '<div><del>'+escape(format(item.beforeCents))+'</del><strong>'+escape(format(item.afterCents))+'</strong></div></div>').join(''):
        '<p>Nenhuma remarcação encontrada.</p>';
      status('[data-history-status]','Últimas '+entries.length+' remarcações reais da unidade 2, registradas na auditoria.');
    }catch{
      status('[data-history-status]','A rota segura de histórico ainda depende de implantação. Nenhum preço foi alterado.');
    }finally{button.disabled=false;}
  };
  root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>showPane(button.dataset.tab));
  renderBatch();
  return {show:()=>{root.hidden=false;},hide:()=>{root.hidden=true;}};
}
