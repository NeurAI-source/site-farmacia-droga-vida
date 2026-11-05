// Selection is deliberately limited to the current filtered results.
export function mountBulkStatus({root,getCatalog,save,onSaved,isBusy}){
 const selected=new Set();let visible=[],busy=false;
 const bar=document.createElement('div');bar.className='bulk-status';
 bar.innerHTML='<label><input type="checkbox" data-bulk-all> Selecionar todos os resultados</label><span data-bulk-count role="status"></span><button type="button" class="button white" data-bulk-active>Ativar selecionados</button><button type="button" class="button white" data-bulk-inactive>Inativar selecionados</button><button type="button" class="text-button" data-bulk-clear>Limpar seleção</button><p data-bulk-feedback role="status"></p>';
 root.querySelector('.table-scroll').before(bar);
 const all=bar.querySelector('[data-bulk-all]'),feedback=bar.querySelector('[data-bulk-feedback]');
 function sync(){
  all.checked=!!visible.length&&selected.size===visible.length;all.indeterminate=selected.size>0&&!all.checked;all.disabled=busy||!visible.length;
  bar.querySelector('[data-bulk-count]').textContent=`${selected.size} selecionado(s)`;
  for(const el of bar.querySelectorAll('button'))el.disabled=busy||!selected.size;
  for(const input of root.querySelectorAll('[data-bulk-product]')){input.checked=selected.has(Number(input.dataset.bulkProduct));input.disabled=busy;}
 }
 function refresh(products){
  visible=products.map(p=>p.id);const allowed=new Set(visible);for(const id of selected)if(!allowed.has(id))selected.delete(id);
  for(const row of root.querySelectorAll('#rows tr')){
   const edit=row.querySelector('[data-edit]');if(!edit)continue;
   const input=document.createElement('input');input.type='checkbox';input.dataset.bulkProduct=edit.dataset.edit;
   input.setAttribute('aria-label','Selecionar '+row.querySelector('strong').textContent);row.querySelector('td').prepend(input);
   input.onchange=()=>{input.checked?selected.add(Number(input.dataset.bulkProduct)):selected.delete(Number(input.dataset.bulkProduct));sync();};
  }sync();
 }
 all.onchange=()=>{selected.clear();if(all.checked)visible.forEach(id=>selected.add(id));sync();};
 bar.querySelector('[data-bulk-clear]').onclick=()=>{selected.clear();sync();};
 async function apply(active){
  if(busy||isBusy())return;
  const catalog=getCatalog(),ids=new Set(selected),changes=catalog.products.filter(p=>ids.has(p.id)&&p.active!==active);
  if(!changes.length){feedback.textContent='Os selecionados já estão nesse status.';return;}
  if(!window.confirm(`${active?'Ativar':'Inativar'} ${changes.length} produto(s) no rascunho?\n\nSomente o status será alterado. Para atualizar o site, use Publicar no site.`))return;
  busy=true;feedback.textContent='Salvando alterações…';sync();
  try{
   const next=structuredClone(catalog),changed=new Set(changes.map(p=>p.id)),now=new Date().toISOString();
   for(const p of next.products)if(changed.has(p.id)){p.active=active;p.updatedAt=now;}
   await save(next);selected.clear();onSaved();feedback.textContent=`${changes.length} produto(s) ${active?'ativado(s)':'inativado(s)'} no rascunho. Para atualizar o site, use Publicar no site.`;
  }catch(error){feedback.textContent=error.message+' A seleção foi preservada. Nenhuma publicação foi solicitada.';}
  finally{busy=false;sync();}
 }
 bar.querySelector('[data-bulk-active]').onclick=()=>apply(true);bar.querySelector('[data-bulk-inactive]').onclick=()=>apply(false);
 return {refresh,isBusy:()=>busy};
}
