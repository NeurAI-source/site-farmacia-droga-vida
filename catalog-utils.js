export const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
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
  return 'Olá, vim pelo site da Droga Vida Popular e gostaria de consultar este PRÉ-PEDIDO:\n' +
    'Nome: ' + name + (delivery ? '\nBairro para entrega: ' + neighborhood : '') + '\n\n' + cart.map(item => {
      const p = products.find(p => p.id === item.id);
      const v = p.variants.find(v => v.size === item.variant);
      return '· ' + item.qty + 'x ' + p.name + (v ? ' — tamanho ' + v.size + ', pacote com ' + v.packageQuantity + (p.subcategory === 'Fraldas' ? ' fraldas' : ' unidades') : '') + ' — ' + money(unitPrice(p, item.variant) * item.qty);
    }).join('\n') + '\n\nSubtotal estimado dos produtos: ' + money(cartTotal(cart, products)) +
    '\nForma de recebimento: ' + (delivery ? 'entrega.' : 'retirada na loja.') +
    (delivery ? '\nTaxa de entrega: consultar com os atendentes.' : '') +
    '\n\nOs produtos estão sujeitos à disponibilidade em estoque.\nPodem confirmar a disponibilidade, por favor?';
}
