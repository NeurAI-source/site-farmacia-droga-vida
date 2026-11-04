import { priceInfo, money } from './catalog-utils.js';
import { suggestProducts } from './search-suggestions-utils.js';
import { productThumbnail } from './product-images.js';

// Read the already loaded public catalog/cache; typing never calls the ERP.
export function mountSearchSuggestions({ input, form, list, status, getProducts, onSelect }) {
  const host = form.parentElement;
  let matches = [], selected = -1, composing = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('autocomplete', 'off');
  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    status.textContent = '';
    selected = -1;
  }
  function highlight(index) {
    selected = index;
    for (const [i, option] of [...list.querySelectorAll('[role=option]')].entries()) {
      option.setAttribute('aria-selected', String(i === index));
      if (i === index) {
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({block:'nearest'});
      }
    }
  }
  function choose(index) {
    const product = getProducts().find(p => p.id === matches[index]?.id && p.active);
    close();
    if (product) onSelect(product);
  }
  function update() {
    if (composing || document.activeElement !== input || input.value.trim().length < 2) { close(); return; }
    matches = suggestProducts(getProducts(), input.value);
    selected = -1;
    input.removeAttribute('aria-activedescendant');
    list.replaceChildren();
    for (const [index, product] of matches.entries()) {
      const option = document.createElement('button');
      option.type = 'button'; option.className = 'search-suggestion'; option.tabIndex = -1;
      option.id = `${list.id}-${index}`; option.dataset.index = String(index);
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      const photo = document.createElement('img');
      photo.src = productThumbnail(product.imageUrl); photo.alt = ''; photo.width = photo.height = 52;
      photo.onerror = () => { photo.onerror = null; photo.src = new URL('assets/product-pending.svg', import.meta.url).href; };
      const copy = document.createElement('span'); copy.className = 'search-suggestion-copy';
      const name = document.createElement('strong'); name.textContent = product.name;
      const details = document.createElement('small'); details.textContent = [product.brand, product.detail].filter(Boolean).join(' · ');
      const price = document.createElement('span'); price.className = 'search-suggestion-price';
      const info = priceInfo(product); price.textContent = `${info.from ? 'A partir de ' : ''}${money(info.priceCents)}`;
      copy.append(name, details, price); option.append(photo, copy); list.append(option);
    }
    if (!matches.length) {
      const empty = document.createElement('p'); empty.className = 'search-suggestions-empty';
      empty.textContent = 'Nenhum produto encontrado.'; empty.setAttribute('role','presentation'); list.append(empty);
    }
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    status.textContent = matches.length ? `${matches.length} sugestões. Use as setas para escolher ou Enter para ver todos os resultados.` : 'Nenhum produto encontrado.';
  }
  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('click', update);
  input.addEventListener('blur', close);
  input.addEventListener('compositionstart', () => { composing = true; close(); });
  input.addEventListener('compositionend', () => { composing = false; update(); });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing) return;
    if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) update();
      if (!matches.length || list.hidden) return;
      event.preventDefault(); highlight(event.key === 'ArrowDown' ? (selected + 1) % matches.length : (selected < 0 ? matches.length - 1 : (selected - 1 + matches.length) % matches.length));
    } else if (event.key === 'Enter' && !list.hidden && selected >= 0) {
      event.preventDefault(); choose(selected);
    }
  });
  list.addEventListener('pointerdown', event => { if (event.target.closest('[role=option]')) event.preventDefault(); });
  list.addEventListener('click', event => {
    const option = event.target.closest('[role=option]'); if (option) choose(Number(option.dataset.index));
  });
  host.addEventListener('focusout', () => queueMicrotask(() => { if (!host.contains(document.activeElement)) close(); }));
  document.addEventListener('pointerdown', event => { if (!host.contains(event.target)) close(); });
  form.addEventListener('submit', close);
  close();
  return {close, refresh() { if (!list.hidden) update(); }};
}
