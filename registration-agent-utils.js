import {suggestRegistration,findDuplicates} from './registration-utils.js';
export function parseRegistrationCommand(text,count=30){
 const s=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const numbers=s.match(/\b\d+\b/g)||[];if(numbers.length>1)throw Error('Informe uma quantidade por operação.');
 const amount=numbers.length?Number(numbers[0]):Number(count);if(![10,30,50,100].includes(amount))throw Error('Escolha 10, 30, 50 ou 100 produtos.');
 if(/foto|imagem/.test(s)&&/localiz|encontr|busc/.test(s))return {action:'photos',count:amount};
 if(/import|prepar|busc/.test(s)&&/produto|perfumaria/.test(s))return {action:'products',count:amount};
 throw Error('Use “Preparar 50 produtos de perfumaria” ou “Localizar fotos dos produtos pendentes”.');
}
export function isPerfumery(row,categories){
 const s=suggestRegistration(row,categories),cat=String(s.category).toLowerCase();
 if(/medic|anticoncep|antibiot|psicotrop|formula|suplement|vitamina/i.test([row.name,s.subcategory,row.group].join(' ')))return false;
 return /cabelos|beleza|higiene|cosmet/.test(cat)||/infantil/i.test(cat)&&/fralda|higiene|chupeta|mamadeira|colonia|talco|hidratante/i.test(s.subcategory);
}
export async function collectAgentProducts({count,catalog,lookup,onProgress=()=>{},cancelled=()=>false}){
 if(![10,30,50,100].includes(count))throw Error('Quantidade inválida.');
 const rows=[],seen=new Set();let offset=0,scanned=0,duplicates=0,excluded=0,pages=0;
 while(rows.length<count&&scanned<2000&&pages++<40){
  if(cancelled())return {rows,scanned,duplicates,excluded,cancelled:true};
  const page=await lookup({mode:'browse',query:'',offset,activeOnly:true});if(page.stale)throw Error('A Trier retornou cache antigo. Tente novamente antes de importar.');
  if(!Array.isArray(page.rows)||!Number.isSafeInteger(page.nextOffset)||page.nextOffset<offset)throw Error('Paginação inválida da Trier.');
  if(page.rows.length>50)throw Error('Página maior que o limite da integração.');
  for(const r of page.rows){scanned++;if(!r.shortCode||seen.has(r.shortCode))continue;seen.add(r.shortCode);if(!r.active||!isPerfumery(r,catalog.categories)){excluded++;continue;}if(findDuplicates(r,catalog.products).some(d=>d.exact)){duplicates++;continue;}rows.push(r);if(rows.length===count||scanned===2000)break;}
  onProgress({scanned,found:rows.length,duplicates,excluded});
  if(!page.hasMore)break;if(page.nextOffset<=offset)throw Error('A paginação não avançou.');offset=page.nextOffset;
 }
 return {rows,scanned,duplicates,excluded,cancelled:cancelled()};
}
