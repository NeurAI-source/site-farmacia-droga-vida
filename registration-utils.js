import { normalize } from './catalog-utils.js';
import { suggestClassification, ensureClassification } from './admin/category-intelligence.js';
import { commercialBrands, orderProductsByBrand } from './product-order.js';
export const PENDING_IMAGE='assets/product-pending.svg';
export const codeKey=v=>/^\d+$/.test(String(v||''))?String(Number(v)):String(v||'').trim().toUpperCase();
const words=v=>normalize(v||'').replace(/[^a-z0-9]+/g,' ').trim();
export function suggestRegistration(row,categories,brands=[]) {
  const original=String(row.name||'').trim(), text=` ${words(original)} `;
  const found=[...commercialBrands,...brands.filter(Boolean).map(b=>[b])].filter(aliases=>aliases.some(b=>text.includes(` ${words(b)} `))).map(a=>a[0]);
  const distinct=[...new Map(found.map(b=>[words(b),b])).values()];
  const brand=distinct.length===1?distinct[0]:'';
  const units=original.match(/\b(\d+(?:[.,]\d+)?)\s*(ML|KG|MG|G|L|CAPSULAS?|CAPS?|CP|COMP(?:RIMIDOS?)?|UN(?:IDADES?)?)\b/i);
  const unit=units?.[2]?.toUpperCase(), labels={ML:'mL',KG:'kg',MG:'mg',G:'g',L:'L',CP:'comprimidos',COMP:'comprimidos',CAP:'cápsulas',CAPS:'cápsulas',UN:'unidades'};
  const detail=units?`${units[1]} ${labels[unit]||unit.toLocaleLowerCase('pt-BR')}`:'';
  let name=original.toLocaleLowerCase('pt-BR').replace(/(^|\s)(\p{L})/gu,(_,s,c)=>s+c.toLocaleUpperCase('pt-BR'));
  if(units)name=name.replace(new RegExp(units[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),detail);
  const classification=suggestClassification({name:original},categories);
  const size=original.match(/\b(P|M|G|XG|XXG|XXXG|RN|GRANDINHOS)\b/i)?.[1]?.toUpperCase()||'';
  return {name,brand,detail,size,category:classification.category||'',subcategory:classification.subcategory||'',
    description:row.description||'',confidence:classification.review?'review':'suggested',reason:classification.reason};
}
export function findDuplicates(candidate,products,excludeId) {
  const matches=[];
  for(const p of products){if(p.id===excludeId)continue;
    for(const v of [null,...(p.variants||[])]){
      const item=v||p, code=item.shortCode,ean=item.ean||(v?'':p.ean);
      const reasons=[];
      if(candidate.shortCode&&code&&codeKey(candidate.shortCode)===codeKey(code))reasons.push('Código reduzido');
      if(candidate.ean&&ean&&String(candidate.ean)===String(ean))reasons.push('EAN');
      if(candidate.trier?.id&&item.trier?.id===candidate.trier.id)reasons.push('Identificador Trier');
      if(reasons.length)matches.push({productId:p.id,variantId:v?.id||null,name:p.name,size:v?.size||'',reasons,exact:true});
    }
    if(!matches.some(m=>m.productId===p.id)&&words(candidate.name)===words(p.name)&&(!candidate.brand||!p.brand||words(candidate.brand)===words(p.brand)))matches.push({productId:p.id,name:p.name,reasons:['Nome e marca semelhantes'],exact:false});
  }
  return matches;
}
export function buildRegistration(catalog,rows,choices,now=new Date().toISOString()) {
  const next=structuredClone(catalog),report=[];let nextId=Math.max(0,...next.products.map(p=>p.id))+1;
  let variantId=Math.max(0,...next.products.flatMap(p=>(p.variants||[]).map(v=>v.id)))+1;
  const seen=new Set();
  for(const choice of choices){
    const r=rows.find(r=>codeKey(r.shortCode)===codeKey(choice.code));
    if(!r||seen.has(codeKey(r.shortCode)))throw Error('Seleção inválida ou repetida.');seen.add(codeKey(r.shortCode));
    if(choice.mode==='skip'){report.push({code:r.shortCode,status:'ignored'});continue;}
    if(!Number.isSafeInteger(r.priceCents)||r.priceCents<=0)throw Error(`Preço indisponível para ${r.shortCode}. Revise antes de importar.`);
    const suggestion=suggestRegistration(r,next.categories,next.products.map(p=>p.brand));
    const candidate={name:r.name,shortCode:r.shortCode,ean:r.ean||'',trier:{id:r.externalId||r.shortCode}};
    const duplicates=findDuplicates(candidate,next.products);
    const exact=duplicates.filter(d=>d.exact);
    const source={id:r.externalId||r.shortCode,code:r.shortCode,storeId:'2',syncedAt:r.fetchedAt,active:r.active,sourceName:r.name,stockQuantity:r.stockQuantity,priceCents:r.priceCents,regularPriceCents:r.regularPriceCents||null};
    if(choice.mode==='update'){
      const p=next.products.find(p=>p.id===Number(choice.productId));
      if(!p||!exact.some(d=>d.productId===p.id&&((d.variantId||0)===(Number(choice.variantId)||0))))throw Error('Confirme o vínculo exato antes de atualizar.');
      const target=choice.variantId?p.variants.find(v=>v.id===Number(choice.variantId)):p;
      // Source metadata may update, commercial/editorial fields remain opt-in.
      target.trier=source;
      if(choice.updateCommercial===true){target.priceCents=r.priceCents;target.oldPriceCents=r.regularPriceCents||0;target.stockQuantity=Math.max(0,r.stockQuantity);}
      p.updatedAt=now;report.push({code:r.shortCode,status:'updated',productId:p.id});continue;
    }
    if(exact.length)throw Error(`Código/EAN ${r.shortCode} já cadastrado. Edite ou atualize o vínculo existente.`);
    if(duplicates.length&&choice.confirmSeparate!==true)throw Error('Confirme que os produtos com nomes semelhantes são diferentes.');
    if(choice.mode==='variant'){
      const p=next.products.find(p=>p.id===Number(choice.productId));const size=String(choice.size||'').trim(),quantity=Number(choice.packageQuantity);
      if(!p||!size||size.length>15||!Number.isInteger(quantity)||quantity<1||p.variants.some(v=>words(v.size)===words(size)))throw Error('Confira produto, tamanho e quantidade por pacote da variante.');
      if(!p.variants.length&&p.shortCode)throw Error('O código principal precisa ser convertido manualmente em variante antes de vincular outro tamanho.');
      p.variants.push({id:variantId++,productId:p.id,size,packageQuantity:quantity,shortCode:r.shortCode,ean:r.ean||'',priceCents:r.priceCents,oldPriceCents:r.regularPriceCents||0,stockQuantity:Math.max(0,r.stockQuantity),sortOrder:p.variants.length,trier:source});
      p.updatedAt=now;report.push({code:r.shortCode,status:'variant',productId:p.id});continue;
    }
    if(choice.mode!=='new')throw Error('Escolha importar, atualizar, vincular variante ou ignorar.');
    const category=String(choice.category||suggestion.category||'').trim(),subcategory=String(choice.subcategory||suggestion.subcategory||'').trim();
    if(!category||category.length>160||subcategory.length>160)throw Error(`Revise a categoria de ${r.shortCode}.`);
    // Use equivalent existing names rather than create duplicates.
    const existing=next.categories.find(c=>words(c.name)===words(category));
    const cat=existing?.name||category;const sub=existing?.subcategories.find(s=>words(s.name)===words(subcategory))?.name||subcategory;
    ensureClassification(next,cat,sub);
    const p={id:nextId++,name:String(choice.name||suggestion.name||r.name).trim(),shortCode:r.shortCode,ean:r.ean||'',brand:String(choice.brand??suggestion.brand),detail:String(choice.detail??suggestion.detail),category:cat,subcategory:sub,imageUrl:PENDING_IMAGE,imagePending:true,
      priceCents:r.priceCents,oldPriceCents:r.regularPriceCents||0,stockQuantity:Math.max(0,r.stockQuantity),badge:'',active:false,featured:false,availableStore1:false,availableStore2:true,variants:[],tone:'amber',sortOrder:next.products.length,createdAt:now,updatedAt:now,trier:source,
      classification:{locked:true,source:'reviewed'},registration:{pending:true,source:'trier'},...(r.description?{content:{description:r.description.slice(0,2400)}}:{})};
    next.products.push(p);report.push({code:r.shortCode,status:'created',productId:p.id});
  }
  return {catalog:next,report};
}
export function reviewRegistration(catalog,inventory=[],now=Date.now()) {
  return catalog.products.flatMap(p=>{
    const issues=[];const add=(key,label)=>{if(!p.reviewIgnores?.some(i=>i.key===key&&i.fingerprint===JSON.stringify([p.name,p.brand,p.category,p.subcategory,p.imageUrl,p.shortCode,p.ean,p.variants])))issues.push({key,label});};
    if(p.imagePending||!p.imageUrl||p.imageUrl===PENDING_IMAGE)add('image','Pendente de foto real');
    if(!p.category||!p.subcategory)add('category','Categoria ou subcategoria incompleta');
    const proposed=suggestRegistration(p,catalog.categories,catalog.products.map(p=>p.brand));
    if(!p.brand||proposed.brand&&words(proposed.brand)!==words(p.brand))add('brand','Marca para revisar');if(!p.detail)add('detail','Apresentação incompleta');
    for(const v of p.variants.length?p.variants:[p])if(!/^\d{1,12}$/.test(v.shortCode||''))add('code','Código Trier ausente ou inválido');
    if(p.variants.some(v=>!v.shortCode||!v.size||!v.packageQuantity))add('variants','Variação incompleta');
    if(findDuplicates(p,catalog.products,p.id).length)add('duplicate','Possível duplicado: confira os identificadores');
    const linked=inventory.filter(r=>r.product_id===p.id);
    if(p.trier&&(!linked.length||linked.some(r=>!r.last_trier_sync_at||now-Date.parse(r.last_trier_sync_at)>3600000)))add('sync','Sincronização ausente ou antiga');
    return issues.length?[{id:p.id,name:p.name,issues,suggestion:suggestRegistration(p,catalog.categories,catalog.products.map(p=>p.brand))}]:[];
  });
}
export function sortRegistrationProducts(products,by='brand') {
  if(by==='brand')return orderProductsByBrand(products);
  return [...products].sort((a,b)=>by==='price'?a.priceCents-b.priceCents:by==='createdAt'||by==='updatedAt'?String(b[by]||'').localeCompare(String(a[by]||'')):String(a[by]||'').localeCompare(String(b[by]||''),'pt-BR',{numeric:true,sensitivity:'base'}));
}
