import { loadInventory, startInventoryUpdates } from './trier-inventory.js';
import { mountCartChat } from './cart-chat.js?v=20261021-privacy-cart';
import { stockState, stockMarkup, refreshStockMarkup } from './product-stock.js';
import { money, unitPrice, sanitizeCart, priceHtml } from './catalog-utils.js';
import { productDetailMarkup, productEscape, imageUrl } from './product-detail.js?v=20261008-sem-detalhes-v1';
const host=document.querySelector('#product-page-root');
const params=new URLSearchParams(location.search), id=Number(params.get('id'));
const msg=s=>{const el=document.querySelector('#product-page-feedback'); if(el)el.textContent=s;};
const read=(k,def)=>{try{return JSON.parse(localStorage.getItem(k))??def}catch{return def}};
const save=(k,val)=>{try{localStorage.setItem(k,JSON.stringify(val))}catch{}};
try {
 const response=await fetch(new URL('catalog.json',import.meta.url),{cache:'no-store'});
 if(!response.ok)throw Error('O catálogo está temporariamente indisponível.');
 const sourceCatalog=await response.json(); let data=await loadInventory(sourceCatalog);
 if(!Number.isSafeInteger(id)||id<1)throw Error('Produto não encontrado.');
 let p=data.products.find(x=>x.id===id&&x.active);
 if(!p)throw Error('Produto não encontrado no catálogo.');
 if(data.expandedProductPage!==true)throw Error('Esta página ainda não está disponível. Consulte nosso catálogo.');
 document.title=p.name+' | Droga Vida Popular';
 host.innerHTML=productDetailMarkup(p);
 const variants=p.variants||[], select=document.querySelector('#product-page-variant');
 let cart=sanitizeCart(read('dv-cart',[]),data.products);
 const chatCart=mountCartChat({getProducts:()=>data.products,getCart:()=>cart,setCart:next=>{cart=next;save('dv-cart',cart);}});
 document.querySelector('.product-page-view-cart').onclick=e=>{e.preventDefault();chatCart.open();};
 document.querySelector('#product-page-root').addEventListener('click',e=>{const b=e.target.closest('[data-stock-size]');if(b&&select&&!b.disabled){select.value=b.dataset.stockSize;select.dispatchEvent(new Event('change'));}});
 startInventoryUpdates(sourceCatalog,next=>{data=next;p=data.products.find(x=>x.id===id);refreshStockMarkup(data.products);document.querySelectorAll('[data-price-id]').forEach(link=>{const related=data.products.find(x=>x.id===Number(link.dataset.priceId));if(related)link.querySelector('span').innerHTML=priceHtml(related);});document.querySelector('#product-page-price').innerHTML=priceHtml(p,select?.value||'');chatCart.refresh();});
 if(select)select.onchange=()=>{document.querySelector('#product-page-price').innerHTML=priceHtml(p,select.value);};
 const chosenSize=params.get('tamanho');if(select&&variants.some(v=>v.size===chosenSize)&&stockState(p,chosenSize).limit>0){select.value=chosenSize;select.dispatchEvent(new Event('change'));}
 let favorites=read('dv-favorites',[]);if(!Array.isArray(favorites))favorites=[];
 const favorite=document.querySelector('#product-page-favorite');
 const setFavorite=()=>{const chosen=favorites.includes(id);favorite.textContent=chosen?'♥ Salvo nos favoritos':'♡ Favoritar';favorite.setAttribute('aria-pressed',String(chosen))};
 setFavorite();
 favorite.onclick=()=>{favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];save('dv-favorites',favorites);setFavorite()};
 document.querySelector('#product-page-add').onclick=()=>{
  const variant=select?.value||'';
  if(variants.length&&!variant){select.focus();msg('Selecione um tamanho ou apresentação.');return}
  cart=sanitizeCart(read('dv-cart',[]),data.products);const state=stockState(p,variant);const existing=cart.find(x=>x.id===id&&x.variant===variant);
  if((existing?.qty||0)>=state.limit){msg(state.known?state.label:'Limite de 99 unidades por produto.');return;}
  if(existing){if(existing.qty>=99){msg('Limite de 99 unidades por produto.');return}existing.qty++}else cart.push({id,variant,qty:1});
  save('dv-cart',cart);msg('Produto adicionado ao pré-pedido!');chatCart.update();chatCart.open({added:true});
 };
 document.querySelector('#product-page-share').onclick=async()=>{
  try{if(navigator.share)await navigator.share({title:p.name,url:location.href});else if(navigator.clipboard){await navigator.clipboard.writeText(location.href);msg('Link do produto copiado!')}else msg('Copie o endereço desta página para compartilhar.')}catch{}
 };
 const related=data.products.filter(x=>x.active&&x.id!==id&&x.category===p.category).slice(0,4);
 if(related.length){const section=document.createElement('section');section.className='product-page-related';section.innerHTML='<h2>Produtos relacionados</h2><div class="product-page-related-grid">'+related.map(x=>`<a data-price-id="${x.id}" href="produto.html?id=${x.id}"><img src="${productEscape(imageUrl(x.imageUrl))}" alt="${productEscape(x.name)}" loading="lazy"><strong>${productEscape(x.name)}</strong><span>${priceHtml(x)}</span>${stockMarkup(x)}</a>`).join('')+'</div>';host.append(section);}
} catch(error){host.innerHTML='<div class="product-page-empty"><h1>'+productEscape(error.message)+'</h1><a href="./#ofertas">Voltar ao catálogo</a></div>'}
