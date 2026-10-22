import { money, cartTotal, unitPrice, orderMessage, sanitizeCart } from './catalog-utils.js';
import { stockState, cartStockIssue } from './product-stock.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cartIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h3l3 12h11l3-9H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';
export function mountCartChat({ getProducts, getCart, setCart }) {
  const launcher=document.createElement('button');launcher.type='button';launcher.className='dv-cart-launch';launcher.setAttribute('aria-label','Abrir pré-pedido flutuante');launcher.setAttribute('aria-haspopup','dialog');
  launcher.hidden=true;launcher.style.display='none';
  let dialog=document.querySelector('#cart-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='cart-dialog';document.body.append(dialog);}
  dialog.classList.add('dv-cart-chat');dialog.setAttribute('aria-labelledby','cart-title');
  dialog.innerHTML=`<div class="dv-chat-layout"><header class="dv-chat-header"><span class="dv-chat-avatar">${cartIcon}</span><div><h2 id="cart-title">Seu pré-pedido</h2><p>Droga Vida Popular · Estamos com você</p></div><button type="button" data-chat-close aria-label="Fechar carrinho">×</button></header><nav class="dv-chat-steps" aria-label="Etapas do pré-pedido"></nav><div class="dv-chat-scroll"><div class="dv-chat-bubble" role="status"></div><div id="cart-items"></div><div id="cart-summary"></div></div><footer class="dv-chat-footer"></footer></div>`;
  document.body.append(launcher);
  // Keep the cart above the optional privacy notice, including wrapped mobile
  // text. Neither feature should depend on accepting or rejecting statistics.
  let notice;
  function placeLauncher(){
    const gap=notice?.isConnected?Math.max(0,innerHeight-notice.getBoundingClientRect().top):0;
    document.body.style.setProperty('--dv-cart-notice-offset',`${Math.ceil(gap)}px`);
  }
  const noticeResize=new ResizeObserver(placeLauncher);
  function watchNotice(){
    const next=document.querySelector('.statistics-choice');
    if(next!==notice){noticeResize.disconnect();notice=next;if(notice)noticeResize.observe(notice);}
    placeLauncher();
  }
  new MutationObserver(watchNotice).observe(document.body,{childList:true});
  window.addEventListener('resize',placeLauncher);watchNotice();
  const $=s=>dialog.querySelector(s);
  const customer={name:'',receipt:'entrega',neighborhood:''}; // never persisted
  let step=0,added=false;
  function update(){const cart=getCart(),count=cart.reduce((n,i)=>n+i.qty,0);launcher.hidden=count===0;launcher.style.display=count?'':'none';document.body.classList.toggle('has-cart-chat',count>0);launcher.innerHTML=`<span class="dv-cart-icon">${cartIcon}<b>${count}</b></span><span><strong>Meu pré-pedido</strong><small>${count?`${count} ${count===1?'item':'itens'} · toque para revisar`:'Seu carrinho sempre à mão'}</small></span><span class="dv-cart-value">${money(cartTotal(cart,getProducts()))} ›</span>`;}
  function close(){dialog.close();}
  function render(){
    const products=getProducts(),cart=getCart(),issue=cartStockIssue(cart,products);
    if(!cart.length)step=0;
    $('.dv-chat-steps').innerHTML=['1. Produtos','2. Recebimento','3. Revisão'].map((t,i)=>`<span ${i===step?'aria-current="step"':''}>${t}</span>`).join('');
    $('.dv-chat-bubble').innerHTML=`<strong>${step===0?(added?'Produto adicionado!':'Olá! Vamos cuidar do seu pré-pedido?'):step===1?'Como você prefere receber?':'Confira antes de ir para o WhatsApp'}</strong><p>${step===0?'Confira seus itens abaixo. Você pode continuar comprando e voltar aqui a qualquer momento.':step===1?'Informe seu nome e escolha entrega ou retirada. A equipe confirma a disponibilidade.':'A mensagem está pronta. Você ainda poderá revisá-la no WhatsApp antes de enviar.'}</p>`;
    $('#cart-items').hidden=step!==0;$('#cart-summary').hidden=step===0;
    $('#cart-items').innerHTML=cart.length?cart.map((item,index)=>{
      const p=products.find(p=>p.id===item.id),v=p.variants.find(v=>v.size===item.variant),state=stockState(p,item.variant);
      return `<article class="dv-chat-item"><img src="${esc(new URL(p.imageUrl,import.meta.url).href)}" alt="${esc(p.name)}"><div><h3>${esc(p.name)}</h3><p>${v?`${esc(v.size)} · ${v.packageQuantity} unidades por pacote`:esc(p.detail)}</p><div class="dv-chat-item-bottom"><div class="dv-chat-quantity"><button type="button" data-chat-qty="${index}" data-delta="-1" aria-label="Diminuir quantidade de ${esc(p.name)}">−</button><span>${item.qty}</span><button type="button" data-chat-qty="${index}" data-delta="1" ${item.qty>=state.limit?'disabled':''} aria-label="Aumentar quantidade de ${esc(p.name)}">+</button></div><strong>${money(unitPrice(p,item.variant)*item.qty)}</strong></div><button type="button" class="dv-chat-remove" data-chat-remove="${index}">Remover</button><small class="dv-chat-stock">${esc(state.label)}</small></div></article>`;
    }).join('')+'<button type="button" class="dv-chat-continue" data-chat-continue>+ Continuar comprando</button>':'<div class="dv-chat-empty"><h3>Seu carrinho está esperando por você.</h3><p>Escolha os produtos e volte quando quiser.</p><button type="button" class="dv-chat-button" data-chat-continue>Continuar comprando</button></div>';
    if(step===1){$('#cart-summary').innerHTML=`<form id="order-form" class="dv-chat-form"><label for="order-name">Seu nome<input id="order-name" name="name" required maxlength="80" autocomplete="given-name" placeholder="Como podemos chamar você?" value="${esc(customer.name)}"></label><label for="order-receipt">Forma de recebimento<select id="order-receipt" name="receipt"><option value="entrega" ${customer.receipt==='entrega'?'selected':''}>Entrega</option><option value="retirada" ${customer.receipt==='retirada'?'selected':''}>Retirada na loja 2 — Nature 1</option></select></label><label id="neighborhood-label" for="order-neighborhood" ${customer.receipt==='retirada'?'hidden':''}>Bairro para entrega<input id="order-neighborhood" name="neighborhood" maxlength="120" ${customer.receipt==='entrega'?'required':''} placeholder="Informe seu bairro" value="${esc(customer.neighborhood)}"></label><p id="delivery-note" ${customer.receipt==='retirada'?'hidden':''}>Taxa de entrega: consultar com os atendentes.</p></form>`;}
    else if(step===2){$('#cart-summary').innerHTML='<pre id="order-preview" class="dv-chat-message"></pre>';$('#order-preview').textContent=orderMessage(cart,products,customer);}
    else $('#cart-summary').replaceChildren();
    $('.dv-chat-footer').innerHTML=`${issue?`<p class="dv-chat-error" role="alert">${esc(issue)}</p>`:''}<div class="dv-chat-total"><span>Subtotal estimado</span><strong>${money(cartTotal(cart,products))}</strong></div><p class="dv-chat-disclaimer">Disponibilidade e taxa de entrega a confirmar. Não reserva estoque.</p>${step===0?`<button type="button" class="dv-chat-button" data-chat-next ${!cart.length||issue?'disabled':''}>Continuar para o WhatsApp →</button>`:step===1?`<button type="submit" form="order-form" class="dv-chat-button" ${issue?'disabled':''}>Revisar meu pré-pedido →</button>`:`<button type="button" class="dv-chat-button" data-chat-send ${issue?'disabled':''}>Continuar no WhatsApp →</button>`}${step>0?'<button type="button" class="dv-chat-back" data-chat-back>← Voltar</button>':''}`;
    $('.dv-chat-scroll').scrollTop=0;
  }
  function open(options={}){added=options.added===true;step=0;render();if(!dialog.open)dialog.showModal();}
  launcher.onclick=()=>open();$('[data-chat-close]').onclick=close;
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-chat-continue')){close();return;}
    if(button.hasAttribute('data-chat-next')){step=1;render();}
    if(button.hasAttribute('data-chat-back')){step=Math.max(0,step-1);render();}
    if(button.hasAttribute('data-chat-qty')||button.hasAttribute('data-chat-remove')){
      const cart=structuredClone(getCart()),remove=button.hasAttribute('data-chat-remove'),index=Number(remove?button.dataset.chatRemove:button.dataset.chatQty),item=cart[index];if(!item)return;
      if(remove)cart.splice(index,1);else{const p=getProducts().find(p=>p.id===item.id),limit=stockState(p,item.variant).limit,delta=Number(button.dataset.delta);item.qty=delta>0?Math.min(limit,item.qty+1):item.qty-1;}
      setCart(sanitizeCart(cart.filter(i=>i.qty>0),getProducts()));added=false;update();render();
    }
    if(button.hasAttribute('data-chat-send')){const issue=cartStockIssue(getCart(),getProducts());if(issue){step=0;render();return;}window.open(`https://wa.me/5517996630482?text=${encodeURIComponent(orderMessage(getCart(),getProducts(),customer))}`,'_blank','noopener,noreferrer');}
  });
  dialog.addEventListener('input',event=>{if(['name','neighborhood'].includes(event.target.name)){customer[event.target.name]=event.target.value;event.target.setCustomValidity('');}});
  dialog.addEventListener('change',event=>{if(event.target.name==='receipt'){customer.receipt=event.target.value;const delivery=customer.receipt==='entrega';$('#neighborhood-label').hidden=!delivery;$('#order-neighborhood').required=delivery;$('#delivery-note').hidden=!delivery;$('#order-neighborhood').setCustomValidity('');}});
  dialog.addEventListener('submit',event=>{event.preventDefault();if(event.target.id!=='order-form')return;for(const input of event.target.querySelectorAll('input[required]'))input.setCustomValidity(input.value.trim()?'':'Preencha este campo para continuar.');if(!event.target.reportValidity())return;if(cartStockIssue(getCart(),getProducts())){step=0;render();return;}step=2;render();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  update();return {open,update,refresh(){update();if(dialog.open&&step!==1)render();},close};
}
