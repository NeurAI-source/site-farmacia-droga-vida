// Only recent, validated Trier cache is authoritative. Legacy stockQuantity is
// never presented as live stock, and a missing mapping is not a zero balance.
export const STOCK_MAX_AGE = 60 * 60 * 1000;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function stockState(product, size = '', now = Date.now()) {
  const target = product?.variants?.length ? product.variants.find(v => v.size === size) : product;
  const age = now - Date.parse(target?.trierUpdatedAt);
  const known = Number.isFinite(age) && age >= -60000 && age <= STOCK_MAX_AGE
    && Number.isFinite(target?.stockQuantity) && target.stockQuantity >= 0 && typeof target.trierAvailable === 'boolean';
  if (!known) return { known:false, label:'Consulte a disponibilidade', short:'Consultar', limit:99 };
  const quantity = Math.floor(target.stockQuantity);
  const available = target.trierAvailable && quantity > 0;
  const packages = /fralda|lenço|lenco|\blenc\b/i.test([product.name,product.subcategory].join(' ')) || /^FR\s/i.test(product.name);
  const unit = packages ? (quantity === 1 ? 'pacote' : 'pacotes') : (quantity === 1 ? 'unidade' : 'unidades');
  const restricted = !available && quantity > 0;
  const quantityLabel = available ? `${quantity} ${unit} ${quantity===1?'disponível':'disponíveis'}` : quantity===0 ? 'Esgotado na loja 2' : `${quantity} ${unit} em estoque`;
  const notice = restricted ? 'Pré-pedido indisponível' : '';
  return { known:true, available, restricted, quantity, quantityLabel, notice, limit:available ? Math.min(99,quantity) : 0,
    label:notice ? `${quantityLabel} — ${notice.toLowerCase()}` : quantityLabel,
    short:quantity>0 ? `${quantity} ${packages?'pac.':'un.'}` : 'Esgotado' };
}
export function stockMarkup(product, { now = Date.now(), selectable = false } = {}) {
  const variants = product.variants || [];
  const title = 'Loja 2 — Nature 1. Quantidade na unidade de venda, não no conteúdo da embalagem. Adicionar ao pré-pedido não reserva estoque.';
  if (!variants.length) {
    const state = stockState(product,'',now);
    return `<div class="dv-product-stock ${state.known?(state.available?'is-available':state.restricted?'is-restricted':'is-unavailable'):'is-unknown'}" data-stock-id="${Number(product.id)}" data-stock-selectable="${selectable}" title="${title}"><span class="dv-stock-heading">Estoque · Loja 2</span><span class="dv-stock-single">${esc(state.quantityLabel||state.label)}${state.notice?`<small class="dv-stock-notice">${esc(state.notice)}</small>`:''}</span></div>`;
  }
  return `<div class="dv-product-stock" data-stock-id="${Number(product.id)}" data-stock-selectable="${selectable}" title="${title}"><span class="dv-stock-heading">Estoque por tamanho · Loja 2</span><div class="dv-stock-grid">${variants.map(v => {
    const state=stockState(product,v.size,now), tag=selectable?'button':'span';
    return `<${tag} class="dv-stock-chip ${state.known?(state.available?'is-available':state.restricted?'is-restricted':'is-unavailable'):'is-unknown'}" ${selectable?`type="button" data-stock-product="${Number(product.id)}" data-stock-size="${esc(v.size)}" ${state.known&&!state.available?'disabled':''}`:''} aria-label="${esc(v.size+': '+state.label)}"><strong>${esc(v.size)}</strong><span>${esc(state.short)}</span>${state.notice?`<small class="dv-stock-notice">${esc(state.notice)}</small>`:''}</${tag}>`;
  }).join('')}</div></div>`;
}
export function refreshStockMarkup(products, root = document) {
  root.querySelectorAll('[data-stock-id]').forEach(node=>{
    const p=products.find(p=>p.id===Number(node.dataset.stockId));
    if(p)node.outerHTML=stockMarkup(p,{selectable:node.dataset.stockSelectable==='true'});
  });
}
export function cartStockIssue(cart, products, now = Date.now()) {
  for (const item of cart) {
    const product=products.find(p=>p.id===item.id);
    if (!product) return 'Um produto mudou. Revise seu pré-pedido.';
    const state=stockState(product,item.variant,now);
    if (state.known && item.qty>state.limit) return `Revise ${product.name}${item.variant?' — '+item.variant:''}: ${state.label.toLowerCase()}.`;
  }
  return '';
}
