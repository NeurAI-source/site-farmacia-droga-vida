import { money, unitPrice } from './catalog-utils.js';
export const productEscape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const imageUrl = s => /^(https:\/\/|assets\/|\.\.\/assets\/)/.test(String(s||'')) ? String(s) : 'assets/logo.png';
export function productDetailMarkup(p) {
  const esc=productEscape, c=p.content||{}, variants=p.variants||[];
  const prices=variants.map(v=>unitPrice(p,v.size));
  const display=prices.length ? Math.min(...prices):p.priceCents;
  const sections=[
    ['Descrição completa',c.description],
    ['Para que serve',c.purpose],
    ['Benefícios',c.benefits],
    ['Modo de uso',c.usage],
    ['Advertências',c.warnings],
    ['Características técnicas',c.specifications]
  ].filter(([,body])=>typeof body==='string'&&body.trim());
  return `<div class="product-page">
    <div class="product-page-breadcrumb">${esc(p.category)}${p.subcategory?' › '+esc(p.subcategory):''} › ${esc(p.name)}</div>
    <div class="product-page-grid">
      <div class="product-page-media"><img src="${esc(imageUrl(p.imageUrl))}" alt="${esc(p.name)}" loading="eager"></div>
      <section class="product-page-summary" aria-label="Informações do produto">
        <p class="product-page-brand">${esc(p.brand||p.category)}</p>
        <h1>${esc(p.name)}</h1>
        ${p.detail?`<p class="product-page-presentation">${esc(p.detail)}</p>`:''}
        <p class="product-page-codes">${p.shortCode?`Código: ${esc(p.shortCode)}`:''}${p.shortCode&&p.ean?' · ':''}${p.ean?`EAN: ${esc(p.ean)}`:''}</p>
        <div class="product-page-price" id="product-page-price">${variants.length?'<small>A partir de</small>':''}<strong>${money(display)}</strong></div>
        <p class="product-page-warning">Preço, disponibilidade e taxa de entrega sujeitos à confirmação com a equipe.</p>
        ${variants.length?`<label class="product-page-variant-label" for="product-page-variant">Escolha o tamanho / apresentação <select id="product-page-variant"><option value="">Selecione uma opção</option>${variants.map(v=>`<option value="${esc(v.size)}">${esc(v.size)} — ${v.packageQuantity} unidades — ${money(unitPrice(p,v.size))}</option>`).join('')}</select></label>`:''}
        <div class="product-page-actions"><button type="button" id="product-page-add">Adicionar ao pré-pedido</button><button type="button" id="product-page-favorite" aria-label="Adicionar aos favoritos">♡ Favoritar</button><button type="button" id="product-page-share">Compartilhar</button></div>
        <p id="product-page-feedback" role="status" aria-live="polite"></p>
        <a class="product-page-view-cart" href="./?prePedido=1">Ver meu pré-pedido →</a>
        <div class="product-page-fulfilment">
          <h2>Entrega ou retirada</h2>
          <p>🚚 <strong>Entrega:</strong> prazo e taxa confirmados pelo WhatsApp.</p>
          <p>🏪 <strong>Retirada:</strong> consulte disponibilidade com o atendente.</p>
          <p>📍 Loja 1 — Solo Sagrado | Loja 2 — Residencial Nature 1</p>
        </div>
      </section>
    </div>
    <section class="product-page-details"><h2>Informações sobre o produto</h2>${sections.length?sections.map(([title,body])=>`<article class="product-page-section"><h3>${title}</h3><p>${esc(body)}</p></article>`).join(''):'<p>Informações complementares em atualização. Nossa equipe pode esclarecer suas dúvidas pelo WhatsApp.</p>'}</section>
  </div>`;
}
