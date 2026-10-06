import { money, filterProducts, sanitizeCart, cartTotal, orderMessage, unitPrice } from './catalog-utils.js';
const paths = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  cart:'<path d="M2 3h3l3 13h11l3-10H6m3 6h11"/><circle cx="10" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  truck:'<path d="M1 4h13v13H1zM14 9h5l4 4v4h-9M4 8H1"/><circle cx="5" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>',
  tag:'<path d="M20 3h-8L2 13l9 9L22 11V3z"/><circle cx="17" cy="8" r="1"/>',
  user:'<circle cx="12" cy="7" r="4"/><path d="M3 22v-3a9 9 0 0 1 18 0v3Z"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  pill:'<path d="m9 3-6 6a7 7 0 0 0 10 10l6-6A7 7 0 0 0 9 3Zm-3 3 12 12M12 5l4 4"/>',
  bottle:'<path d="M8 9h8a3 3 0 0 1 3 3v9H5v-9a3 3 0 0 1 3-3Zm2 0V4h4v5M8 2h9v2M8 14h8"/>',
  leaf:'<path d="M12 22C5 19 2 14 3 7c6 0 11 4 10 11M12 22c-2-10 1-17 10-20 1 9-2 15-9 18M7 12l5 10m5-13-5 13"/>',
  baby:'<path d="M5 8a9 9 0 0 1 14 0M4 9a3 3 0 0 0 0 6 8 8 0 0 0 16 0 3 3 0 0 0 0-6M10 4c0-4 5-4 5-1 0 2-2 3-3 3M8 12h.1M16 12h.1M9 16q3 3 6 0"/>',
  flower:'<path d="M12 21C4 19 2 15 2 10c6 0 10 3 10 11Zm0 0c8-2 10-6 10-11-6 0-10 3-10 11Zm0-1C5 13 7 7 12 2c5 5 7 11 0 18Z"/>',
  bolt:'<path d="M13 2 3 14h7l-1 8L21 9h-8l1-7Z"/>',
  percent:'<circle cx="12" cy="12" r="10"/><path d="m8 16 8-8"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="16" r="1.5"/>',
  shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 6-6"/>',
  store:'<path d="M3 10v12h18V10M2 3h20v5a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2ZM9 22v-8h6v8"/>',
  message:'<path fill="currentColor" stroke="none" d="M20.52 3.48A11.9 11.9 0 0 0 12.04 0C5.43 0 .06 5.37.06 11.98c0 2.11.55 4.17 1.6 5.99L0 24l6.17-1.62a11.96 11.96 0 0 0 5.87 1.5h.01C18.65 23.88 24 18.51 24 11.91c0-3.19-1.24-6.19-3.48-8.43ZM12.05 21.86h-.01a9.94 9.94 0 0 1-5.07-1.39l-.36-.21-3.67.96.98-3.58-.24-.37a9.92 9.92 0 0 1-1.52-5.29c0-5.49 4.47-9.96 9.97-9.96a9.87 9.87 0 0 1 7.04 2.92 9.9 9.9 0 0 1 2.91 7.05c0 5.48-4.48 9.87-10.03 9.87Zm5.46-7.43c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.11 4.52.71.3 1.26.49 1.69.63.71.22 1.35.19 1.85.11.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35Z"/>',
  phone:'<path d="m4 3 4-1 3 5-2 2c1 3 3 5 6 6l2-2 5 3-1 4C10 24 0 13 4 3Z"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.heart}</svg>`;
const renderIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
renderIcons();
const $ = s => document.querySelector(s);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The catalog also works without browser storage. */ } };
let products = [], cart = [], favorites = [], category = 'Todos', subcategory = '', query = '', favoriteOnly = false, all = false, limit = 12, toastTimer;

