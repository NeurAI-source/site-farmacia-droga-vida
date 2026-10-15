const labels={queued:'Na fila',pending:'Aguardando',building:'Em andamento',published:'Publicado',failed:'Falhou',skipped:'Sem nova publicação',completed:'Execução concluída',unknown:'Consultar detalhes'};
const date=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const value=(v,currency=false)=>v==null?'—':currency?money(v):typeof v==='boolean'?v?'Sim':'Não':typeof v==='object'?JSON.stringify(v,null,2):String(v);
export function mountPublications({root,action}) {
  let visible=false,busy=false,offset=0,loadedOffset=0,hasMore=false,items=[],timer,detailId=0;
  root.innerHTML=`<div class="pub-toolbar"><div><p class="eyebrow">ACOMPANHE CADA ATUALIZAÇÃO</p><h2>Publicações do site</h2><p>Andamento e histórico, com horários de Brasília.</p></div><button type="button" class="button white" data-refresh>Atualizar agora</button></div><p class="pub-feedback" data-feedback role="status" aria-live="polite"></p><section class="panel pub-current" aria-label="Publicações em andamento"><h2>Em andamento</h2><div data-active></div></section><section class="panel pub-history"><div class="panel-heading"><h2>Histórico de publicações</h2><span data-page></span></div><div data-history></div><div class="pub-pagination"><button type="button" class="button white" data-previous>Página anterior</button><button type="button" class="button white" data-next>Próxima página</button></div></section><dialog class="pub-dialog" aria-labelledby="pub-detail-title"><div class="dialog-heading"><h2 id="pub-detail-title">Detalhes da publicação</h2><button type="button" aria-label="Fechar detalhes" data-close>×</button></div><div class="editor-body" data-detail></div></dialog>`;
  const $=s=>root.querySelector(s), dialog=$('dialog');
  function card(item) {
    const el=node('article',undefined,'pub-row');
    const info=node('div',undefined,'pub-row-info');
    const top=node('div',undefined,'pub-row-title');top.append(node('strong',item.kind==='code'?'Atualização do site':`Catálogo · versão ${item.draft_version}`),node('span',labels[item.status]||'Estado desconhecido',`pub-badge ${item.status}`));info.append(top);
    if(item.title)info.append(node('p',item.title));
    info.append(node('small',`Solicitada: ${date(item.created_at)}${item.finished_at?' · Concluída: '+date(item.finished_at):''}`));
    info.append(node('p',item.stage || labels[item.status],'pub-stage'));
    if(Number.isFinite(item.percent)){
      const progress=node('progress');progress.max=100;progress.value=item.percent;progress.setAttribute('aria-label','Progresso da publicação');
      const bar=node('div',undefined,'pub-progress');bar.append(progress,node('b',`${item.percent}%`));info.append(bar);
      if(item.percent<100)info.append(node('small','Estimativa pelas etapas concluídas; não representa tempo restante.'));
    } else if(['queued','pending','building'].includes(item.status))info.append(node('small','Aguardando informação das etapas. Nenhuma porcentagem foi estimada.'));
    if(item.error_message)info.append(node('p',item.error_message,'pub-error'));
    const button=node('button','Ver alterações e publicação','button white');button.type='button';button.onclick=()=>details(item.id);
    el.append(info,button);return el;
  }
  function render(){
    const running=items.filter(i=>['queued','pending','building'].includes(i.status));
    $('[data-active]').replaceChildren(...(running.length?running.map(card):[node('p','Nenhuma publicação em andamento.','pub-empty')]));
    $('[data-history]').replaceChildren(...(items.length?items.map(card):[node('p','Nenhuma publicação registrada nesta página.','pub-empty')]));
    $('[data-page]').textContent=`Página ${offset/20+1}`;$('[data-previous]').disabled=offset===0;
  }
  async function load(){
    if(busy)return;busy=true;$('[data-refresh]').disabled=true;$('[data-next]').disabled=$('[data-previous]').disabled=true;
    try{const result=await action('publication-history',{offset});items=result.items||[];loadedOffset=offset;hasMore=!!result.hasMore;render();$('[data-feedback]').textContent=result.warning||`Atualizado às ${date(result.checkedAt)}. Atualização automática a cada 15 segundos enquanto esta aba estiver aberta.`;}
    catch{offset=loadedOffset; $('[data-feedback]').textContent='Não foi possível atualizar. Os últimos dados exibidos foram preservados. Tente novamente.';}
    finally{busy=false;$('[data-refresh]').disabled=false;$('[data-next]').disabled=!hasMore;$('[data-previous]').disabled=offset===0;}
  }
  async function details(id){
    const request=++detailId;const target=$('[data-detail]');target.replaceChildren(node('p','Carregando detalhes…'));if(!dialog.open)dialog.showModal();
    try{
      const result=await action('publication-detail',{id});if(request!==detailId||!dialog.open)return;
      const p=result.publication;target.replaceChildren();target.append(node('p',labels[p.status]||p.stage,'pub-detail-status'));
      const times=node('dl',undefined,'pub-times');for(const [label,v] of [['Solicitada',p.created_at],['Iniciada',p.started_at],['Concluída',p.finished_at]])times.append(node('dt',label),node('dd',date(v)));target.append(times);
      if(p.error_message)target.append(node('p',p.error_message,'pub-error'));
      target.append(node('h3','O que foi alterado'));
      if(p.kind==='catalog'){
        target.append(node('p',result.baselineAvailable?`Comparação com o catálogo publicado na versão ${result.baselineVersion}.`:'Primeiro registro disponível: não há catálogo anterior para comparação.'));
        if(result.changes?.length){const list=node('div',undefined,'pub-changes');for(const change of result.changes){const row=node('article');row.append(node('strong',`${change.entity} · ${change.field}`));const grid=node('div');for(const [label,v] of [['Antes',change.before],['Depois',change.after]]){const cell=node('div');cell.append(node('small',label),node('pre',value(v,change.money)));grid.append(cell);}row.append(grid);list.append(row);}target.append(list);}
        else if(result.baselineAvailable)target.append(node('p','Nenhuma alteração no catálogo em relação à versão anterior.'));
        target.append(node('h3',p.status==='published'?'Conteúdo publicado':'Conteúdo desta publicação'),node('p','Esta cópia pertence à publicação selecionada. Rascunhos posteriores não alteram este registro.'));
        const catalog=result.catalog,products=catalog?.products||[];target.append(node('p',`${products.length} produtos no catálogo · ${products.filter(v=>v.active).length} ativos · ${catalog?.categories?.length||0} categorias.`));
        const table=node('table',undefined,'pub-products'),head=node('thead'),tr=node('tr');for(const label of ['Produto','Preço','Estado'])tr.append(node('th',label));head.append(tr);table.append(head);const tbody=node('tbody');for(const product of products){const r=node('tr');r.append(node('td',product.name),node('td',money(product.priceCents)),node('td',product.active?'Ativo':'Inativo'));tbody.append(r);}table.append(tbody);const scroll=node('div',undefined,'table-scroll');scroll.append(table);target.append(scroll);
        const full=node('details'),summary=node('summary','Ver cópia completa do catálogo');full.append(summary,node('pre',JSON.stringify(catalog,null,2)));target.append(full);
      } else {
        target.append(node('p',p.title||'Atualização do site'),node('p',`Versão do código: ${(p.commit||'').slice(0,12)}`));
        if(!result.filesAvailable)target.append(node('p','Não foi possível comparar os arquivos com uma publicação anterior.'));
        else {const list=node('ul',undefined,'pub-files');for(const file of result.files||[])list.append(node('li',`${file.name} · ${file.status} · +${file.additions} / −${file.deletions}`));target.append(list);if(!result.files?.length)target.append(node('p','Nenhum arquivo de código alterado desde a publicação anterior.'));if(result.filesTruncated)target.append(node('p','A comparação atingiu o limite de 300 arquivos.'));}
        target.append(node('h3','Etapas da publicação'));const list=node('ol',undefined,'pub-steps');for(const step of p.steps||[])list.append(node('li',`${step.name} — ${step.conclusion==='success'?'Concluída':step.conclusion==='skipped'?'Não necessária':step.status==='in_progress'?'Em andamento':step.conclusion||'Aguardando'}`));target.append(list);
      }
    }catch{if(request===detailId)target.replaceChildren(node('p','Não foi possível carregar os detalhes. Feche e tente novamente.'));}
  }
  $('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{detailId++;});
  $('[data-refresh]').onclick=load;$('[data-next]').onclick=()=>{if(!busy){offset+=20;load();}};$('[data-previous]').onclick=()=>{if(!busy){offset=Math.max(0,offset-20);load();}};
  return {show(){visible=true;load();clearInterval(timer);timer=setInterval(()=>{if(visible&&!document.hidden)load();},15000);},hide(){visible=false;clearInterval(timer);},refresh(){if(visible)load();}};
}
