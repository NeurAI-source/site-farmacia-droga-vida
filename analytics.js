import { config } from './public-config.js';
const preferenceKey='dv-analytics-consent';let sent=false;
function preference(){try{return localStorage.getItem(preferenceKey);}catch{return 'denied';}}
function record(){
 if(sent||preference()!=='granted'||!config.url||!config.key)return;sent=true;
 try{const previous=JSON.parse(sessionStorage.getItem('dv-visit')||'null');const id=previous&&Date.now()-previous.time<1800000?previous.id:crypto.randomUUID();sessionStorage.setItem('dv-visit',JSON.stringify({id,time:Date.now()}));fetch(`${config.url}/functions/v1/page-view`,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},body:JSON.stringify({id}),keepalive:true}).catch(()=>{});}catch{}
}
function choose(value){try{localStorage.setItem(preferenceKey,value);if(value==='denied')sessionStorage.removeItem('dv-visit');}catch{}document.querySelector('.statistics-choice')?.remove();if(value==='granted')record();}
function showChoice(){
 if(document.querySelector('.statistics-choice'))return;
 const panel=document.createElement('aside');panel.className='statistics-choice';panel.setAttribute('aria-label','Preferência de estatísticas');const text=document.createElement('p');text.textContent='Podemos contar sua visita para melhorar o site? As estatísticas são opcionais e não incluem seu pedido.';const controls=document.createElement('div');
 for(const [label,value]of [['Não permitir','denied'],['Permitir','granted']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>choose(value);controls.append(button);}panel.append(text,controls);document.body.append(panel);
}
if(!location.pathname.includes('/admin')){if(preference()==='granted')record();else if(!preference())showChoice();document.addEventListener('dv-statistics-choice',showChoice);}
