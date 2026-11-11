// Keep the existing variant key (size) stable for cart, ERP bindings and history.
export const isShade = p => p?.variantType === 'shade';
export const variantLabel = (p,v) => isShade(p) ? [v.size,v.shadeName].filter(Boolean).join(' — ') : v.size;
export const variantPrompt = p => isShade(p) ? 'Escolha a tonalidade' : 'Escolha o tamanho';
// Suggest only information explicitly present in the official product name.
// No color hex, guessed shade names or changes to already filled inputs.
export function shadeSuggestion(name=''){
 const text=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const numbers=[...new Set([...text.matchAll(/\b\d{1,2}[.,]\d{1,3}\b/g)].map(m=>m[0].replace(',','.')))];
 const colors=[...new Set([...text.matchAll(/\b(?:LOIRO|LOURO|CASTANHO|PRETO|CHOCOLATE|RUIVO|VERMELHO|ACAJU|MARSALA)(?:\s+(?:CLARO|ESCURO|MEDIO|INTENSO|ULTRACLARO|EXTRACLARO|NATURAL|ACOBREADO|DOURADO|ACINZENTADO|PEROLADO|AZULADO|PROFUNDO|IRISADO|PLATINADO)){0,4}\b/g)].map(m=>m[0]))];
 return {number:numbers.length===1?numbers[0]:'',name:colors.length===1?colors[0]:''};
}
export const variantImage = (p,key='') => {
 const value=p?.variants?.find(v=>v.size===key)?.imageUrl;
 return typeof value==='string'&&(/^https:\/\/[^\s<>"']+$/.test(value)||/^assets\/[\w./-]+\.(png|jpe?g|webp|svg)$/i.test(value)&&!value.includes('..')) ? value : p.imageUrl;
};
