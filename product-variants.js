// Keep the existing variant key (size) stable for cart, ERP bindings and history.
export const isShade = p => p?.variantType === 'shade';
export const variantLabel = (p,v) => isShade(p) ? [v.size,v.shadeName].filter(Boolean).join(' — ') : v.size;
export const variantPrompt = p => isShade(p) ? 'Escolha a tonalidade' : 'Escolha o tamanho';
export const variantImage = (p,key='') => {
 const value=p?.variants?.find(v=>v.size===key)?.imageUrl;
 return typeof value==='string'&&(/^https:\/\/[^\s<>"']+$/.test(value)||/^assets\/[\w./-]+\.(png|jpe?g|webp|svg)$/i.test(value)&&!value.includes('..')) ? value : p.imageUrl;
};
