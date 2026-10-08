import { money, unitPrice, sanitizeCart } from './catalog-utils.js';
import { productDetailMarkup, productEscape, imageUrl } from './product-detail.js';
const host=document.querySelector('#product-page-root');
const params=new URLSearchParams(location.search), id=Number(params.get('id')), preview=params.get('preview')==='1';
const msg=s=>{const el=document.querySelector('#product-page-feedback'); if(el)el.textContent=s;};
const read=(k,def)=>{try{return JSON.parse(localStorage.getItem(k))??def}catch{return def}};
const save=(k,val)=>{try{localStorage.setItem(k,JSON.stringify(val))}catch{}};
try {
 const response=await fetch(new URL('catalog.json',import.meta.url),{cache:'no-store'});
 if(!response.ok)throw Error('O catálogo está temporariamente indisponível.');
 const data=await response.json();
 if(!Number.isSafeInteger(id)||id<1)throw Error('Produto não encontrado.');
 const p=data.products.find(x=>x.id===id&&x.active);
 if(!p)throw Error('Produto não encontrado no catálogo.');
 if(data.expandedProductPage!==true&&!preview)throw Error('Esta página ainda não está disponível. Consulte nosso catálogo.');
 document.title=p.name+' | Droga Vida Popular';
 host.innerHTML=productDetailMarkup(p);
 const variants=p.variants||[], select=document.querySelector('#product-page-variant');
 if(select)select.onchange=()=>{const price=select.value?unitPrice(p,select.value):Math.min(...variants.map(v=>unitPrice(p,v.size)));document.querySelector('#product-page-price').innerHTML=(select.value?'':'<small>A partir de</small>')+'<strong>'+money(price)+'</strong>'};
 let favorites=read('dv-favorites',[]);if(!Array.isArray(favorites))favorites=[];
 const favorite=document.querySelector('#product-page-favorite');
 const setFavorite=()=>{const chosen=favorites.includes(id);favorite.textContent=chosen?'♥ Salvo nos favoritos':'♡ Favoritar';favorite.setAttribute('aria-pressed',String(chosen))};
 setFavorite();
 favorite.onclick=()=>{favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];save('dv-favorites',favorites);setFavorite()};
 document.querySelector('#product-page-add').onclick=()=>{
  const variant=select?.value||'';
  if(variants.length&&!variant){select.focus();msg('Selecione um tamanho ou apresentação.');return}
  const cart=sanitizeCart(read('dv-cart',[]),data.products);const existing=cart.find(x=>x.id===id&&x.variant===variant);
  if(existing){if(existing.qty>=99){msg('Limite de 99 unidades por produto.');return}existing.qty++}else cart.push({id,variant,qty:1});
  save('dv-cart',cart);msg('Produto adicionado ao pré-pedido! Clique em "Ver meu pré-pedido" para continuar.');
 };
 document.querySelector('#product-page-share').onclick=async()=>{
  try{if(navigator.share)await navigator.share({title:p.name,url:location.href});else if(navigator.clipboard){await navigator.clipboard.writeText(location.href);msg('Link do produto copiado!')}else msg('Copie o endereço desta página para compartilhar.')}catch{}
 };
 const related=data.products.filter(x=>x.active&&x.id!==id&&x.category===p.category).slice(0,4);
 if(related.length){const section=document.createElement('section');section.className='product-page-related';section.innerHTML='<h2>Produtos relacionados</h2><div class="product-page-related-grid">'+related.map(x=>`<a href="produto.html?id=${x.id}${preview?'&preview=1':''}"><img src="${productEscape(imageUrl(x.imageUrl))}" alt="${productEscape(x.name)}" loading="lazy"><strong>${productEscape(x.name)}</strong><span>${money(x.priceCents)}</span></a>`).join('')+'</div>';host.append(section);}
} catch(error){host.innerHTML='<div class="product-page-empty"><h1>'+productEscape(error.message)+'</h1><a href="./#ofertas">Voltar ao catálogo</a></div>'}
