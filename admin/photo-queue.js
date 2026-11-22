import { isPhotoPending, matchPhotoFilename } from '../photo-queue-utils.js';

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const maxFiles=30,maxBytes=5242880;
  async function png1200(file){
    let source,temporary;
    try{
      if(typeof createImageBitmap==='function')source=await createImageBitmap(file);
      else{
        temporary=URL.createObjectURL(file);
        source=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=temporary;});
      }
      const width=source.width,height=source.height;
      if(!width||!height||width*height>40000000)throw Error('Foto muito grande ou inválida.');
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw Error('Este navegador não conseguiu preparar a foto.');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1200,1200);
      const scale=Math.min(1080/width,1080/height);
      const w=Math.round(width*scale),h=Math.round(height*scale);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(source,(1200-w)/2,(1200-h)/2,w,h);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob||blob.size>maxBytes)throw Error('Imagem final acima de 5 MB. Use uma foto menor.');
      const name=String(file.name||'produto').replace(/\.[^.]+$/,'').slice(0,60);
      return new File([blob],`${name}.png`,{type:'image/png'});
    }finally{source?.close?.();if(temporary)URL.revokeObjectURL(temporary);}
  }
  function mountPhotoQueue({getCatalog,reload,save,upload,notify,onEdit,setView}){
    const root=document.createElement('section');root.id='photo-queue-view';root.className='view';root.hidden=true;
    root.innerHTML=`<section class="panel photo-queue">
       <p class="eyebrow">NEUR.AI · CADASTRO</p><h2>Central de fotos dos produtos</h2>
       <p>Envie até 30 fotos por vez. O sistema tenta identificar o produto pelo código reduzido ou EAN escrito no nome do arquivo. Você confere tudo antes de vincular.</p>
       <div class="photo-queue-toolbar"><strong data-pending-count>—</strong><label class="button white photo-picker">Selecionar fotos <input type="file" accept="image/png,image/jpeg,image/webp" multiple data-files></label>
       <button type="button" class="button white" data-prepare>Preparar fotos 1200 × 1200</button>
       <button type="button" class="button red" data-attach>Vincular fotos aprovadas</button></div>
       <p class="muted" role="status" data-photo-status>Escolha imagens com a embalagem correta.</p>
       <p class="muted">O tratamento adiciona margens brancas, centraliza e converte para PNG. Não remove fundos complexos, não apaga etiquetas e não altera textos, marcas ou rótulos. Imagens já existentes não são substituídas por este processo.</p>
       <div data-photo-list class="photo-queue-list"></div>
       <div class="photo-pending-list"><h3>Produtos aguardando foto</h3><div data-pending-list></div></div>
     </section>`;
    document.querySelector('main footer').before(root);
    const $=selector=>root.querySelector(selector);
    let entries=[],busy=false;
    const products=()=>getCatalog()?.products||[];
    const pending=()=>products().filter(isPhotoPending);
    const status=text=>$('[data-photo-status]').textContent=text;
    const lock=value=>{busy=value;root.querySelectorAll('button,input,select').forEach(c=>c.disabled=value);};
    function release(){for(const entry of entries){if(entry.originalUrl)URL.revokeObjectURL(entry.originalUrl);if(entry.finalUrl)URL.revokeObjectURL(entry.finalUrl);}entries=[];}
    function draw(){
      const todo=pending();
      $('[data-pending-count]').textContent=`${todo.length} produtos com foto pendente`;
      $('[data-pending-list]').innerHTML=todo.length?todo.slice(0,40).map(p=>`<button class="text-button" data-open-product="${p.id}" type="button">${esc(p.name)} · ${esc(p.shortCode||(p.variants||[])[0]?.shortCode||'sem código')}</button>`).join('')+(todo.length>40?`<p>Mais ${todo.length-40} produtos nesta fila.</p>`:''):'<p>Nenhum produto com foto pendente.</p>';
      const options=todo.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(p.shortCode||p.ean||'sem código')}</option>`).join('');
      $('[data-photo-list]').innerHTML=entries.map((e,i)=>`<article class="photo-queue-row" data-entry="${i}">
          <div class="photo-queue-images"><figure><img src="${esc(e.originalUrl)}" alt="Foto enviada"><figcaption>Original</figcaption></figure>
          ${e.finalUrl?`<figure><img src="${esc(e.finalUrl)}" alt="Foto preparada, 1200 por 1200"><figcaption>PNG preparado · 1200 × 1200</figcaption></figure>`:'<p class="muted">Aguardando preparação</p>'}</div>
          <div class="photo-queue-fields"><strong>${esc(e.file.name)}</strong><label>Vincular ao produto
            <select data-product-index="${i}"><option value="">Escolher produto</option>${options}</select></label>
          <label><input type="checkbox" data-approve-index="${i}" ${e.approved?'checked':''} ${e.finalUrl?'':'disabled'}> Conferi a foto e a embalagem</label>
          <small>${esc(e.error||(!e.productId?'Não foi possível identificar pelo nome do arquivo; selecione manualmente.':'Confira se o produto corresponde à imagem.'))}</small></div></article>`).join('')||'<p>Nenhuma foto selecionada.</p>';
      for(const [i,e] of entries.entries()){const sel=root.querySelector(`[data-product-index="${i}"]`);if(sel)sel.value=todo.some(p=>p.id===e.productId)?String(e.productId):'';}
      $('[data-prepare]').disabled=busy||!entries.length;
      $('[data-attach]').disabled=busy||!entries.some(e=>e.finalUrl&&e.approved&&e.productId);
    }
    $('[data-files]').onchange=event=>{
      const files=Array.from(event.target.files||[]);
      release();
      if(files.length>maxFiles||files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>maxBytes)){
        status('Selecione até 30 arquivos JPG, PNG ou WebP, cada um com no máximo 5 MB.');event.target.value='';draw();return;
      }
      const todo=pending();
      entries=files.map(file=>({file,originalUrl:URL.createObjectURL(file),finalUrl:null,prepared:null,approved:false,productId:matchPhotoFilename(file.name,todo)?.id||null,error:''}));
      status(`${entries.length} fotos adicionadas. Prepare e confira uma por uma.`);
      draw();
    };
    root.addEventListener('change',event=>{
      const el=event.target;
      if(el.dataset.productIndex!=null){
        const entry=entries[Number(el.dataset.productIndex)];if(entry){entry.productId=Number(el.value)||null;entry.approved=false;draw();}
      }
      if(el.dataset.approveIndex!=null){const entry=entries[Number(el.dataset.approveIndex)];if(entry){entry.approved=el.checked;draw();}}
    });
    root.addEventListener('click',event=>{
      const btn=event.target.closest('[data-open-product]');
      if(btn){setView('products');onEdit(Number(btn.dataset.openProduct));}
    });
    $('[data-prepare]').onclick=async()=>{
      if(busy||!entries.length)return;
      lock(true);
      try{
        for(let i=0;i<entries.length;i++){
          const entry=entries[i];if(entry.prepared)continue;
          status(`Preparando foto ${i+1} de ${entries.length}…`);
          try{entry.prepared=await png1200(entry.file);entry.finalUrl=URL.createObjectURL(entry.prepared);entry.error='';}
          catch(error){entry.error=error.message||'Erro ao preparar imagem.';}
        }
        status('Prévia pronta. Confira as embalagens e marque somente as imagens corretas.');
      }finally{lock(false);draw();}
    };
    $('[data-attach]').onclick=async()=>{
      if(busy)return;
      const accepted=entries.filter(e=>e.prepared&&e.approved&&e.productId);
      if(!accepted.length)return status('Marque e associe pelo menos uma foto preparada.');
      if(new Set(accepted.map(e=>e.productId)).size!==accepted.length)return status('Cada produto pode receber apenas uma foto por operação.');
      if(!confirm(`Vincular ${accepted.length} fotos revisadas aos respectivos produtos? Os cadastros continuarão em rascunho até você publicar.`))return;
      lock(true);
      try{
        await reload();
        const before=products(),toEdit=new Map();
        for(const entry of accepted){
          const p=before.find(p=>p.id===entry.productId);
          if(!isPhotoPending(p))throw Error('Um produto deixou de ter foto pendente. Recarregue e confira antes de continuar.');
        }
        for(let i=0;i<accepted.length;i++){
          const entry=accepted[i];status(`Enviando foto ${i+1} de ${accepted.length}…`);
          const result=await upload(entry.prepared);
          if(!result?.url||!/^https:\/\/[^\s]+$/.test(result.url))throw Error('O envio da imagem não foi confirmado.');
          toEdit.set(entry.productId,result.url);
        }
        const next=structuredClone(getCatalog());
        for(const p of next.products){
          if(!toEdit.has(p.id))continue;
          if(!isPhotoPending(p))throw Error('Foto alterada por outro usuário; nada foi salvo.');
          p.imageUrl=toEdit.get(p.id);p.imagePending=false;p.updatedAt=new Date().toISOString();
        }
        await save(next);
        await reload();
        release();$('[data-files]').value='';draw();
        status(`${toEdit.size} fotos vinculadas ao rascunho. Confira os produtos e publique pelo fluxo normal.`);
        notify(`${toEdit.size} fotos vinculadas ao rascunho.`);
      }catch(error){status(`Nenhuma associação foi confirmada nesta operação: ${error.message}. Se houve upload, os arquivos permanecerão no armazenamento para auditoria.`);}
      finally{lock(false);draw();}
    };
    return {show:draw};
  }

export { mountPhotoQueue };