const whatsapp = text => `https://wa.me/5517996630482?text=${encodeURIComponent(text)}`;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000); }
function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => dialog.close());
  dialog.addEventListener('click', event => { if(event.target === dialog) { const r = dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
});
function updateCounts() {
  $('#cart-count').textContent = cart.reduce((s, i) => s+i.qty, 0); $('#cart-total').textContent = money(cartTotal(cart, products));
  $('#favorite-count').textContent = favorites.length; $('#favorites').setAttribute('aria-pressed', String(favoriteOnly));
  save('dv-cart', cart); save('dv-favorites', favorites);
}
function productCard(p) {
  const variantPrices=p.variants.length?p.variants.map(v=>unitPrice(p,v.size)):[];
  const displayPrice=variantPrices.length?Math.min(...variantPrices):p.priceCents;
  const discount = !p.variants.length && p.oldPriceCents > p.priceCents ? Math.round((1-p.priceCents/p.oldPriceCents)*100) : 0;
  return `<article class="product-card"><button class="favorite" data-favorite="${p.id}" aria-label="${favorites.includes(p.id)?'Remover':'Adicionar'} ${escape(p.name)} ${favorites.includes(p.id)?'dos':'aos'} favoritos" aria-pressed="${favorites.includes(p.id)}">${icon('heart')}</button><button class="product-image" data-detail="${p.id}" aria-label="Ver detalhes de ${escape(p.name)}"><img src="${escape(p.imageUrl)}" alt="${escape(p.name)}" loading="lazy" width="180" height="180">${discount ? `<span class="discount">-${discount}%</span>`:''}</button><p class="product-category">${escape(p.category === 'Perfumaria e Cuidados Pessoais' ? 'Cuidados pessoais' : p.category)}</p><h3><button data-detail="${p.id}">${escape(p.name)}</button></h3><p class="product-detail">${escape(p.variants.length ? 'Vários tamanhos disponíveis' : p.detail)}</p><div class="product-price">${p.variants.length?'<small>A partir de</small>':p.oldPriceCents > p.priceCents ? `<del>${money(p.oldPriceCents)}</del>`:''}<strong>${money(displayPrice)}</strong></div><button class="add-button" data-add="${p.id}">${icon('cart')} ${p.variants.length ? 'Escolher tamanho':'Adicionar'}</button></article>`;
}
function renderProducts() {
  const filtered = filterProducts(products, { category, subcategory, query, favorites: favoriteOnly ? favorites : null });
  const displayed = all || category !== 'Todos' || query || favoriteOnly ? filtered : filtered.filter(p => p.featured);
  $('#products-title').textContent = favoriteOnly ? 'Seus favoritos' : query ? 'Resultado da busca' : category !== 'Todos' ? (subcategory || category) : all ? 'Todos os produtos' : 'Produtos em destaque';
  $('#results').textContent = `${displayed.length} ${displayed.length === 1 ? 'produto encontrado':'produtos encontrados'}${query ? ` para “${query}”` : ''}`;
  $('#products').innerHTML = displayed.length ? displayed.slice(0,limit).map(productCard).join('') : `<div class="empty"><h3>${favoriteOnly ? 'Seus favoritos ficam aqui.' : 'Não encontramos produtos nesta seleção.'}</h3><p>${favoriteOnly ? 'Toque no coração dos produtos que você gosta.' : 'Nossa equipe pode consultar a disponibilidade para você.'}</p><a class="button red-button" href="${whatsapp('Olá! Gostaria de consultar '+(query || subcategory || category)+'.')}" target="_blank" rel="noopener noreferrer">Consultar no WhatsApp ${icon('arrow')}</a></div>`;
  $('#load-more').hidden = displayed.length <= limit; $('#clear-filters').hidden = category === 'Todos' && !query && !favoriteOnly && !subcategory;
  $('#show-all').hidden = all;
  document.querySelectorAll('#filters [data-category]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.category === category)));
  updateCounts();
}
function selectCategory(name, sub = '') { category=name; subcategory=sub; all=true; query=''; $('#search').value=''; favoriteOnly=false; limit=12; renderProducts(); $('#ofertas').scrollIntoView({behavior:'smooth'}); }
document.addEventListener('click', event => {
  const categoryButton = event.target.closest('[data-category]'); if (categoryButton) selectCategory(categoryButton.dataset.category, categoryButton.dataset.subcategory || '');
  const fav = event.target.closest('[data-favorite]'); if(fav) { const id=Number(fav.dataset.favorite); favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id]; renderProducts(); }
  const detail = event.target.closest('[data-detail]'); if(detail) showDetail(Number(detail.dataset.detail));
  const add = event.target.closest('[data-add]'); if(add) { const p=products.find(p=>p.id===Number(add.dataset.add)); if(p.variants.length) showDetail(p.id); else addToCart(p.id); }
});
function addToCart(id, variant='') { const found=cart.find(i=>i.id===id && i.variant===variant); if(found?.qty===99) {toast('Limite de 99 unidades por item.');return;} if(found)found.qty++;else cart.push({id,variant,qty:1}); cart=sanitizeCart(cart,products);updateCounts();renderCart();toast('Produto adicionado ao carrinho'); }
function showDetail(id) {
  const p=products.find(p=>p.id===id); if(!p)return;
  const variantPrices=p.variants.map(v=>unitPrice(p,v.size));
  const initialPrice=variantPrices.length?Math.min(...variantPrices):p.priceCents;
  const initialPriceHtml=p.variants.length?`<small>A partir de</small><strong>${money(initialPrice)}</strong>`:`${p.oldPriceCents>p.priceCents?`<del>${money(p.oldPriceCents)}</del>`:''}<strong>${money(p.priceCents)}</strong>`;
  $('#detail-content').innerHTML=`<div class="detail-grid"><img src="${escape(p.imageUrl)}" alt="${escape(p.name)}"><div><p class="eyebrow red">${escape(p.category)}</p><h2>${escape(p.name)}</h2><p>${escape(p.detail)}${p.brand ? ' · '+escape(p.brand):''}</p><div class="product-price" id="detail-price">${initialPriceHtml}</div>${p.variants.length?`<label for="variant">Escolha o tamanho<select id="variant"><option value="">Selecione uma opção</option>${p.variants.map(v=>`<option value="${escape(v.size)}">${escape(v.size)} — ${v.packageQuantity} unidades — ${money(unitPrice(p,v.size))}</option>`).join('')}</select></label>`:''}<p>Consulte a disponibilidade ${p.availableStore1&&p.availableStore2?'nas duas lojas':p.availableStore1?'na Loja 1':'na Loja 2'}. Preço sujeito à confirmação.</p><button class="button red-button" id="detail-add">${icon('cart')} Adicionar ao carrinho</button></div></div>`;
  if(p.variants.length) $('#variant').onchange=event=>{const size=event.target.value;$('#detail-price').innerHTML=size?`<strong>${money(unitPrice(p,size))}</strong>`:`<small>A partir de</small><strong>${money(initialPrice)}</strong>`;};
  $('#detail-add').onclick=()=>{const variant=p.variants.length?$('#variant').value:'';if(p.variants.length&&!variant){$('#variant').focus();toast('Escolha o tamanho para continuar.');return;}addToCart(id,variant);$('#detail-dialog').close();};
  openDialog($('#detail-dialog'));
}
const customer = { name: '', receipt: 'entrega', neighborhood: '' };
function refreshOrderPreview() {
  const preview = $('#order-preview');
  if (preview) preview.textContent = orderMessage(cart, products, customer);
}
function renderCart() {
  $('#cart-items').innerHTML=cart.length?cart.map((item,index)=>{const p=products.find(p=>p.id===item.id); const variant=p.variants.find(v=>v.size===item.variant);return `<article class="cart-item"><img src="${escape(p.imageUrl)}" alt="${escape(p.name)}"><div><h3>${escape(p.name)}</h3><p>${variant?`${escape(variant.size)} · ${variant.packageQuantity} unidades`:escape(p.detail)}</p><strong>${money(unitPrice(p,item.variant)*item.qty)}</strong><div class="quantity"><button data-qty="${index}" data-delta="-1" aria-label="Diminuir quantidade de ${escape(p.name)}">−</button><span>${item.qty}</span><button data-qty="${index}" data-delta="1" aria-label="Aumentar quantidade de ${escape(p.name)}">+</button><button data-remove="${index}">Remover</button></div></div></article>`}).join(''):`<div class="empty"><h3>Seu carrinho está esperando por você.</h3><p>Escolha seus produtos e combine tudo com a nossa equipe.</p><button id="continue-shopping" class="button red-button">Ver produtos ${icon('arrow')}</button></div>`;
  $('#cart-summary').innerHTML=cart.length?`<div class="cart-subtotal"><span>Subtotal estimado</span><span>${money(cartTotal(cart,products))}</span></div><p class="cart-footnote">Os produtos estão sujeitos à disponibilidade em estoque. Confirme os valores com a equipe.</p><form id="order-form" class="order-form"><label for="order-name">Seu nome<input id="order-name" name="name" required maxlength="80" autocomplete="given-name" placeholder="Como podemos chamar você?" value="${escape(customer.name)}"></label><label for="order-receipt">Forma de recebimento<select id="order-receipt" name="receipt"><option value="entrega" ${customer.receipt==='entrega'?'selected':''}>Entrega</option><option value="retirada" ${customer.receipt==='retirada'?'selected':''}>Retirada na loja</option></select></label><label id="neighborhood-label" for="order-neighborhood" ${customer.receipt==='retirada'?'hidden':''}>Bairro para entrega<input id="order-neighborhood" name="neighborhood" maxlength="120" ${customer.receipt==='entrega'?'required':''} placeholder="Informe seu bairro" value="${escape(customer.neighborhood)}"></label><p id="delivery-note" class="cart-footnote" ${customer.receipt==='retirada'?'hidden':''}>Taxa de entrega: consultar com os atendentes.</p><details class="order-preview"><summary>Ver mensagem do pré-pedido</summary><pre id="order-preview"></pre></details><button type="submit" class="button red-button checkout">${icon('message')} Continuar no WhatsApp ${icon('arrow')}</button><p class="cart-footnote order-note">Você poderá revisar a mensagem no WhatsApp antes de enviar. Este pré-pedido não confirma a compra.</p></form>`:'';
  refreshOrderPreview();
  $('#continue-shopping')?.addEventListener('click',()=>{$('#cart-dialog').close();selectCategory('Todos');});
}
$('#cart-summary').addEventListener('input', event => {
  if (event.target.name === 'name' || event.target.name === 'neighborhood') {
    customer[event.target.name] = event.target.value;
    event.target.setCustomValidity('');
    refreshOrderPreview();
  }
});
$('#cart-summary').addEventListener('change', event => {
  if (event.target.name !== 'receipt') return;
  customer.receipt = event.target.value;
  const delivery = customer.receipt === 'entrega';
  $('#neighborhood-label').hidden = !delivery;
  $('#order-neighborhood').required = delivery;
  $('#order-neighborhood').setCustomValidity('');
  $('#delivery-note').hidden = !delivery;
  refreshOrderPreview();
});
$('#cart-summary').addEventListener('submit', event => {
  event.preventDefault();
  if (!cart.length) return;
  for (const input of event.target.querySelectorAll('input[required]')) {
    input.setCustomValidity(input.value.trim() ? '' : 'Preencha este campo para continuar.');
  }
  if (!event.target.reportValidity()) return;
  window.open(whatsapp(orderMessage(cart, products, customer)), '_blank', 'noopener,noreferrer');
});
$('#cart-items').addEventListener('click',event=>{const qty=event.target.closest('[data-qty]'), remove=event.target.closest('[data-remove]');if(qty){const i=Number(qty.dataset.qty);cart[i].qty=Math.min(99,cart[i].qty+Number(qty.dataset.delta));cart=cart.filter(i=>i.qty>0);}if(remove)cart.splice(Number(remove.dataset.remove),1);if(qty||remove){updateCounts();renderCart();}});
document.querySelectorAll('.cart-trigger').forEach(b=>b.onclick=()=>{renderCart();openDialog($('#cart-dialog'));});
$('#search-form').addEventListener('submit',event=>{event.preventDefault();query=$('#search').value;all=true;category='Todos';subcategory='';favoriteOnly=false;limit=12;renderProducts();$('#ofertas').scrollIntoView({behavior:'smooth'});});
$('#search').addEventListener('input',()=>{query=$('#search').value;all=true;category='Todos';subcategory='';favoriteOnly=false;limit=12;renderProducts();});
$('#show-all').onclick=()=>selectCategory('Todos'); $('#load-more').onclick=()=>{limit+=12;renderProducts();};
document.querySelectorAll('a[href="#ofertas"]').forEach(link => link.addEventListener('click', () => selectCategory('Todos')));
$('#clear-filters').onclick=()=>selectCategory('Todos'); $('#favorites').onclick=()=>{favoriteOnly=!favoriteOnly;all=true;category='Todos';subcategory='';query='';$('#search').value='';limit=12;renderProducts();};
$('#contact-form').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);const text=`Olá, sou ${String(data.get('name')).trim()}.\n\n${String(data.get('message')).trim()}`;window.open(whatsapp(text),'_blank','noopener,noreferrer');});
$('#privacy').onclick=()=>openDialog($('#privacy-dialog')); $('#clear-data').onclick=()=>{cart=[];favorites=[];renderProducts();renderCart();toast('Carrinho e favoritos apagados deste navegador.');};
$('#year').textContent=new Date().getFullYear();
try {
  const response=await fetch('./catalog.json'); if(!response.ok) throw new Error('Catálogo indisponível'); const data=await response.json(); products=data.products;
  cart=sanitizeCart(read('dv-cart',[]),products); const storedFavorites=read('dv-favorites',[]); favorites=Array.isArray(storedFavorites)?[...new Set(storedFavorites)].filter(id=>products.some(p=>p.id===id)):[];
  $('#filters').innerHTML=['Todos',...data.categories.map(c=>c.name)].map(c=>`<button data-category="${escape(c)}" aria-pressed="${c==='Todos'}">${escape(c==='Perfumaria e Cuidados Pessoais'?'Beleza e cuidados':c)}</button>`).join('');
  renderProducts();
} catch(error) {
  $('#results').textContent='Não foi possível carregar o catálogo.';$('#products').innerHTML=`<div class="empty"><h3>Estamos aqui para ajudar.</h3><p>Consulte nossos produtos diretamente com a equipe.</p><a class="button red-button" href="https://wa.me/5517996630482" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a></div>`;
}
