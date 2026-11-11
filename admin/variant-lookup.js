import {canonicalCode} from '../product-identities.js';
import {shadeSuggestion} from '../product-variants.js';
export function mountVariantLookup(row,{request,getCatalog,getProductId}){
 const code=row.querySelector('[data-field=shortCode]'),button=document.createElement('button'),status=document.createElement('small');
 button.type='button';button.className='text-button';button.dataset.variantLookup='';button.textContent=formShade()?'Consultar tonalidade na Trier':'Consultar tamanho na Trier';status.setAttribute('role','status');status.style.gridColumn='1 / -1';row.append(button,status);
 function formShade(){return row.closest('form')?.elements.variantType?.value==='shade';}
 const suggestion=document.createElement('button');suggestion.type='button';suggestion.className='text-button';suggestion.textContent='Usar sugestão de tonalidade';suggestion.hidden=true;row.append(suggestion);let found=null;
 suggestion.onclick=()=>{if(!found||!formShade()||canonicalCode(code.value)!==found.code)return;for(const[key,value]of [['size',found.number],['shadeName',found.name]]){const input=row.querySelector(`[data-field=${key}]`);if(input&&!input.value.trim()&&value)input.value=value;}suggestion.hidden=true;status.textContent+=' Sugestão aplicada apenas nos campos vazios. Confira antes de salvar.';};
 let generation=0;
 code.addEventListener('input',()=>{generation++;found=null;suggestion.hidden=true;status.textContent='Código alterado. Consulte e salve para confirmar o vínculo.';button.disabled=false;});
 async function lookup(){
  const raw=code.value.trim(),key=canonicalCode(raw),ticket=++generation;
  found=null;suggestion.hidden=true;
  if(!/^\d{1,12}$/.test(raw)||Number(raw)<1){status.textContent='Informe o código reduzido desse tamanho (não o EAN).';return;}
  button.disabled=true;status.textContent='Consultando esse código na filial 2…';
  const current=()=>ticket===generation&&row.isConnected&&row.closest('dialog')?.open&&canonicalCode(code.value)===key;
  try{
   const result=await request('registration-preview',{codes:[raw]});if(!current())return;
   const r=result.rows?.[0],age=Date.now()-Date.parse(r?.fetchedAt);
   if(result.rows?.length!==1||canonicalCode(r.shortCode)!==key||r.storeId!=='2'||!Number.isSafeInteger(r.stockQuantity)||!Number.isSafeInteger(r.priceCents)||r.priceCents<=0||!Number.isFinite(age)||age< -60000||age>900000)throw Error('Resposta inválida');
   const size=row.querySelector('[data-field=size]').value;
   const duplicate=getCatalog().products.some(p=>[p,...p.variants].some(v=>canonicalCode(v.shortCode)===key&&(p.id!==getProductId()||v===p||v.size!==size)));
   if(duplicate){status.textContent='Código já usado em outro produto/tamanho. Confira antes de salvar.';return;}
   if(formShade()){found={...shadeSuggestion(r.name),code:key};suggestion.hidden=!found.number&&!found.name;}
   status.textContent=`Trier · filial 2 · ${r.name} · Estoque: ${r.stockQuantity} ${formShade()?'unidade(s)':'pacote(s)'} · Por R$ ${(r.priceCents/100).toFixed(2).replace('.',',')}. Confira tamanho e quantidade da embalagem. Salve e publique; o estoque público usa a sincronização periódica, sem copiar saldos entre tamanhos.`;
  }catch{if(current())status.textContent='Não foi possível consultar. O código e os campos foram preservados; tente novamente.';}
  finally{if(current())button.disabled=false;}
 }
 button.onclick=lookup;code.addEventListener('blur',()=>{if(code.value.trim())lookup();});
}
