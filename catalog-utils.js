export const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function priceInfo(product,size=''){
 const variants=product.variants||[];
 const target=variants.length?(size?variants.find(v=>v.size===size):variants.reduce((best,v)=>unitPrice(product,v.size)<unitPrice(product,best.size)?v:best)):product;
 const priceCents=unitPrice(product,target?.size||'');
 const oldPriceCents=Number.isSafeInteger(target?.oldPriceCents)&&target.oldPriceCents>priceCents?target.oldPriceCents:null;
 return {priceCents,oldPriceCents,from:!!variants.length&&!size,discount:oldPriceCents?Math.round((1-priceCents/oldPriceCents)*100):0};
}
export function priceHtml(product,size=''){
 const info=priceInfo(product,size);
  return `${info.from?'<small>A partir de</small>':''}${info.oldPriceCents?`<small class="price-before">De: <del aria-label="Preço normal">${money(info.oldPriceCents)}</del></small>`:''}<strong>${info.oldPriceCents?'Por: ':''}${money(info.priceCents)}</strong>`;
}
export const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function filterProducts(products, { category = 'Todos', subcategory = '', query = '', favorites = null } = {}) {
  return products.filter(p => p.active && (category === 'Todos' || p.category === category) && (!subcategory || p.subcategory === subcategory) && (!favorites || favorites.includes(p.id)) && normalize([p.name,p.brand,p.detail,p.category,p.subcategory].join(' ')).includes(normalize(query.trim())));
}
export function sanitizeCart(value, products) {
  if (!Array.isArray(value)) return [];
  const merged = new Map();
  for (const item of value) {
    if (!item || !Number.isInteger(item.qty) || item.qty < 1) continue;
    const product = products.find(p => p.id === item.id && p.active);
    if (!product) continue;
    const variant = item.variant || '';
    if (product.variants.length ? !product.variants.some(v => v.size === variant) : variant !== '') continue;
    const key = `${product.id}:${variant}`;
    merged.set(key, { id: product.id, variant, qty: Math.min(99, (merged.get(key)?.qty || 0) + item.qty) });
  }
  return [...merged.values()];
}
export function unitPrice(product, variantSize = '') {
  const variant = variantSize ? product.variants?.find(v => v.size === variantSize) : null;
  return variant?.priceCents ?? product.priceCents;
}
export function cartTotal(cart, products) {
  return cart.reduce((sum, item) => {
    const product = products.find(p => p.id === item.id);
    return sum + unitPrice(product, item.variant) * item.qty;
  }, 0);
}
export function orderMessage(cart, products, customer = {}) {
  const delivery = customer.receipt !== 'retirada';
  const name = String(customer.name || '').trim();
  const neighborhood = String(customer.neighborhood || '').trim();
  const items = cart.map((item, index) => {
    const p = products.find(p => p.id === item.id);
    const v = p.variants.find(v => v.size === item.variant);
    const code = String((v ? v.shortCode : p.shortCode) ?? '').trim();
    const packages = !!v || /fralda|lenço|lenco|\blenc\b/i.test([p.name,p.subcategory].join(' ')) || /^FR\s/i.test(p.name);
    const unit = packages ? (item.qty === 1 ? 'pacote' : 'pacotes') : (item.qty === 1 ? 'unidade' : 'unidades');
    return [
      `${String(index + 1).padStart(2, '0')} | ${p.name}`,
      ...(v ? [`Tamanho: ${v.size} | Pacote: ${v.packageQuantity} ${p.subcategory === 'Fraldas' ? 'fraldas' : 'unidades'}`] : []),
      `Quantidade: ${item.qty} ${unit}`,
      ...(code ? [`Código: ${code}`] : []),
      `Valor: ${money(unitPrice(p, item.variant) * item.qty)}`,
    ].join('\n');
  }).join('\n\n');
  return [
    '🛒 PRÉ-PEDIDO | DROGA VIDA POPULAR',
    'Olá! Vim pelo site da Droga Vida Popular e gostaria de consultar meu pré-pedido.',
    `👤 DADOS DO CLIENTE\nNome: ${name}${delivery ? '\n📍 Bairro de entrega: ' + neighborhood : ''}`,
    `📦 PRODUTOS SOLICITADOS\n\n${items}`,
    `💰 RESUMO DO PRÉ-PEDIDO\nSubtotal: ${money(cartTotal(cart, products))}\n${delivery ? '🚚 Recebimento: Entrega\nTaxa de entrega: A consultar' : '🏪 Recebimento: Retirada na loja 2 — Nature 1'}`,
    delivery ? '✅ Poderiam confirmar o valor total com a entrega?' : '✅ Poderiam confirmar o valor total para retirada?',
    'Obrigado!',
  ].join('\n\n');
}
