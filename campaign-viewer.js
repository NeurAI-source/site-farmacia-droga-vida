// Shared flyer viewer: the same contained images and page controls in site and admin preview.
export function createCampaignViewer() {
  const dialog=document.createElement('dialog');dialog.className='campaign-viewer';dialog.setAttribute('aria-labelledby','campaign-viewer-title');
  dialog.innerHTML='<header><h2 id="campaign-viewer-title"></h2><button type="button" data-close aria-label="Fechar encarte">×</button></header><div class="campaign-viewer-stage"><img alt=""></div><footer><button type="button" data-prev aria-label="Página anterior">←</button><span data-page role="status" aria-live="polite"></span><button type="button" data-next aria-label="Próxima página">→</button><button type="button" data-zoom aria-label="Ampliar imagem">Ampliar ＋</button></footer>';
  document.body.append(dialog);
  const img=dialog.querySelector('img'),stage=dialog.querySelector('.campaign-viewer-stage');let current=null,page=0,zoom=false;
  function size(){img.style.width=zoom?`${Math.min(img.naturalWidth||stage.clientWidth,stage.clientWidth-24)*2}px`:'';img.classList.toggle('zoomed',zoom);}
  function draw(){if(!current)return;zoom=false;img.onload=size;img.src=current.pages[page];img.alt=`${current.title} — página ${page+1}`;dialog.querySelector('[data-page]').textContent=`${page+1} de ${current.pages.length}`;dialog.querySelector('[data-prev]').disabled=page===0;dialog.querySelector('[data-next]').disabled=page===current.pages.length-1;dialog.querySelector('[data-zoom]').textContent='Ampliar ＋';size();stage.scrollTo(0,0);}
  function move(delta){if(!current)return;page=Math.max(0,Math.min(current.pages.length-1,page+delta));draw();}
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-prev]').onclick=()=>move(-1);dialog.querySelector('[data-next]').onclick=()=>move(1);
  dialog.querySelector('[data-zoom]').onclick=e=>{zoom=!zoom;size();e.currentTarget.textContent=zoom?'Reduzir −':'Ampliar ＋';};
  dialog.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}});
  dialog.addEventListener('close',()=>{current=null;img.removeAttribute('src');});
  return {update(c){if(current?.id===c.id)current={...c,pages:c.pages?.length?c.pages:[c.cover_url]};},open(c){current={...c,pages:c.pages?.length?c.pages:[c.cover_url]};page=0;dialog.querySelector('h2').textContent=c.title;dialog.showModal();draw();},close(){if(dialog.open)dialog.close();},get id(){return current?.id;},get isOpen(){return dialog.open;}};
}
