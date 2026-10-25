import { canonicalCode, identityItems } from './product-identities.js';
import { normalize } from './catalog-utils.js';
import { suggestClassification, ensureClassification } from './admin/category-intelligence.js';
import { commercialBrands, sortCatalogProducts } from './product-order.js';
export const PENDING_IMAGE='assets/product-pending.svg';
export const codeKey=canonicalCode;
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
  let classification=suggestClassification({name:original},categories);
  if(classification.review){
    const terms=[row.group,row.providerCategory].filter(Boolean).map(words),matches=[];
    for(const c of categories)for(const s of c.subcategories||[])if(terms.includes(words(s.name)))matches.push({category:c.name,subcategory:s.name});
    const unique=[...new Map(matches.map(m=>[m.category+'\n'+m.subcategory,m])).values()];
    if(unique.length===1)classification={...unique[0],reason:'Grupo/categoria oficial coincide com uma subcategoria existente'};
  }
  const size=String(row.size||'').trim().slice(0,15)||original.match(/\b(P|M|G|XG|XXG|XXXG|RN|GRANDINHOS)\b/i)?.[1]?.toUpperCase()||(/formula|aptamil|nestogeno|\bnan\b/.test(words(original))&&detail.length<=15?detail:'');
  return {name,brand,detail,size,category:classification.category||'',subcategory:classification.subcategory||'',
    description:row.description||'',confidence:classification.review?'review':'suggested',reason:classification.reason};
}
function similarProductNames(a,b) {
  const expand=s=>words(s).replace(/(\d)(ml|mg|kg|g|l)\b/g,'$1 $2').replace(/\b(sh|shamp|xampu)\b/g,'shampoo').replace(/\b(cond|condic)\b/g,'condicionador').replace(/\b(fr|frd)\b/g,'fralda');
  const x=new Set(expand(a).split(' ').filter(Boolean)),y=new Set(expand(b).split(' ').filter(Boolean));
  if(x.size<2||y.size<2)return words(a)===words(b)&&!!words(a);
  const common=[...x].filter(t=>y.has(t)).length;
  return common>=2&&common/(x.size+y.size-common)>=0.7;
}
export function findDuplicates(candidate,products,excludeId) {
  const matches=[];
  for(const p of products){if(p.id===excludeId)continue;
    for(const item of identityItems(p)){
      const reasons=new Set();
      for(const source of identityItems(candidate)){
        if(source.shortCode&&item.shortCode&&codeKey(source.shortCode)===codeKey(item.shortCode))reasons.add('Código reduzido');
        if(source.ean&&item.ean&&String(source.ean)===String(item.ean))reasons.add('EAN');
        const sourceId=source.trier?.id||source.externalId;
        if(sourceId&&item.trier?.id===sourceId)reasons.add('Identificador Trier');
      }
      if(reasons.size)matches.push({productId:p.id,variantId:item===p?null:item.id,name:p.name,size:item===p?'':item.size,reasons:[...reasons],exact:true});
    }
    const sameBrand=!candidate.brand||!p.brand||words(candidate.brand)===words(p.brand);
    if(!matches.some(m=>m.productId===p.id)&&sameBrand&&similarProductNames(candidate.name,p.name))matches.push({productId:p.id,name:p.name,reasons:['Nome e marca semelhantes'],exact:false});
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
    if(words(sub)==='fraldas'){
      const size=String(choice.size||suggestion.size||'').trim(),quantity=Number(choice.packageQuantity);
      if(!size||size.length>15||!Number.isInteger(quantity)||quantity<1)throw Error(`Informe tamanho e quantidade por pacote da fralda ${r.shortCode}.`);
      p.variants=[{id:variantId++,productId:p.id,size,packageQuantity:quantity,shortCode:r.shortCode,ean:r.ean||'',priceCents:r.priceCents,oldPriceCents:r.regularPriceCents||0,stockQuantity:Math.max(0,r.stockQuantity),sortOrder:0,trier:source}];
      p.shortCode='';p.ean='';const {id:_id,code:_code,...groupSource}=source;p.trier=groupSource;
    }
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
    if(p.variants.some(v=>!v.shortCode||!v.size||!v.packageQuantity||v.trier?.code&&codeKey(v.shortCode)!==codeKey(v.trier.code)))add('variants','Variação incompleta');
    if(findDuplicates(p,catalog.products,p.id).length)add('duplicate','Possível duplicado: confira os identificadores');
    const linked=inventory.filter(r=>r.product_id===p.id);
    const identities=(p.variants.length?p.variants:[p]).filter(v=>/^\d{1,12}$/.test(v.shortCode||''));
    if(identities.some(v=>!linked.some(r=>(r.variant_id||0)===(v===p?0:v.id)&&(!r.trier_reduced_code||codeKey(r.trier_reduced_code)===codeKey(v.shortCode))&&Number.isFinite(Date.parse(r.last_trier_sync_at))&&now-Date.parse(r.last_trier_sync_at)<=3600000)))add('sync','Sincronização ausente, antiga ou apresentação sem vínculo');
    if(linked.some(r=>r.external_status==='invalid'||r.external_status==='error'))add('sync-error','Falha no item sincronizado: conferir integração');
    return issues.length?[{id:p.id,name:p.name,issues,suggestion:suggestRegistration(p,catalog.categories,catalog.products.map(p=>p.brand))}]:[];
  });
}
export function sortRegistrationProducts(products,by='brand') {
  return sortCatalogProducts(products,by);
}
