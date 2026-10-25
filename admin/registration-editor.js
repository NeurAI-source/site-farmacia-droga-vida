import { suggestRegistration,findDuplicates,PENDING_IMAGE } from '../registration-utils.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function confirmProductDuplicates(candidate,products,excludeId,onEdit) {
  const found=findDuplicates(candidate,products,excludeId);
  if(!found.length)return Promise.resolve(true);
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.className='registration-dialog';d.setAttribute('aria-label','Conferir possíveis duplicados');
    d.innerHTML=`<div class="editor-body"><h2>Confira antes de salvar</h2><p>Novo cadastro: <strong>${esc(candidate.name)}</strong> · código ${esc(candidate.shortCode)} · EAN ${esc(candidate.ean)}</p>${found.map(m=>`<article class="registration-comparison"><strong>${esc(m.name)}</strong><p>${esc(m.size||'')} · ${esc(m.reasons.join(', '))}</p><button class="button white" data-open="${m.productId}">Editar existente / conferir variantes</button></article>`).join('')}<p>Códigos e EAN iguais precisam ser revisados no cadastro existente. Nomes semelhantes não são fundidos automaticamente.</p><button class="button white" data-cancel>Cancelar</button>${found.some(m=>m.exact)?'':'<button class="button red" data-separate>Conferi: criar produto separado</button>'}</div>`;
    const finish=answer=>{d.close();d.remove();resolve(answer);};d.querySelector('[data-cancel]').onclick=()=>finish(false);d.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
    d.querySelector('[data-separate]')?.addEventListener('click',()=>finish(true));d.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{finish(false);onEdit(Number(b.dataset.open));});document.body.append(d);d.showModal();
  });
}
export function mountRegistrationEditor({form,dialog,getCatalog,upload,onSearch,preview}) {
  dialog.classList.add('registration-editor');const field=n=>form.elements.namedItem(n);
  const body=form.querySelector('.editor-body'),grid=form.querySelector('.form-grid'),intro=document.createElement('div');intro.className='registration-editor-intro';
  intro.innerHTML='<strong>Cadastro Inteligente 2.0</strong><p>Identifique, confira e salve no rascunho. A publicação continua no fluxo normal.</p><button class="button white" type="button" data-find-trier>Localizar na Trier</button><button class="button white" type="button" data-suggest-fields>Sugerir dados pelo nome</button><p role="status" data-editor-source>Cadastro manual · confira os campos antes de salvar.</p>';
  body.prepend(intro);intro.querySelector('[data-find-trier]').onclick=onSearch;
  const section=(title,description)=>{const s=document.createElement('section');s.className='registration-editor-section';s.innerHTML=`<h3>${title}</h3><p class="muted">${description}</p><div class="form-grid"></div>`;body.append(s);return s;};
  const identity=section('Identificação','Nome, marca e códigos identificam o produto e cada apresentação.');
  const integration=section('Integração Trier','Consultas e sincronização somente leitura da filial 2. A filial 1 não recebe cópia de estoque.');integration.querySelector('.form-grid').innerHTML='<p data-integration-detail>Origem manual. Sem confirmação de estoque da Trier até a sincronização existente.</p>';
  const category=section('Categoria','Sugestões Neur.AI baseadas em termos e atributos disponíveis. Revise antes de aceitar.');
  const image=section('Imagem','Preserve a foto real da embalagem. Tratamento opcional sem recriar rótulos.');
  const pricing=section('Preço e estoque','Por é obrigatório; De é opcional. Descontos e quantidades sincronizadas permanecem vinculados ao código da filial 2.');
  const publication=section('Publicação','Ativação, destaque e visibilidade são revisados antes de publicar.');
  for(const [target,names] of [[identity,['name','brand','shortCode','ean','detail']],[category,['category','subcategory']],[pricing,['oldPrice','price','stockQuantity','badge']]])for(const name of names)target.querySelector('.form-grid').append(field(name).closest('label'));
  const protectedLabel=grid.querySelector('[data-protect-classification]')?.closest('label');if(protectedLabel)category.querySelector('.form-grid').append(protectedLabel);
  image.append(body.querySelector('.image-preview'));
  const oldPublication=[...body.children].find(n=>n.tagName==='FIELDSET');if(oldPublication)publication.append(oldPublication);
  const variants=body.querySelector('#variants'),heading=body.querySelector('.variant-heading'),note=body.querySelector('#diaper-variant-note');
  if(heading)pricing.append(heading);if(note)pricing.append(note);if(variants)pricing.append(variants);
  const remaining=[...grid.children];for(const node of remaining)category.querySelector('.form-grid').append(node);grid.remove();
  intro.querySelector('[data-suggest-fields]').onclick=()=>{
    const s=suggestRegistration({name:field('name').value},getCatalog().categories,getCatalog().products.map(p=>p.brand));
    if(!field('brand').value&&s.brand)field('brand').value=s.brand;if(!field('detail').value&&s.detail)field('detail').value=s.detail;
    // Existing category helper prepares options without persisting until Save.
    [...form.querySelectorAll('button')].find(b=>b.textContent==='Sugerir categoria pelo nome')?.click();
    intro.querySelector('[data-editor-source]').textContent=`Sugestões pelo nome: ${s.name}. ${s.confidence==='review'?'Categoria para revisão manual.':'Confira marca, apresentação e categoria antes de salvar.'}`;
  };
  document.addEventListener('dv-product-edit',e=>{const p=e.detail,t=p.variants?.find(v=>v.trier)?.trier||p.trier;
    intro.querySelector('[data-editor-source]').textContent=t?`Trier · filial ${t.storeId} · código ${t.code} · consultado em ${new Date(t.syncedAt).toLocaleString('pt-BR')}`:'Cadastro manual · confira antes de salvar.';
    integration.querySelector('[data-integration-detail]').textContent=t?`Nome na Trier: ${t.sourceName}. Situação na consulta: ${t.active?'ativo':'inativo'}. Quantidade consultada: ${t.stockQuantity}. A sincronização recorrente mantém o cache público pelo código.`:'Origem manual. Sem confirmação de estoque da Trier até a sincronização existente.';
    if(p.imagePending)intro.querySelector('[data-editor-source]').textContent+=' · Foto pendente: adicione a embalagem real antes de ativar.';
  });
  const camera=document.createElement('label');camera.textContent='Fotografar embalagem (câmera do celular)';const cameraInput=document.createElement('input');cameraInput.type='file';cameraInput.accept='image/*';cameraInput.setAttribute('capture','environment');camera.append(cameraInput);image.append(camera);
  cameraInput.onchange=()=>{if(!cameraInput.files.length)return;const transfer=new DataTransfer();transfer.items.add(cameraInput.files[0]);const input=form.querySelector('#image-upload');input.files=transfer.files;input.dispatchEvent(new Event('change'));cameraInput.value='';};
  const treatment=document.createElement('div');treatment.className='registration-photo-treatment';treatment.innerHTML='<h4>Preparar PNG 1200 × 1200</h4><p>Centraliza a foto completa sobre tela branca, preservando proporção e embalagem. Não remove o fundo original nem etiquetas sobre o rótulo. Tratamento generativo por IA não está configurado.</p><label>Escolher foto para comparar<input type="file" accept="image/jpeg,image/png,image/webp" data-prepare-photo></label><div class="registration-photo-compare" hidden><figure><img data-original alt="Foto original"><figcaption>Original</figcaption></figure><figure><img data-treated alt="Foto preparada"><figcaption>PNG 1200 × 1200</figcaption></figure></div><p role="status" data-photo-status></p><button class="button white" type="button" data-approve-photo hidden>Aprovar e enviar imagem preparada</button>';
  image.append(treatment);let preparedFile=null,urls=[],busy=false,generation=0;
  const clean=()=>{generation++;for(const u of urls)URL.revokeObjectURL(u);urls=[];preparedFile=null;treatment.querySelector('.registration-photo-compare').hidden=true;treatment.querySelector('[data-approve-photo]').hidden=true;treatment.querySelector('[data-photo-status]').textContent='';};
  document.addEventListener('dv-product-edit',clean);
  treatment.querySelector('[data-prepare-photo]').onchange=async e=>{
    const file=e.target.files[0];if(!file||busy)return;
    const status=treatment.querySelector('[data-photo-status]');if(form.querySelector('[aria-busy="true"]')){status.textContent='Aguarde o upload em andamento.';return;}
    clean();status.textContent='Preparando PNG 1200 × 1200…';const requestGeneration=generation;try{if(file.size>5242880||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use JPG, PNG ou WebP de até 5 MB.');
      const bitmap=await createImageBitmap(file);if(requestGeneration!==generation){bitmap.close();return;}if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('Imagem muito grande para tratar neste dispositivo.');}
      const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(1200,1200):document.createElement('canvas');canvas.width=canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,1200);
      const scale=Math.min(1080/bitmap.width,1080/bitmap.height);ctx.drawImage(bitmap,(1200-bitmap.width*scale)/2,(1200-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();
      const blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(requestGeneration!==generation)return;if(!blob||blob.size>5242880)throw Error('Não foi possível gerar PNG dentro do limite de 5 MB.');preparedFile=new File([blob],'produto-1200.png',{type:'image/png'});
      urls=[URL.createObjectURL(file),URL.createObjectURL(blob)];treatment.querySelector('[data-original]').src=urls[0];treatment.querySelector('[data-treated]').src=urls[1];treatment.querySelector('.registration-photo-compare').hidden=false;treatment.querySelector('[data-approve-photo]').hidden=false;status.textContent='Compare a embalagem e aprove antes de enviar. A foto atual foi preservada.';
    }catch(error){status.textContent=error.message;}finally{e.target.value='';}
  };
  treatment.querySelector('[data-approve-photo]').onclick=async()=>{
    if(!preparedFile||busy||form.querySelector('[aria-busy="true"]'))return;busy=true;const controls=[...form.querySelectorAll('input,button,select')],states=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
    const status=treatment.querySelector('[data-photo-status]');status.textContent='Enviando PNG aprovado…';try{const result=await upload(preparedFile);if(!result?.url?.startsWith('https://'))throw Error('Upload não confirmado.');field('imageUrl').value=result.url;preview();status.textContent='PNG aprovado enviado. Salve o produto para confirmar a troca.';}catch(e){status.textContent=e.message;}finally{busy=false;controls.forEach((c,i)=>c.disabled=states[i]);}
  };
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
}
