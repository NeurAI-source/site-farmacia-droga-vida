import {variantImage} from './product-variants.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function photoCredit(p,key='',links=true){
 const variant=p?.variants?.find(v=>v.size===key),target=variant?.imageUrl&&variantImage(p,key)===variant.imageUrl?variant:p,review=target?.photoReview,s=review?.source;
 if(s?.provider!=='open-beauty-facts'||!/^\d{8,14}$/.test(String(s.ean||'')))return '';
 const source='https://world.openbeautyfacts.org/product/'+s.ean,license='https://creativecommons.org/licenses/by-sa/3.0/',author=esc(s.attribution||'Open Beauty Facts e colaboradores');
 return `<small class="photo-credit" style="display:block;font-size:11px;line-height:1.4;color:#555;overflow-wrap:anywhere">Foto: ${author} · ${links?`<a href="${source}" target="_blank" rel="noopener noreferrer">Open Beauty Facts</a> · <a href="${license}" target="_blank" rel="license noopener noreferrer">CC BY-SA 3.0</a>`:'Open Beauty Facts · CC BY-SA 3.0'}${review.processing?' · Recorte / enquadramento e fundo branco.':''}</small>`;
}
