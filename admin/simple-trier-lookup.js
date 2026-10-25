import { canonicalCode } from '../product-identities.js';
import { suggestRegistration,findDuplicates } from '../registration-utils.js';
import { money,normalize } from '../catalog-utils.js';

// Convenience for the classic manual editor. No save, publication or ERP write.
export function mountSimpleTrierLookup({form,dialog,request,getCatalog,getEditing,onEdit,onFilled,restoreCategory}) {
  const field=name=>form.elements.namedItem(name),codeInput=field('shortCode');
  const names=['name','ean','brand','detail','price','oldPrice','stockQuantity'];
  const tracked=[...names,'category','subcategory'];
  const panel=document.createElement('div');panel.className='simple-trier-lookup';
  const lookupButton=document.createElement('button');lookupButton.type='button';lookupButton.className='text-button';lookupButton.textContent='Consultar código na Trier';
  const status=document.createElement('p');status.className='muted small';status.dataset.trierLookupStatus='';status.setAttribute('role','status');
  const applyButton=document.createElement('button');applyButton.type='button';applyButton.className='text-button';applyButton.textContent='Usar os dados encontrados';applyButton.hidden=true;
  const editButton=document.createElement('button');editButton.type='button';editButton.className='text-button';editButton.textContent='Editar cadastro existente';editButton.hidden=true;
  panel.append(lookupButton,status,applyButton,editButton);codeInput.closest('label').append(panel);
  let generation=0,lastAttempt='',baseline={},dirty=new Set(),filled=new Map(),found=null,source=null,duplicate=null;
  const hideResult=()=>{found=null;source=null;duplicate=null;applyButton.hidden=editButton.hidden=true;};
  const reset=()=>{generation++;lastAttempt='';dirty=new Set();filled.clear();hideResult();baseline=Object.fromEntries(tracked.map(n=>[n,field(n).value]));lookupButton.disabled=false;status.textContent='Ao sair do código reduzido, consultamos a filial 2. Cadastro e foto continuam manuais.';};
  document.addEventListener('dv-product-edit',reset);
  dialog.addEventListener('close',()=>{generation++;hideResult();});
  form.addEventListener('input',event=>{
    const name=event.target.name;
    if(tracked.includes(name)){dirty.add(name);filled.delete(name);}
    if(name==='category'||name==='subcategory')for(const n of ['category','subcategory']){dirty.add(n);filled.delete(n);}
    if(name!=='shortCode')return;
    generation++;lastAttempt='';hideResult();lookupButton.disabled=false;
    // Never keep fields from product A attached to a newly typed product B.
    for(const [n,value] of filled)if(field(n).value===value&&!dirty.has(n)){field(n).value=baseline[n];if(n==='category')restoreCategory?.(baseline.subcategory);}
    filled.clear();status.textContent='Termine o código reduzido e saia do campo para consultar.';
  });
  function classificationFor(row) {
    const catalog=getCatalog(),suggestion=suggestRegistration(row,catalog.categories,catalog.products.map(p=>p.brand));
    if(suggestion.category)return suggestion;
    const key=s=>normalize(s||'').trim(),terms=[row.group,row.providerCategory].filter(Boolean).map(key);
    const matches=catalog.categories.filter(c=>terms.includes(key(c.name)));
    if(matches.length!==1)return suggestion;
    const subs=matches[0].subcategories.filter(s=>terms.includes(key(s.name)));
    if(subs.length>1)return suggestion;
    return {...suggestion,category:matches[0].name,subcategory:subs[0]?.name||'',reason:'Grupo oficial coincide com categoria existente'};
  }
  function values(row) {
    const suggestion=classificationFor(row);
    return {name:suggestion.name,ean:row.ean||'',brand:suggestion.brand,detail:suggestion.detail,
      price:(row.priceCents/100).toFixed(2),oldPrice:row.regularPriceCents?(row.regularPriceCents/100).toFixed(2):'',stockQuantity:String(Math.max(0,row.stockQuantity))};
  }
  function apply(overwrite=false) {
    if(!found||!dialog.open||canonicalCode(codeInput.value)!==found.shortCode)return;
    const editing=getEditing(),data=values(found),applied=[];
    const pricePairProtected=!overwrite&&(dirty.has('price')||dirty.has('oldPrice')||editing&&(field('price').value.trim()!==''||field('oldPrice').value.trim()!==''));
    for(const n of names){
      if(pricePairProtected&&(n==='price'||n==='oldPrice')){
        // A missing regular price may be filled if it belongs to the exact same
        // current sale price. Never pair it with another manually chosen price.
        const samePrice=Number(field('price').value)>0&&Math.abs(Number(field('price').value)*100-found.priceCents)<0.000001;
        if(n==='oldPrice'&&samePrice&&found.regularPriceCents&&!dirty.has(n)&&field(n).value===''&&field(n).value===baseline[n]){field(n).value=data[n];filled.set(n,data[n]);applied.push(n);}
        continue;
      }
      const input=field(n),untouched=!dirty.has(n)&&input.value===baseline[n];
      if(!overwrite&&(!untouched||editing&&input.value.trim()!==''))continue;
      if(!data[n]&&n!=='oldPrice')continue;
      input.value=data[n];filled.set(n,data[n]);dirty.delete(n);applied.push(n);
    }
    source=found;
    const suggestion=classificationFor(found);
    const categoryAllowed=overwrite||(!editing&&!dirty.has('category')&&!dirty.has('subcategory'));
    if(onFilled?.({suggestion,categoryAllowed}))for(const n of ['category','subcategory']){filled.set(n,field(n).value);dirty.delete(n);}
    return applied.length;
  }
  async function lookup(force=false) {
    const raw=codeInput.value.trim(),code=canonicalCode(raw);
    if(!dialog.open||!raw)return;
    if(!/^\d{1,12}$/.test(raw)||Number(raw)<1){status.textContent=/^\d{13,14}$/.test(raw)?'Este campo usa o código reduzido da Trier, não o código de barras (EAN).':'A consulta Trier usa código reduzido numérico de 1 a 12 dígitos. Você pode continuar o cadastro manual.';return;}
    if(lookupButton.disabled&&lastAttempt===code)return;
    if(!force&&(lastAttempt===code||canonicalCode(getEditing()?.shortCode)===code))return;
    if(form.querySelector('#variants .variant')){status.textContent='Este produto tem tamanhos/apresentações. Mantenha o código individual de cada tamanho no cadastro manual.';return;}
    const ticket=++generation;lastAttempt=code;hideResult();lookupButton.disabled=true;status.textContent='Consultando dados e preços da filial 2 na Trier…';
    const current=()=>generation===ticket&&dialog.open&&canonicalCode(codeInput.value)===code;
    try{
      const search=await request('registration-search',{mode:'code',query:raw,activeOnly:false,offset:0});
      if(!current())return;
      if(search.stale)throw Error('stale');
      if(!search.rows?.length){status.textContent='Código não encontrado na Trier. Confira o código reduzido ou preencha manualmente.';return;}
      const result=await request('registration-preview',{codes:[raw]});
      if(!current())return;
      const row=result.rows?.[0];
      if(result.rows?.length!==1||!row||canonicalCode(row.shortCode)!==code||row.storeId!=='2'||typeof row.name!=='string'||!Number.isSafeInteger(row.priceCents)||row.priceCents<=0||!Number.isSafeInteger(row.stockQuantity)||typeof row.active!=='boolean'||!Number.isFinite(Date.parse(row.fetchedAt))||Math.abs(Date.now()-Date.parse(row.fetchedAt))>900000)throw Error('invalid');
      if(row.regularPriceCents!=null&&(row.discountStatus!=='checked'||!Number.isSafeInteger(row.regularPriceCents)||row.regularPriceCents<=row.priceCents))throw Error('invalid');
      if(form.querySelector('#variants .variant')){status.textContent='O formulário ganhou tamanhos/apresentações durante a consulta. Confira cada código individual; os dados gerais foram preservados.';return;}
      found={...row,shortCode:code};
      duplicate=findDuplicates({shortCode:code},getCatalog().products,getEditing()?.id).find(d=>d.exact);
      if(duplicate){status.textContent=`Este código já está cadastrado em ${duplicate.name}${duplicate.size?' — '+duplicate.size:''}. Abra o cadastro existente para evitar duplicação.`;editButton.hidden=false;return;}
      apply();
      const suggested=values(found),classification=classificationFor(found);
      const priceNote=row.regularPriceCents?'De confirmado na promoção Trier.':row.discountStatus==='checked'?'De não preenchido: a Trier não confirmou um par De/Por universal válido.':'De não preenchido: a consulta de promoções não foi concluída; tente novamente.';
      status.textContent=`Trier · filial 2 · ${row.name} · EAN ${row.ean||'não informado'} · ${row.regularPriceCents?'De '+money(row.regularPriceCents)+' / ':''}Por ${money(row.priceCents)} · Estoque consultado: ${row.stockQuantity} · ${row.active?'ativo':'inativo'}. Consultado em ${new Date(row.fetchedAt).toLocaleString('pt-BR')}. Marca: ${suggested.brand||'revisar'} e apresentação: ${suggested.detail||'revisar'} são sugestões pelo nome. Categoria/subcategoria sugeridas: ${classification.category?classification.category+' / '+(classification.subcategory||'revisar'):'revisar manualmente'}. ${priceNote} Campos preenchidos por você foram preservados. Confira antes de salvar.`;
      applyButton.hidden=false;
    }catch(error){if(current())status.textContent=error.requiresLogin?error.message:'Não foi possível confirmar os dados desse código na Trier. Seus campos foram preservados. Confira o código ou continue manualmente.';}
    finally{if(current())lookupButton.disabled=false;}
  }
  codeInput.addEventListener('blur',()=>lookup());
  codeInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();lookup(true);}});
  lookupButton.onclick=()=>lookup(true);
  applyButton.onclick=()=>{
    if(!found||!confirm('Substituir nome, EAN, marca, apresentação, categoria, subcategoria, preços e quantidade pelos dados consultados? Confira as sugestões e salve o produto para confirmar.'))return;
    apply(true);
  };
  editButton.onclick=()=>{if(duplicate)onEdit(duplicate.productId);};
  return {sourceFor(product){
    if(!source||product.variants.length||canonicalCode(product.shortCode)!==source.shortCode)return null;
    return {id:source.externalId||source.shortCode,code:source.shortCode,storeId:'2',syncedAt:source.fetchedAt,sourceName:source.name,priceCents:source.priceCents,regularPriceCents:source.regularPriceCents||null,stockQuantity:source.stockQuantity,active:source.active};
  }};
}
