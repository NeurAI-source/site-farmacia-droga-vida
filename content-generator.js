// Neur.AI: free, deterministic drafts. Never infer health claims from names or categories.
export const CONTENT_FIELDS = [
  ['description','Descrição completa'],['purpose','Para que serve'],
  ['benefits','Benefícios'],['usage','Modo de uso'],
  ['warnings','Advertências'],['specifications','Características técnicas']
];
const headings = [
  ['purpose',/^(?:para que serve|indicaç(?:ão|ões)|finalidade|indicado para)\s*[:\-–]\s*(.*)$/i],
  ['benefits',/^(?:benefícios|beneficios|vantagens)\s*[:\-–]\s*(.*)$/i],
  ['usage',/^(?:modo de uso|como usar|como utilizar|instruções? de uso|recomendaç(?:ão|ões) de uso)\s*[:\-–]\s*(.*)$/i],
  ['warnings',/^(?:advertências|advertencias|precauções|precaucoes|cuidados|contraindicações|atenção)\s*[:\-–]\s*(.*)$/i],
  ['specifications',/^(?:características técnicas|caracteristicas tecnicas|informações técnicas|informacoes tecnicas|composição|ingredientes)\s*[:\-–]\s*(.*)$/i],
  ['description',/^(?:descrição|descricao|sobre o produto)\s*[:\-–]\s*(.*)$/i]
];
const clean=s=>String(s??'').replace(/\r/g,'').trim().slice(0,2400);
export const needsProfessionalReview=p=>p?.category==='Medicamentos';
export function extractSourceFields(text) {
 const fields={}; let current='';
 for(const raw of String(text||'').slice(0,12000).split('\n')){
  const line=raw.trim(); if(!line)continue;
  const heading=headings.find(([,re])=>re.test(line));
  if(heading){current=heading[0];const m=line.match(heading[1]);fields[current]=clean(m?.[1]||'');continue;}
  if(current&&fields[current].length<2400)fields[current]=clean(fields[current]+'\n'+line);
 }
 return fields;
}
export function draftFromCatalog(p,sourceText='') {
 if(!p||typeof p.name!=='string'||!p.name.trim())throw Error('Produto inválido.');
 const name=clean(p.name), brand=clean(p.brand), presentation=clean(p.detail), category=clean(p.category);
 const parts=[name,brand&&('Marca: '+brand),presentation&&('Apresentação: '+presentation),category&&('Categoria: '+category),p.subcategory&&('Subcategoria: '+clean(p.subcategory)),p.ean&&('EAN: '+clean(p.ean))].filter(Boolean);
 const facts={
  description:`${name}${brand?' — '+brand:''}${presentation?' — '+presentation:''}. Consulte o rótulo e a equipe da Droga Vida Popular para informações adicionais.`,
  purpose:'',benefits:'',usage:'',warnings:'',
  specifications:parts.join('\n')
 };
 const sourced=extractSourceFields(sourceText);
 // Source extraction is verbatim, not validated medical guidance. Reviewer must approve.
 for(const [k,value] of Object.entries(sourced))if(value)facts[k]=value;
 return Object.fromEntries(CONTENT_FIELDS.map(([k])=>[k,clean(facts[k])]));
}
export function mergeDraftContent(existing, proposed, replace=false) {
 const next={...(existing&&typeof existing==='object'?existing:{})};
 for(const [key] of CONTENT_FIELDS) {
   const value=clean(proposed?.[key]);
   if(value&&(replace||!String(next[key]||'').trim()))next[key]=value;
 }
 return next;
}
export function validEvidenceUrl(value){
 try{
  const u=new URL(value);const host=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.username&&!u.password&&!!host&&host!=='localhost'
   && !host.endsWith('.localhost')&&!host.endsWith('.local')&&!host.endsWith('.internal')
   && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)&&!host.includes(':')
   && value.length<=1000;
 }catch{return false;}
}
export function parseEvidence(value){
 return [...new Set(String(value||'').split(/[\s,]+/).map(s=>s.trim()).filter(Boolean))].filter(validEvidenceUrl).slice(0,5);
}
