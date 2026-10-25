import { normalize } from '../catalog-utils.js';

// Explicit product terms only: brands alone never decide a classification.
export const taxonomy = [
  ['Higiene e cuidados pessoais', ['Absorventes e protetores diários','Higiene íntima','Sabonetes','Desodorantes','Higiene bucal','Depilação']],
  ['Beleza e cosméticos', ['Esmaltes','Removedores de esmalte','Cuidados com as unhas','Maquiagem','Cuidados com o rosto']],
  ['Cabelos', ['Shampoos e condicionadores','Máscaras e tratamentos','Cremes de pentear','Óleos capilares','Coloração']],
  ['Área Infantil', ['Fraldas','Lenços umedecidos','Higiene infantil','Mamadeiras e acessórios','Chupetas','Fórmulas infantis']],
  ['Cuidados adultos', ['Fraldas geriátricas','Incontinência','Cuidados com a pele']],
  ['Suplementos', ['Vitaminas e minerais','Polivitamínicos','Nutrição esportiva','Colágenos','Ômega e ácidos graxos','Cabelo, pele e unhas','Melatonina']],
  ['Medicamentos', []],
  ['Saúde e Bem-estar', ['Curativos','Antissépticos','Aparelhos de saúde','Máscaras e acessórios']]
];
const rules = [
  [1,1,/\b(removedor de esmalte|acetona)\b/],
  [1,0,/\b(esmalte|esm)\b/],
  [4,0,/\bfraldas?\b.*\b(geriatrica|adult[oa]|incontinencia)\b|\b(geriatrica|adult[oa])\b.*\bfraldas?\b/],
  [4,1,/\b(absorvente|protetor)\b.*\bincontinencia\b/],
  [0,0,/\b(absorventes?|abs|protetor diario|protetores diarios)\b/],
  [0,1,/\b(sabonete|higiene)\b.*\bintim[oa]\b/],
  [3,1,/\b(lenco|lencos|lenc)\b.*\b(umedecido|umedecidos|umid|um)\b/],
  [3,0,/\bfraldas?\b|\bfr\b.*\b(babysec|pampers|huggies|pom pom|toquinho)\b/],
  [3,5,/\b(formula infantil|formulas infantis|aptamil|nan|nestogeno)\b.*\b(\d+\s*g|gramas?)\b/],
  [3,3,/\bmamadeiras?\b/], [3,4,/\bchupetas?\b/],
  [0,2,/\bsabonetes?\b/], [0,3,/\b(desodorante|desodorantes|des)\b/],
  [0,4,/\b(creme dental|pasta dental|escova dental|fio dental|enxaguante bucal)\b/],
  [0,5,/\b(depilatorio|depilatoria|lamina de barbear|aparelho de barbear)\b/],
  [2,0,/\b(shampoo|xampu|condicionador)\b/],
  [2,1,/\b(mascara capilar|tratamento capilar)\b/],
  [2,2,/\b(creme de pentear|creme para pentear|leave in)\b/],
  [2,3,/\b(oleo capilar|serum capilar)\b/],
  [2,4,/\b(tintura|tonalizante|coloracao capilar)\b/],
  [1,3,/\b(batom|rimel|mascara de cilios|base facial|po compacto)\b/],
  [7,0,/\b(curativo|curativos|gaze|esparadrapo|atadura)\b/],
  [7,1,/\b(antisseptico|antissepticos)\b/],
  [7,2,/\b(termometro|aparelho de pressao|oximetro)\b/],
  [5,6,/\b(melatonina|melatonin)\b/],
  [5,3,/\b(colageno|colagenos|colag)\b/],
  [5,4,/\bomega\s*(3|6|9)\b|\boleo de peixe\b/],
  [5,2,/\b(whey|creatina|bcaa|glutamina)\b/],
  [5,1,/\b(polivitaminico|polivitaminicos|multivitaminico|multivitaminicos)\b/],
  [5,0,/\b(vitamina|vit)\s*[abcdek](?:\d{1,2})?\b|\bvitaminas e minerais\b|\b(magnesio|zinco|selenio|calcio)\b.*\b(caps?|capsulas?|cp|comp|comprimidos?|gomas?)\b/],
  [5,5,/\b(biotina|suplemento para cabelo|suplemento para cabelos)\b/]
];
const categoryAliases = new Map([
  ['shampoo','shampoos'],['condicionador','condicionadores'],
  ['formula infantil','formulas infantis'],['formulas','formulas infantis'],
  ['lenco umedecido','lencos umedecidos'],['fralda','fraldas'],
  ['oleo capilar','oleos capilares'],['colageno','colagenos'],
  ['melatoninas','melatonina'],['melatonin','melatonina'],
  ['vitaminas','vitaminas e minerais'],['polivitaminico','polivitaminicos']
]);
const equivalent = value => { const key=normalize(value||'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();return categoryAliases.get(key)||key; };
const same = (a,b) => equivalent(a)===equivalent(b);
export const classificationOf = p => ({category:p.category||'',subcategory:p.subcategory||'',classification:p.classification||null});
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
export function suggestClassification(product, categories) {
  const text = normalize(product.name || '').replace(/\b(sh|shamp)\b/g,'shampoo').replace(/\b(cond|condic)\b/g,'condicionador').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(/\b(kit|combo)\b/.test(text))return {review:true,reason:'Kit ou combo: confira a classificação manualmente.'};
  // More specific rules above absorb their broad counterparts. Independent
  // matches (e.g. a kit containing soap and shampoo) require human review.
  // Ingredients in cosmetics (e.g. collagen shampoo or vitamin C face serum)
  // do not identify an oral supplement. Never classify by Lavitan/Cimed alone.
  const topical=/\b(creme|serum|shampoo|xampu|condicionador|mascara|locao|sabonete|esmalte|capilar|facial|pomada|protetor solar|hidratante|dental|bucal|uso externo)\b/.test(text);
  // Verified product-line aliases, never the brand alone. Keep these narrow:
  // COL HID is ambiguous without the Lavitan line and an oral presentation.
  const oral=/\b(?:\d+\s*(?:g|mg|ml|cp|caps?|comprimidos?)|comprimidos?|capsulas?)\b/.test(text);
  const lineMatches=[];
  if(!topical&&oral){
    if(/\blavitan\s+col\s+hid\b/.test(text))lineMatches.push([5,3]);
    if(/\blavitan\s+(?:az|a z)\s+original\b/.test(text))lineMatches.push([5,1]);
    if(/\blavitan\s+memo\s+neuro\b/.test(text))lineMatches.push([5,0]);
  }
  const matches=[...lineMatches,...rules.filter(([c, ,pattern])=>!(c===5&&topical)&&pattern.test(text))];
  const specific=matches.filter(([c,s])=>!(c===0&&s===2&&matches.some(([a,b])=>a===0&&b===1))
    && !(c===1&&s===0&&matches.some(([a,b])=>a===1&&b===1))
    && !(c===3&&s===0&&matches.some(([a])=>a===4))
    && !(c===0&&s===0&&matches.some(([a])=>a===4))
    && !(c===5&&s===0&&matches.some(([a,b])=>a===5&&b!==0)));
  const unique=[...new Map(specific.map(([c,s])=>[`${c}:${s}`,[c,s]])).values()];
  if(unique.length!==1)return {review:true,reason:unique.length?'Produto com mais de uma classificação possível.':'Sem regra confiável. Revise manualmente.'};
  const [ci,si]=unique[0], [canonical,subs]=taxonomy[ci];
  // Keep the store's existing equivalent category whenever possible.
  const aliases=ci===0||ci===1?['Perfumaria e Cuidados Pessoais']:ci===2?['Perfumaria e Cuidados Pessoais']:[];
  const existing=categories.find(c=>same(c.name,canonical))||categories.find(c=>aliases.some(a=>same(c.name,a)));
  const category=existing?.name||canonical;
  const specificSub=ci===2&&si===0 ? (/\b(shampoo|xampu)\b/.test(text)&&!/\bcondicionador\b/.test(text)?'shampoos':/\bcondicionador\b/.test(text)&&!/\b(shampoo|xampu)\b/.test(text)?'condicionadores':'') : '';
  const subcategory=existing?.subcategories.find(s=>same(s.name,subs[si]))?.name||existing?.subcategories.find(s=>specificSub&&same(s.name,specificSub))?.name||subs[si];
  return {category,subcategory,reason:'Termo explícito no nome do produto',ruleVersion:2};
}
export function ensureClassification(catalog, category, subcategory) {
  let c=catalog.categories.find(c=>same(c.name,category));
  if(!c){c={id:Math.max(0,...catalog.categories.map(c=>Number(c.id)||0))+1,name:category,icon:'⊞',active:true,sortOrder:catalog.categories.length*10+10,subcategories:[]};catalog.categories.push(c);}
  if(subcategory&&!c.subcategories.some(s=>same(s.name,subcategory))){const id=Math.max(0,...catalog.categories.flatMap(c=>c.subcategories.map(s=>Number(s.id)||0)))+1;c.subcategories.push({id,categoryId:c.id,name:subcategory,active:true,sortOrder:c.subcategories.length*10+10});}
  return c;
}
export function completeTaxonomy(catalog) {
  const next=structuredClone(catalog);
  for(const [name,subs] of taxonomy){ensureClassification(next,name,'');for(const sub of subs)ensureClassification(next,name,sub);}
  return next;
}
export function classificationReview(catalog) {
  return catalog.products.flatMap(p=>{
    const suggestion=suggestClassification(p,catalog.categories);
    if(!suggestion.review&&same(p.category,suggestion.category)&&same(p.subcategory,suggestion.subcategory))return [];
    return [{id:p.id,name:p.name,before:classificationOf(p),...suggestion,locked:p.classification?.locked===true,
      automatic:!suggestion.review&&!p.classification?.locked&&!p.subcategory&&same(p.category,suggestion.category)}];
  });
}
export function applyClassifications(catalog, rows, mode='reviewed') {
  const next=structuredClone(catalog), seen=new Set();
  for(const row of rows){
    const p=next.products.find(p=>p.id===row.id);
    if(!p||seen.has(row.id)||row.review||row.locked||!row.category||!row.subcategory||canonical(classificationOf(p))!==canonical(row.before))throw Error('O cadastro mudou ou está protegido. Analise novamente.');
    if(mode==='automatic'&&!row.automatic)throw Error('Esta alteração exige revisão.');
    ensureClassification(next,row.category,row.subcategory);
    p.category=row.category;p.subcategory=row.subcategory;
    p.classification={locked:mode!=='automatic',source:mode,ruleVersion:row.ruleVersion||1};
    seen.add(row.id);
  }
  return next;
}
export function fillMissingClassifications(catalog) {
  if(catalog.categoryIntelligence?.automatic!==true)return catalog;
  const rows=classificationReview(catalog).filter(r=>r.automatic);
  return rows.length?applyClassifications(catalog,rows,'automatic'):catalog;
}
export function restoreClassifications(catalog, changes) {
  const next=structuredClone(catalog);
  for(const row of changes){const p=next.products.find(p=>p.id===row.id);
    if(!p||!row.before.category||canonical(classificationOf(p))!==canonical(row.after))throw Error('Há alterações posteriores ou o produto é novo. Revise o produto antes de desfazer.');
    ensureClassification(next,row.before.category,row.before.subcategory);
    p.category=row.before.category;p.subcategory=row.before.subcategory;
    // A recovery is a deliberate choice, protected against the next auto pass.
    p.classification={...(row.before.classification||{}),locked:true,source:'restored'};
  }
  return next;
}
