import { config } from './public-config.js';
import { visibleCampaigns, safeLink } from './campaign-utils.js';
import { createCampaignViewer } from './campaign-viewer.js';
const root=document.querySelector('#campaign-carousel');
if(root && config.url && config.key) mountCampaignCarousel(root);
export function mountCampaignCarousel(root) {
  const viewer=createCampaignViewer();
  const stage=root.querySelector('.campaign-slide'),dots=root.querySelector('.campaign-dots');
  const previous=root.querySelector('[data-campaign-prev]'),next=root.querySelector('[data-campaign-next]'),pause=root.querySelector('[data-campaign-pause]');
  let campaigns=[],index=0,serverAnchor=0,monoAnchor=0,leaseUntil=0,nextStart=Infinity,fetching=false;
  let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,hover=false,focused=false,lastMove=performance.now(),boundaryTimer,fetchTimer,lastIds='',displayKey='';
  const serverNow=()=>serverAnchor+performance.now()-monoAnchor;
  const eligible=()=>performance.now()<leaseUntil?visibleCampaigns(campaigns,serverNow()):[];
  function draw(force=false){
    if(Number.isFinite(nextStart)&&serverNow()>=nextStart){nextStart=Infinity;queueMicrotask(refresh);}
    const list=eligible();root.hidden=!list.length;
    if(viewer.id){const current=list.find(c=>c.id===viewer.id);if(current)viewer.update(current);else viewer.close();}
    if(!list.length){stage.replaceChildren();dots.replaceChildren();displayKey='';lastIds='';scheduleBoundary();return;}
    index=Math.min(index,list.length-1);const c=list[index],ids=list.map(c=>c.id).join(',');
    if(ids!==lastIds){dots.replaceChildren(...list.map((item,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`Oferta ${i+1}: ${item.title}`);b.onclick=()=>{paused=true;index=i;draw(true);};return b;}));lastIds=ids;}
    const key=[c.id,c.version,c.cover_url].join(':');
    if(force||displayKey!==key){
      let content=document.createElement(c.kind==='post'&&c.link_url?'a':'button');
      if(content.tagName==='A'){try{content.href=safeLink(c.link_url);}catch{content.removeAttribute('href');}content.target='_blank';content.rel='noopener noreferrer';}
      else {content.type='button';content.onclick=()=>{paused=true;viewer.open(c);draw();};}
      content.className='campaign-art';content.setAttribute('aria-label',c.kind==='flyer'?`Abrir encarte: ${c.title}`:c.title);
      const img=document.createElement('img');img.src=c.cover_url;img.alt=c.title;img.decoding='async';content.append(img);
      stage.replaceChildren(content);root.querySelector('.campaign-name').textContent=c.title;
      root.querySelector('.campaign-hint').textContent=c.kind==='flyer'?`${c.pages.length} páginas · Toque para abrir e ampliar`:c.link_url?'Toque para saber mais':'Toque para ampliar';displayKey=key;
    }
    [...dots.children].forEach((b,i)=>b.setAttribute('aria-current',String(i===index)));
    previous.disabled=next.disabled=list.length<2;pause.hidden=list.length<2;
    pause.textContent=paused?'▶ Reproduzir':'Ⅱ Pausar';pause.setAttribute('aria-label',paused?'Reproduzir carrossel':'Pausar carrossel');
    scheduleBoundary();
  }
  function scheduleBoundary(){clearTimeout(boundaryTimer);const now=serverNow();const times=campaigns.map(c=>Date.parse(c.ends_at)-now);times.push(leaseUntil-performance.now(),nextStart-now);const delay=Math.min(...times.filter(t=>t>0),2147483647);if(delay<2147483647)boundaryTimer=setTimeout(()=>{draw();if(serverNow()>=nextStart){nextStart=Infinity;refresh();}},Math.max(1,delay));}
  function move(delta,manual=true){const list=eligible();if(!list.length)return;if(manual)paused=true;index=(index+delta+list.length)%list.length;lastMove=performance.now();draw(true);}
  previous.onclick=()=>move(-1);next.onclick=()=>move(1);
  pause.onclick=()=>{paused=!paused;if(!paused){focused=false;hover=false;}lastMove=performance.now();draw();};
  root.addEventListener('pointerenter',()=>hover=true);root.addEventListener('pointerleave',()=>hover=false);
  root.addEventListener('focusin',()=>focused=true);root.addEventListener('focusout',e=>focused=root.contains(e.relatedTarget));
  root.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-campaign-pause]')){paused=true;draw();}});
  root.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}});
  async function refresh(){
    if(fetching)return;fetching=true;clearTimeout(fetchTimer);const sent=performance.now();
    try{
      const url=new URL(`${config.url}/functions/v1/campaign-api`);url.searchParams.set('action','public');url.searchParams.set('_',String(Date.now()));
      const response=await fetch(url,{headers:{apikey:config.key},cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error();const data=await response.json();
      if(!Number.isFinite(Date.parse(data.server_now))||!Array.isArray(data.campaigns))throw Error();
      // Age the response by the whole round trip: expiration can be slightly early, never late.
      serverAnchor=Date.parse(data.server_now)+(performance.now()-sent);monoAnchor=performance.now();
      root.dataset.campaignState='ready';campaigns=data.campaigns;leaseUntil=sent+Math.min(Number(data.lease_ms)||0,60000);nextStart=Date.parse(data.next_start)||Infinity;
      draw();
    }catch{draw();}finally{fetching=false;fetchTimer=setTimeout(refresh,20000);}
  }
  // Timers may be suspended in background tabs. Hide first on restore, then revalidate.
  function restore(){if(document.hidden)return;leaseUntil=0;viewer.close();draw();refresh();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){root.hidden=true;viewer.close();}else restore();});
  window.addEventListener('pageshow',e=>{if(e.persisted)restore();});window.addEventListener('online',restore);
  setInterval(()=>{draw();if(!paused&&!hover&&!focused&&!document.hidden&&!viewer.isOpen&&performance.now()-lastMove>=5000)move(1,false);},250);
  refresh();return {refresh};
}
