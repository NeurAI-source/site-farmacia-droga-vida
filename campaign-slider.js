import { safeLink } from './campaign-utils.js';

// A perspective ring with bounded, recycled cards; the sequence itself has no fixed length.
export function createLoopSlider(stage, { onChange, onActivate, onInteraction, motion, setImage = (image, source) => { image.src = source; } }) {
  const viewport=document.createElement('div'),track=document.createElement('div');
  viewport.className='campaign-viewport';track.className='campaign-track';viewport.append(track);stage.replaceChildren(viewport);
  let items=[],index=0,signature='',gesture=null,animation=null,phase=0,frame=0,fallback=0,suppressClickUntil=0;
  let width=1,radiusX=1,radiusZ=1;
  const wrap=i=>(i+items.length)%items.length;
  const center=()=>Math.floor(track.children.length/2);
  function measure(){width=viewport.clientWidth;radiusX=Math.min(width*.56,410);radiusZ=viewport.clientHeight*.72;}
  function render(panel,campaign,active){
    const key=[campaign.id,campaign.version,campaign.cover_id,campaign.kind,campaign.link_url].join(':');
    if(panel.dataset.key!==key){
      const linked=campaign.kind==='post'&&campaign.link_url,art=document.createElement(linked?'a':'button');
      art.className='campaign-art';art.draggable=false;art.setAttribute('aria-label',campaign.kind==='flyer'?`Abrir encarte: ${campaign.title}`:campaign.title);
      if(linked){try{art.href=safeLink(campaign.link_url);}catch{art.removeAttribute('href');}art.target='_blank';art.rel='noopener noreferrer';}
      else{art.type='button';art.onclick=()=>onActivate(items[index]);}
      const img=document.createElement('img');setImage(img,campaign.cover_url);img.alt=campaign.title;img.decoding='async';img.draggable=false;art.append(img);panel.replaceChildren(art);panel.dataset.key=key;
    }
    panel.setAttribute('aria-hidden',String(!active));panel.inert=!active;panel.firstElementChild.tabIndex=active?0:-1;
  }
  function pose(value){
    phase=value;track.dataset.phase=String(value);
    const step=360/Math.max(3,track.children.length);
    [...track.children].forEach((panel,i)=>{
      const angle=items.length===1?0:(i-center()+value)*step,radians=angle*Math.PI/180;
      const sine=Math.sin(radians),cosine=Math.cos(radians);
      panel.style.transform=`translate(-50%,-50%) translate3d(${sine*radiusX}px,0,${(cosine-1)*radiusZ}px) rotateY(${-sine*52}deg)`;
    });
  }
  function paint(){[...track.children].forEach((panel,i)=>render(panel,items[wrap(index+(items.length>1?i-center():0))],items.length===1||i===center()));pose(0);}
  function finish(){
    if(!animation)return;const {delta,target}=animation;animation=null;cancelAnimationFrame(frame);frame=0;clearTimeout(fallback);
    if(delta>0)track.append(track.firstElementChild);else if(delta<0)track.prepend(track.lastElementChild);
    index=target;paint();stage.classList.remove('is-moving');onChange();
  }
  function animate(delta,target=wrap(index+delta)){
    if(animation||items.length<2)return;
    if(delta)render(track.children[center()+delta],items[target],false);
    const duration=motion.matches?0:delta?620:240;
    animation={delta,target,start:performance.now(),from:phase,to:-delta};stage.classList.add('is-moving');
    if(!duration){finish();return;}
    function tick(now){
      if(!animation)return;const p=Math.min(1,(now-animation.start)/duration),eased=1-Math.pow(1-p,3);
      pose(animation.from+(animation.to-animation.from)*eased);
      if(p===1)finish();else frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);fallback=setTimeout(finish,duration+100);
  }
  function resetGesture(){cancelAnimationFrame(frame);frame=0;const old=gesture;gesture=null;if(old&&stage.hasPointerCapture(old.id))stage.releasePointerCapture(old.id);}
  stage.addEventListener('dragstart',e=>e.preventDefault());
  stage.addEventListener('click',e=>{if(animation||gesture?.horizontal||performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  stage.addEventListener('pointerdown',e=>{
    if(!e.isPrimary||e.button!==0||items.length<2||animation)return;measure();
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,width:Math.min(width*.72,410),horizontal:false,lastX:e.clientX,lastTime:performance.now(),velocity:0};onInteraction();
  });
  globalThis.addEventListener('pointermove',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(!gesture.horizontal){if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;if(Math.abs(dy)>Math.abs(dx)){resetGesture();onInteraction();return;}gesture.horizontal=true;stage.setPointerCapture(e.pointerId);stage.classList.add('is-moving');}
    if(e.cancelable)e.preventDefault();const now=performance.now(),elapsed=now-gesture.lastTime;if(elapsed>0)gesture.velocity=(e.clientX-gesture.lastX)/elapsed;
    gesture.lastX=e.clientX;gesture.lastTime=now;gesture.dx=Math.max(-gesture.width,Math.min(gesture.width,dx));
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(gesture)pose(gesture.dx/gesture.width);});
  });
  function release(e,cancelled=false){
    if(!gesture||gesture.id!==e.pointerId)return;const drag=gesture;
    if(drag.horizontal){pose(drag.dx/drag.width);suppressClickUntil=performance.now()+400;}resetGesture();
    if(drag.horizontal){const flick=performance.now()-drag.lastTime<100&&Math.abs(drag.velocity)>.45&&Math.abs(drag.dx)>16;
      const commit=!cancelled&&(Math.abs(drag.dx)>Math.min(100,drag.width*.18)||flick);animate(commit?(drag.dx<0?1:-1):0);}
    onInteraction();
  }
  globalThis.addEventListener('pointerup',e=>release(e));globalThis.addEventListener('pointercancel',e=>release(e,true));
  stage.addEventListener('lostpointercapture',e=>{if(e.target===stage)release(e,true);});
  const resize=new ResizeObserver(()=>{measure();pose(phase);});resize.observe(viewport);
  return{
    setItems(list){const next=list.map(c=>[c.id,c.version,c.cover_id,c.kind,c.link_url].join(':')).join('|'),oldId=items[index]?.id;items=list;if(signature===next)return;
      signature=next;resetGesture();clearTimeout(fallback);animation=null;stage.classList.remove('is-moving');viewport.classList.toggle('is-single',items.length<2);
      const retained=items.findIndex(c=>c.id===oldId);index=retained<0?Math.min(index,Math.max(0,items.length-1)):retained;
      const count=items.length===2?3:Math.min(9,items.length);
      track.replaceChildren(...Array.from({length:count},()=>{const panel=document.createElement('div');panel.className='campaign-panel';return panel;}));measure();if(items.length)paint();
    },
    move(delta){if(items.length>1)animate(delta);},
    goTo(target){if(target===index||animation||gesture||target<0||target>=items.length)return;const forward=wrap(target-index),backward=wrap(index-target);animate(forward<=backward?1:-1,target);},
    get index(){return index;},get busy(){return !!gesture||!!animation;},
  };
}
