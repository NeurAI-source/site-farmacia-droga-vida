import { config } from './public-config.js';
export function applyInventory(catalog, rows, now = Date.now()) {
  const updated = structuredClone(catalog);
  for (const row of rows) {
    const age = now - Date.parse(row.lastUpdatedAt);
    if (!Number.isFinite(age) || age < -60000 || age > 60 * 60 * 1000) continue;
    const product = updated.products.find(p => p.id === row.productId && p.active);
    const target = row.variantId ? product?.variants?.find(v => v.id === row.variantId) : product;
    if (!target || !Number.isSafeInteger(row.priceCents) || row.priceCents <= 0 || !Number.isFinite(row.stockQuantity) || typeof row.available !== 'boolean') continue;
    target.priceCents = row.priceCents;
    if(Object.hasOwn(row,'regularPriceCents'))target.oldPriceCents=Number.isSafeInteger(row.regularPriceCents)&&row.regularPriceCents>row.priceCents?row.regularPriceCents:null;
    target.stockQuantity = Math.max(0,row.stockQuantity);
    target.trierAvailable = row.available;
    target.trierUpdatedAt = row.lastUpdatedAt;
    // Never retain a crossed-out price below the current integrated price.
    if (target.oldPriceCents <= target.priceCents) target.oldPriceCents = null;
  }
  for (const p of updated.products) {
    const targets=p.variants?.length?p.variants:[p];
    const synced=targets.filter(v=>v.trierUpdatedAt);
    if(synced.length) p.trierStockLabel=synced.some(v=>v.trierAvailable)?'Disponível na unidade de entrega. Confirme a apresentação pelo WhatsApp.':synced.some(v=>v.stockQuantity>0)?'Há estoque na loja 2, mas o pré-pedido está indisponível. Consulte a equipe.':'Sem estoque na unidade de entrega. Consulte a equipe.';
  }
  return updated;
}
export async function loadInventory(catalog) {
  if (!config.url || !config.key) return catalog;
  try {
    const response = await fetch(`${config.url}/functions/v1/trier-api?action=inventory`, {headers:{apikey:config.key},cache:'no-store',signal:AbortSignal.timeout(4000)});
    if (!response.ok) return catalog;
    const data = await response.json();
    return Array.isArray(data.inventory) ? applyInventory(catalog,data.inventory) : catalog;
  } catch { return catalog; }
}
// Refresh only the existing public cache, never call Trier per visitor. Starting
// from the unmodified published catalog also removes expired integration data.
export function startInventoryUpdates(catalog, onUpdate) {
  if (!config.url || !config.key) return () => {};
  let busy=false,stopped=false;
  async function refresh(){
    if(document.hidden||busy||stopped)return;
    busy=true;
    try{const next=await loadInventory(catalog);if(!stopped)onUpdate(next);}finally{busy=false;}
  }
  const timer=setInterval(refresh,60000);
  document.addEventListener('visibilitychange',refresh);
  return ()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
}
