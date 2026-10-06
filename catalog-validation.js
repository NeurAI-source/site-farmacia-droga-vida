export function validateCatalog(data) {
  const fail = () => { throw new Error('Catálogo inválido. Confira produtos, preços, imagens e categorias.'); };
  if (!data || !Array.isArray(data.products) || !Array.isArray(data.categories) || !data.categories.length || data.products.length > 10000) fail();
  const text = (v, max) => typeof v === 'string' && v.length <= max;
  const count = v => Number.isSafeInteger(v) && v >= 0 && v <= 100000000;
  const image = v => text(v, 2048) && (/^https:\/\/[^\s<>"']+$/.test(v) || /^assets\/[\w./-]+\.(png|jpe?g|webp|svg)$/i.test(v) && !v.includes('..'));
  const ids = new Set();
  const shortCodes = new Set();
  const registerCode = raw => {
    if (raw == null || raw === '') return;
    if (!text(raw, 40) || !/^[A-Z0-9._\/-]{1,40}$/i.test(raw)) {
      throw new Error('Código reduzido inválido. Use até 40 letras, números, pontos, traços, barras ou sublinhados, sem espaços.');
    }
    const code = raw.toUpperCase();
    if (shortCodes.has(code)) throw new Error(`Código reduzido repetido: ${raw}. Cada produto ou tamanho precisa ter seu próprio código.`);
    shortCodes.add(code);
  };
  for (const c of data.categories) {
    if (!text(c.name, 160) || !c.name || !Array.isArray(c.subcategories) || !c.subcategories.every(s => text(s.name, 160))) fail();
  }
  for (const p of data.products) {
    if (!count(p.id) || ids.has(p.id) || !text(p.name, 120) || !p.name.trim() || !image(p.imageUrl)
      || !count(p.priceCents) || p.priceCents < 1 || !count(p.oldPriceCents) || !count(p.stockQuantity)
      || !data.categories.some(c => c.name === p.category) || !Array.isArray(p.variants)
      || (p.updatedAt != null && !text(p.updatedAt, 80))
      || !['active','featured','availableStore1','availableStore2'].every(k => typeof p[k] === 'boolean')) fail();
    ids.add(p.id);
    registerCode(p.shortCode || '');
    for (const k of ['brand','detail','badge','subcategory']) if (!text(p[k], 200)) fail();
    const sizes = new Set();
    for (const v of p.variants) {
      if (!Number.isSafeInteger(v.id) || v.id < 0 || !text(v.size, 15) || !v.size.trim() || sizes.has(v.size.toUpperCase()) || !count(v.packageQuantity) || v.packageQuantity < 1 || !count(v.stockQuantity)) fail();
      registerCode(v.shortCode || '');
      if (v.priceCents != null && (!count(v.priceCents) || v.priceCents < 1)) fail();
      sizes.add(v.size.toUpperCase());
    }
  }
  return data;
}
