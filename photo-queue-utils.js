
export const isPhotoPending = p => Boolean(p && (p.imagePending === true || !String(p.imageUrl || '').trim() || p.imageUrl === 'assets/product-pending.svg'));
export const canManageRegistration = role => ['admin','owner'].includes(role);
export const photoKey = (p,v) => `${p.id}:${v?.id||0}`;
export function photoTargets(catalog){
 return (catalog?.products||[]).flatMap(p=>[{key:photoKey(p),productId:p.id,variantId:null,name:p.name,brand:p.brand,detail:p.detail,ean:p.ean,shortCode:p.shortCode,imageUrl:p.imageUrl,pending:isPhotoPending(p)},...(p.variants||[]).map(v=>({key:photoKey(p,v),productId:p.id,variantId:v.id,name:p.name+' · '+[v.size,v.shadeName].filter(Boolean).join(' — '),brand:p.brand,detail:p.detail,ean:v.ean,shortCode:v.shortCode,imageUrl:v.imageUrl,pending:isPhotoPending(v),packageQuantity:v.packageQuantity,size:p.variantType==='shade'?'':v.size,shade:p.variantType==='shade'?v.size:'',fallbackImage:p.imageUrl}))]);
}
export function photoTarget(catalog,key){return photoTargets(catalog).find(t=>t.key===key);}
export function matchPhotoTarget(filename,targets){
 const tokens=new Set((String(filename||'').replace(/\.[^.]+$/,'').match(/\d+/g)||[]).filter(v=>v.length>=3&&v.length<=14));
 const canonical=v=>String(v||'').replace(/^0+/,'');
 const found=targets.filter(t=>(t.ean&&tokens.has(String(t.ean)))||(/^\d{3,12}$/.test(String(t.shortCode||''))&&[...tokens].some(v=>v.length<=12&&canonical(v)===canonical(t.shortCode))));
 return found.length===1?found[0]:null;
}
// A variant filename must never silently become the parent's general photo.
export function matchPhotoFilename(filename,products){return matchPhotoTarget(filename,products.filter(p=>!p.variants?.length));}
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9.+]+/g,' ').trim();
const quantity=s=>{const m=String(s||'').match(/\b(\d+(?:[.,]\d+)?)\s*(ml|kg|mg|g|l)\b/i);if(!m)return null;const u=m[2].toLowerCase();return {amount:Number(m[1].replace(',','.'))*({kg:1000,l:1000,mg:.001}[u]||1),unit:['ml','l'].includes(u)?'volume':'weight'};};
export function photoIdentity(target,candidate){
 if(!/^\d{8,14}$/.test(String(target.ean))||String(target.ean)!==String(candidate.ean))return {blocked:true,confidence:0,reasons:['EAN diferente ou ausente']};
 const reasons=['EAN exato'],missing=[];let blocked=false;
 if(target.brand){const expected=norm(target.brand),actual=norm(candidate.brand);if(!actual)missing.push('marca não confirmada');else if(!(` ${actual} `).includes(` ${expected} `)){reasons.push('Marca divergente');blocked=true;}else reasons.push('Marca compatível');}
 const wanted=quantity(target.detail+' '+target.name),got=quantity(candidate.quantity+' '+candidate.name);
 if(wanted){if(!got)missing.push('apresentação não confirmada');else if(wanted.amount!==got.amount||wanted.unit!==got.unit){reasons.push('Volume/peso divergente');blocked=true;}else reasons.push('Apresentação compatível');}
 if(target.shade){const codes=String(candidate.name||'').match(/\b\d{1,2}[.,]\d{1,3}\+?/g)||[];if(!codes.length)missing.push('tonalidade não confirmada');else if(!codes.map(c=>c.replace(',','.')).includes(String(target.shade).replace(',','.'))){reasons.push('Tonalidade divergente');blocked=true;}else reasons.push('Tonalidade compatível');}
 if(target.size&&/^(RN|P|M|G|XG|XXG|XXXG)$/i.test(target.size)){const sizes=String(candidate.name||'').toUpperCase().match(/\b(RN|P|M|G|XG|XXG|XXXG)\b/g)||[];if(!sizes.length)missing.push('tamanho não confirmado');else if(!sizes.includes(target.size.toUpperCase())){reasons.push('Tamanho divergente');blocked=true;}else reasons.push('Tamanho compatível');}
 if(target.packageQuantity){const m=String(candidate.quantity+' '+candidate.name).match(/\b(\d+)\s*(?:fraldas|unidades|unids?|unds?)\b/i);if(!m)missing.push('quantidade do pacote não confirmada');else if(Number(m[1])!==target.packageQuantity){reasons.push('Quantidade do pacote divergente');blocked=true;}else reasons.push('Quantidade do pacote compatível');}
 return {blocked,confidence:blocked?0:missing.length?70:95,reasons:[...reasons,...missing],needsReview:true};
}
export function photoAuditResult(width,height,error=false){return {broken:!!error,lowResolution:!error&&Math.min(width||0,height||0)<600,width:width||0,height:height||0};}
