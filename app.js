import { loadInventory, startInventoryUpdates } from './trier-inventory.js';
import { mountCartChat } from './cart-chat.js?v=20261021-privacy-cart';
import { stockMarkup, stockState, refreshStockMarkup } from './product-stock.js';
import { money, filterProducts, sanitizeCart, cartTotal, orderMessage, unitPrice, priceInfo, priceHtml } from './catalog-utils.js';
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
const imageSrc = value => { try { return new URL(String(value || ''), import.meta.url).href; } catch { return String(value || ''); } };
const renderIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
renderIcons();
const $ = s => document.querySelector(s);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The catalog also works without browser storage. */ } };
let expandedProductPage = false;
let chatCart;
let products = [], categories = [], cart = [], favorites = [], category = 'Todos', subcategory = '', query = '', favoriteOnly = false, all = false, limit = 12, toastTimer;

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
  save('dv-cart', cart); save('dv-favorites', favorites); chatCart?.update();
}
function productCard(p) {
  const discount = priceInfo(p).discount;
  const categoryLabel = p.subcategory ? `${p.category === 'Perfumaria e Cuidados Pessoais' ? 'Cuidados pessoais' : p.category} · ${p.subcategory}` : (p.category === 'Perfumaria e Cuidados Pessoais' ? 'Cuidados pessoais' : p.category);
  return `<article class="product-card"><button class="favorite" data-favorite="${p.id}" aria-label="${favorites.includes(p.id)?'Remover':'Adicionar'} ${escape(p.name)} ${favorites.includes(p.id)?'dos':'aos'} favoritos" aria-pressed="${favorites.includes(p.id)}">${icon('heart')}</button><button class="product-image" data-detail="${p.id}" aria-label="Ver detalhes de ${escape(p.name)}"><img src="${escape(imageSrc(p.imageUrl))}" alt="${escape(p.name)}" loading="lazy" width="180" height="180">${discount ? `<span class="discount">-${discount}%</span>`:''}</button><p class="product-category">${escape(categoryLabel)}</p><h3><button data-detail="${p.id}">${escape(p.name)}</button></h3><p class="product-detail">${escape(p.variants.length ? 'Vários tamanhos disponíveis' : p.detail)}</p>${stockMarkup(p,{selectable:true})}<div class="product-price">${priceHtml(p)}</div><button class="add-button" data-add="${p.id}">${icon('cart')} ${p.variants.length ? 'Escolher tamanho':'Adicionar'}</button></article>`;
}
function renderSubfilters() {
  const host = $('#subfilters'); if (!host) return;
  const selected = categories.find(c => c.name === category);
  const subs = selected?.subcategories?.filter(s => s.active !== false) || [];
  host.hidden = category === 'Todos' || !subs.length;
  if (host.hidden) { host.innerHTML = ''; return; }
  host.innerHTML = `<button data-category="${escape(category)}" aria-pressed="${!subcategory}">Todos</button>` + subs.map(s => `<button data-category="${escape(category)}" data-subcategory="${escape(s.name)}" aria-pressed="${subcategory === s.name}">${escape(s.name)}</button>`).join('');
}
function renderProducts() {
  renderSubfilters();
  const filtered = filterProducts(products, { category, subcategory, query, favorites: favoriteOnly ? favorites : null });
  const displayed = all || category !== 'Todos' || query || favoriteOnly ? filtered : filtered.filter(p => p.featured);
  $('#products-title').textContent = favoriteOnly ? 'Seus favoritos' : query ? 'Resultado da busca' : category !== 'Todos' ? (subcategory || category) : all ? 'Todos os produtos' : 'Produtos em destaque';
  $('#results').textContent = `${displayed.length} ${displayed.length === 1 ? 'produto encontrado':'produtos encontrados'}${query ? ` para “${query}”` : ''}`;
  $('#products').innerHTML = displayed.length ? displayed.slice(0,limit).map(productCard).join('') : `<div class="empty"><h3>${favoriteOnly ? 'Seus favoritos ficam aqui.' : 'Não encontramos produtos nesta seleção.'}</h3><p>${favoriteOnly ? 'Toque no coração dos produtos que você gosta.' : 'Nossa equipe pode consultar a disponibilidade para você.'}</p><a class="button red-button" href="${whatsapp('Olá! Gostaria de consultar '+(query || subcategory || category)+'.')}" target="_blank" rel="noopener noreferrer">Consultar no WhatsApp ${icon('arrow')}</a></div>`;
  $('#load-more').hidden = displayed.length <= limit; $('#clear-filters').hidden = category === 'Todos' && !query && !favoriteOnly && !subcategory;
  $('#show-all').hidden = all;
  document.querySelectorAll('#filters [data-category]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.category === category)));
  document.querySelectorAll('#subfilters [data-subcategory]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.subcategory === subcategory)));
  updateCounts();
}
function selectCategory(name, sub = '') { category=name; subcategory=sub; all=true; query=''; $('#search').value=''; favoriteOnly=false; limit=12; renderProducts(); $('#ofertas').scrollIntoView({behavior:'smooth'}); }
document.addEventListener('click', event => {
  const categoryButton = event.target.closest('[data-category]'); if (categoryButton) selectCategory(categoryButton.dataset.category, categoryButton.dataset.subcategory || '');
  const fav = event.target.closest('[data-favorite]'); if(fav) { const id=Number(fav.dataset.favorite); favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id]; renderProducts(); }
  const detail = event.target.closest('[data-detail]'); if(detail) showDetail(Number(detail.dataset.detail));
  const add = event.target.closest('[data-add]'); if(add) { const p=products.find(p=>p.id===Number(add.dataset.add)); if(p.variants.length) showDetail(p.id); else addToCart(p.id); }
});
function addToCart(id, variant='') { const p=products.find(p=>p.id===id),state=stockState(p,variant),current=cart.find(i=>i.id===id&&i.variant===variant)?.qty||0;if(current>=state.limit){toast(state.known?state.label:'Limite de 99 unidades por item.');return;} const found=cart.find(i=>i.id===id && i.variant===variant); if(found?.qty===99) {toast('Limite de 99 unidades por item.');return;} if(found)found.qty++;else cart.push({id,variant,qty:1}); cart=sanitizeCart(cart,products);updateCounts();chatCart.open({added:true});toast('Produto adicionado ao carrinho'); }
function showDetail(id, chosenSize='') {
  const p=products.find(p=>p.id===id); if(!p)return;
  if(expandedProductPage) { window.location.assign(new URL(`produto.html?id=${encodeURIComponent(id)}${chosenSize?'&tamanho='+encodeURIComponent(chosenSize):''}`,import.meta.url).href); return; }
  const initialPriceHtml=priceHtml(p);
  $('#detail-dialog').dataset.productId=String(id);
  $('#detail-content').innerHTML=`<div class="detail-grid"><img src="${escape(imageSrc(p.imageUrl))}" alt="${escape(p.name)}"><div><p class="eyebrow red">${escape(p.category)}</p><h2>${escape(p.name)}</h2><p>${escape(p.detail)}${p.brand ? ' · '+escape(p.brand):''}</p><div class="product-price" id="detail-price">${initialPriceHtml}</div>${stockMarkup(p,{selectable:true})}${p.variants.length?`<label for="variant">Escolha o tamanho<select id="variant"><option value="">Selecione uma opção</option>${p.variants.map(v=>`<option value="${escape(v.size)}" ${stockState(p,v.size).known&&!stockState(p,v.size).available?'disabled':''}>${escape(v.size)} — ${v.packageQuantity} unidades — ${money(unitPrice(p,v.size))}</option>`).join('')}</select></label>`:''}<p>Consulte a disponibilidade ${p.availableStore1&&p.availableStore2?'nas duas lojas':p.availableStore1?'na Loja 1':'na Loja 2'}. Preço sujeito à confirmação.</p><button class="button red-button" id="detail-add">${icon('cart')} Adicionar ao carrinho</button></div></div>`;
  if(p.variants.length) $('#variant').onchange=event=>{$('#detail-price').innerHTML=priceHtml(products.find(x=>x.id===id),event.target.value);};
  $('#detail-add').onclick=()=>{const variant=p.variants.length?$('#variant').value:'';if(p.variants.length&&!variant){$('#variant').focus();toast('Escolha o tamanho para continuar.');return;}$('#detail-dialog').close();addToCart(id,variant);};
  if(chosenSize && $('#variant')){$('#variant').value=chosenSize;$('#variant').dispatchEvent(new Event('change'));}
  openDialog($('#detail-dialog'));
}
chatCart=mountCartChat({getProducts:()=>products,getCart:()=>cart,setCart:next=>{cart=next;updateCounts();}});
function renderCart(){chatCart.refresh();}
document.querySelectorAll('.cart-trigger').forEach(b=>b.onclick=()=>chatCart.open());
document.addEventListener('click',event=>{const stock=event.target.closest('[data-stock-product]');if(!stock)return;const id=Number(stock.dataset.stockProduct),size=stock.dataset.stockSize;if($('#detail-dialog').open&&$('#variant')){$('#variant').value=size;$('#variant').dispatchEvent(new Event('change'));}else showDetail(id,size);});
$('#search-form').addEventListener('submit',event=>{event.preventDefault();query=$('#search').value;all=true;category='Todos';subcategory='';favoriteOnly=false;limit=12;renderProducts();$('#ofertas').scrollIntoView({behavior:'smooth'});});
$('#search').addEventListener('input',()=>{query=$('#search').value;all=true;category='Todos';subcategory='';favoriteOnly=false;limit=12;renderProducts();});
$('#show-all').onclick=()=>selectCategory('Todos'); $('#load-more').onclick=()=>{limit+=12;renderProducts();};
document.querySelectorAll('a[href="#ofertas"]').forEach(link => link.addEventListener('click', () => selectCategory('Todos')));
$('#clear-filters').onclick=()=>selectCategory('Todos'); $('#favorites').onclick=()=>{favoriteOnly=!favoriteOnly;all=true;category='Todos';subcategory='';query='';$('#search').value='';limit=12;renderProducts();};
$('#contact-form').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);const text=`Olá, sou ${String(data.get('name')).trim()}.\n\n${String(data.get('message')).trim()}`;window.open(whatsapp(text),'_blank','noopener,noreferrer');});
$('#privacy').onclick=()=>openDialog($('#privacy-dialog')); $('#clear-data').onclick=()=>{cart=[];favorites=[];renderProducts();renderCart();toast('Carrinho e favoritos apagados deste navegador.');};
$('#year').textContent=new Date().getFullYear();
try {
  const catalogUrl=new URL('catalog.json',import.meta.url); catalogUrl.searchParams.set('v','20261006-mobile-cache-fix-1'); const response=await fetch(catalogUrl,{cache:'no-store'}); if(!response.ok) throw new Error('Catálogo indisponível'); const sourceCatalog=await response.json(); const data=await loadInventory(sourceCatalog); products=data.products; categories=data.categories; expandedProductPage=data.expandedProductPage === true;
  cart=sanitizeCart(read('dv-cart',[]),products); const storedFavorites=read('dv-favorites',[]); favorites=Array.isArray(storedFavorites)?[...new Set(storedFavorites)].filter(id=>products.some(p=>p.id===id)):[];
  $('#filters').innerHTML=['Todos',...data.categories.map(c=>c.name)].map(c=>`<button data-category="${escape(c)}" aria-pressed="${c==='Todos'}">${escape(c==='Perfumaria e Cuidados Pessoais'?'Beleza e cuidados':c)}</button>`).join('');
  renderProducts();
  startInventoryUpdates(sourceCatalog,next=>{products=next.products;cart=sanitizeCart(cart,products);refreshStockMarkup(products);renderProducts();const detailProduct=products.find(p=>p.id===Number($('#detail-dialog').dataset.productId));if(detailProduct&&$('#detail-dialog').open)$('#detail-price').innerHTML=priceHtml(detailProduct,$('#variant')?.value||'');updateCounts();chatCart.refresh();});
  if(new URLSearchParams(window.location.search).get('prePedido') === '1') {
    chatCart.open();
    history.replaceState(null,'',window.location.pathname+window.location.hash);
  }
} catch(error) {
  $('#results').textContent='Não foi possível carregar o catálogo.';$('#products').innerHTML=`<div class="empty"><h3>Estamos aqui para ajudar.</h3><p>Consulte nossos produtos diretamente com a equipe.</p><a class="button red-button" href="https://wa.me/5517996630482" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a></div>`;
}

document.querySelector('#statistics-preferences')?.addEventListener('click',()=>{document.querySelector('#privacy-dialog').close();document.dispatchEvent(new Event('dv-statistics-choice'));});

document.querySelector('#terms')?.addEventListener('click',()=>document.querySelector('#terms-dialog').showModal());
