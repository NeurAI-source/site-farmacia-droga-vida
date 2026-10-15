export function mountProductImageUpload({ dialog, input, urlField, status, upload, preview }) {
  let busy = false;
  const controls = [input, urlField, ...dialog.querySelectorAll('[type="submit"],#close-editor,#cancel')];
  const show = text => { status.hidden = false; status.textContent = text; };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file || busy) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5242880) {
      show('Use JPG, PNG ou WebP com até 5 MB.'); input.value = ''; return;
    }
    busy = true;
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => control.disabled = true);
    status.setAttribute('aria-busy', 'true');
    show('Enviando imagem… Aguarde para salvar o produto.');
    try {
      const result = await upload(file);
      if (!result?.url || !/^https:\/\/[^\s]+$/.test(result.url)) throw Error('Não foi possível confirmar a imagem enviada. Tente novamente.');
      urlField.value = result.url;
      preview();
      show('Imagem enviada. Confira a prévia e salve o produto.');
    } catch (error) {
      // Keep the previous photo URL and every product field on any upload error.
      show(error.message || 'Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      busy = false;
      controls.forEach((control, i) => control.disabled = disabled[i]);
      status.setAttribute('aria-busy', 'false'); input.value = '';
    }
  };
  return { reset() { if (!busy) { status.hidden = true; status.textContent = ''; } } };
}
