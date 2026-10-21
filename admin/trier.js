import { client } from './backend.js';
import { invokeAdminRequest } from './backend-actions.js';
export function mountTrierStatus(member) {
  if(!['admin','owner'].includes(member.role))return;
  const panel=document.createElement('section');panel.className='panel';panel.id='trier-status';panel.innerHTML='<h2>Preços e estoque da farmácia</h2><p data-status role="status">Consultando sincronização…</p><button type="button" class="button white">Atualizar agora</button>';
  document.querySelector('#dashboard').prepend(panel);
  const message=panel.querySelector('p'),button=panel.querySelector('button');
  let timer,tracking=null;
  const action=name=>invokeAdminRequest(client,'trier-api',{body:{action:name}});
  const running=data=>data.run_id && Date.parse(data.lease_until)>Date.now() && (!data.finished_at||Date.parse(data.started_at)>Date.parse(data.finished_at));
  function draw(data){
    if(!data.enabled){message.textContent='Integração desativada.';return;}
    if(running(data)){message.textContent='Atualização em andamento no servidor. Os últimos dados continuam disponíveis.';button.disabled=true;return;}
    button.disabled=false;
    message.textContent=data.finished_at?`Última sincronização: ${new Date(data.finished_at).toLocaleString('pt-BR')}. Atualizados: ${data.summary?.updated||0}. ${data.summary?.errors?'Há itens que precisam de revisão.':''}`:'Aguardando a primeira sincronização.';
  }
  async function refresh(){
    clearTimeout(timer);
    try{
      const data=await action('status');draw(data);
      if(running(data)){tracking??=data.run_id;timer=setTimeout(refresh,3000);}
      else tracking=null;
      return data;
    }catch(error){
      message.textContent=error.requiresLogin?error.message:tracking?'Não foi possível consultar o andamento. A atualização pode continuar no servidor.':'Não foi possível consultar a sincronização. Tente novamente.';
      tracking=null;button.disabled=false;
    }
  }
  button.onclick=async()=>{
    clearTimeout(timer);button.disabled=true;message.textContent='Solicitando atualização…';
    try{
      const data=await action('sync');
      if(data.status==='started'){tracking=data.runId;message.textContent='Atualização iniciada no servidor. Acompanhando o resultado…';timer=setTimeout(refresh,1500);return;}
      const current=await refresh();
      if(data.status==='cached'&&current&&!running(current))message.textContent+=' Aguarde o intervalo de 15 minutos para a próxima atualização.';
    }catch(error){
      // A lost response does not prove failure. Reconcile state, never replay sync.
      const current=await refresh();
      if(!current)message.textContent=error.requiresLogin?error.message:'Não foi possível confirmar a solicitação. Consulte o andamento antes de tentar novamente.';
    }finally{if(!tracking)button.disabled=false;}
  };
  refresh();
}
