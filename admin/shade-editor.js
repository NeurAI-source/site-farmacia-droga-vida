const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountShadeEditor({form,upload,onModeChange}){
 const mode=document.createElement('label');mode.className='shade-mode';mode.innerHTML='Tipo de variação<select name="variantType"><option value="size">Tamanhos / apresentações</option><option value="shade">Tonalidades de cabelo</option></select><small>Uma linha por marca/produto. Cada tonalidade precisa do seu código e preço. Não reúne cadastros existentes automaticamente.</small>';
 form.querySelector('.variant-heading').before(mode);
 const input=mode.querySelector('select'),isShade=()=>input.value==='shade';
 input.onchange=()=>{sync();onModeChange();};
 function sync(){
  const shade=isShade();form.querySelector('.variant-heading h3').textContent=shade?'Tonalidades de cabelo':'Tamanhos / apresentações';form.querySelector('#add-variant').textContent=shade?'＋ Adicionar tonalidade':'＋ Adicionar tamanho';
  for(const row of form.querySelectorAll('#variants .variant')){
   const label=row.querySelector('[data-field=size]').parentElement;label.firstChild.textContent=shade?'Número da tonalidade':'Tamanho';
   const extra=row.querySelector('.shade-extra');if(extra)extra.hidden=!shade;
   row.querySelector('[data-field=shadeName]').required=shade;
   row.querySelector('[data-field=price]').required=shade;
   row.querySelector('[data-field=price]').parentElement.firstChild.textContent=shade?'Preço da tonalidade (R$)':'Preço do tamanho (R$)';
   const lookup=row.querySelector('[data-variant-lookup]');if(lookup)lookup.textContent=shade?'Consultar tonalidade na Trier':'Consultar tamanho na Trier';
   const qty=row.querySelector('[data-field=packageQuantity]');qty.parentElement.hidden=shade;
   row.querySelector('[data-field=shortCode]').required=shade||form.elements.subcategory.value==='Fraldas';
  }
 }
 function decorate(row,v){
  const extra=document.createElement('div');extra.className='shade-extra';extra.innerHTML=`<label>Nome da cor<input data-field="shadeName" maxlength="80" placeholder="Ex.: Loiro ultraclaro" value="${esc(v.shadeName||'')}"></label><label>EAN da tonalidade — opcional<input data-field="shadeEan" maxlength="14" inputmode="numeric" value="${esc(v.ean||'')}"></label><label>Foto dessa tonalidade — opcional<input data-field="shadeImage" value="${esc(v.imageUrl||'')}" placeholder="URL HTTPS ou assets/…"><input data-shade-upload type="file" accept="image/png,image/jpeg,image/webp"></label><div><img data-shade-preview alt="Prévia da foto da tonalidade" style="width:80px;height:90px;object-fit:contain" hidden><small data-shade-status role="status">Sem foto própria, será usada a imagem geral da linha.</small></div>`;row.append(extra);
  const image=extra.querySelector('[data-field=shadeImage]'),preview=extra.querySelector('img'),status=extra.querySelector('[data-shade-status]'),file=extra.querySelector('[data-shade-upload]');
  function show(){const valid=/^https:\/\/[^\s<>"']+$/.test(image.value)||/^assets\/[\w./-]+\.(png|jpe?g|webp|svg)$/i.test(image.value)&&!image.value.includes('..');preview.hidden=!valid;if(valid)preview.src=/^https:/.test(image.value)?image.value:'../'+image.value;}
  image.oninput=show;show();
  let busy=false;
  file.onchange=async()=>{
   const chosen=file.files?.[0];if(!chosen||busy)return;
   busy=true;file.disabled=true;row.dataset.photoBusy='true';status.textContent='Preparando foto PNG 1200 × 1200…';let bitmap;
   try{
    if(chosen.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(chosen.type))throw Error('Use JPG, PNG ou WebP de até 5 MB.');
    bitmap=await createImageBitmap(chosen);if(bitmap.width*bitmap.height>40000000)throw Error('Imagem muito grande.');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,1200);const scale=Math.min(1080/bitmap.width,1080/bitmap.height);ctx.drawImage(bitmap,(1200-bitmap.width*scale)/2,(1200-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>5*1024*1024)throw Error('A foto preparada ultrapassou 5 MB.');
    if(!row.isConnected||!row.closest('dialog')?.open)return;
    const result=await upload(new File([blob],'tonalidade.png',{type:'image/png'}));
    if(!row.isConnected||!row.closest('dialog')?.open)return;
    image.value=result.url;show();status.textContent='Foto enviada. Confira a prévia e salve o produto para confirmar.';
   }catch(e){if(row.isConnected)status.textContent=e.message||'Falha no envio. Foto anterior preservada.';}
   finally{bitmap?.close();busy=false;file.disabled=false;delete row.dataset.photoBusy;file.value='';}
  };
 }
 return {sync,isShade,decorate,read(row){return {shadeName:row.querySelector('[data-field=shadeName]').value.trim(),ean:row.querySelector('[data-field=shadeEan]').value.trim(),imageUrl:row.querySelector('[data-field=shadeImage]').value.trim()};}};
}
