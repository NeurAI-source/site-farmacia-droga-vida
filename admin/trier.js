import { client } from './backend.js';
export function mountTrierStatus(member) {
  if(!['admin','owner'].includes(member.role))return;
  const panel=document.createElement('section');panel.className='panel';panel.innerHTML='<h2>Preços e estoque da farmácia</h2><p data-status role="status">Consultando sincronização…</p><button type="button" class="button white">Atualizar agora</button>';
  document.querySelector('#dashboard').prepend(panel);
  const message=panel.querySelector('p'),button=panel.querySelector('button');
  async function action(name){const {data,error}=await client.functions.invoke('trier-api',{body:{action:name}});if(error||data?.error)throw Error();return data;}
  async function refresh(){try{const data=await action('status');message.textContent=!data.enabled?'Integração desativada.':data.finished_at?`Última sincronização: ${new Date(data.finished_at).toLocaleString('pt-BR')}. Atualizados: ${data.summary?.updated||0}. ${data.summary?.errors?'Há itens que precisam de revisão.':''}`:'Aguardando a primeira sincronização.';}catch{message.textContent='Não foi possível consultar a sincronização.';}}
  button.onclick=async()=>{button.disabled=true;message.textContent='Atualizando preços e estoque…';try{const data=await action('sync');await refresh();if(data.status==='cached')message.textContent+=' Aguarde o intervalo de 15 minutos para a próxima atualização.';}catch{message.textContent='A atualização não foi concluída. Os últimos dados foram preservados.';}finally{button.disabled=false;}};
  refresh();
}
