import { normalize } from '../catalog-utils.js';

const ownPrice = (product, variant) => variant?.priceCents ?? product.priceCents;
const codeOf = value => String(value || '').toUpperCase();

function targetsForCode(products, code) {
  const targets = [];
  let legacySizedProduct = false;
  for (const product of products) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length) {
      if (codeOf(product.shortCode) === code) legacySizedProduct = true;
      for (const variant of variants) {
        if (codeOf(variant.shortCode) === code) targets.push({ product, variant });
      }
    } else if (codeOf(product.shortCode) === code) {
      targets.push({ product, variant: null });
    }
  }
  return { targets, legacySizedProduct };
}

export function analyzePrices(input, products) {
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 100 || input.length > 8000) throw Error('Informe de 1 a 100 produtos por lote (até 8.000 caracteres).');
  const rows = lines.map((raw, index) => {
    const row = { line: index + 1, raw, code: '', error: '' };
    const match = raw.match(/^([A-Z0-9._\/-]{1,40})\s*(?:\s|;|=|:)\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)$/i);
    if (!match) return { ...row, error: 'Use código + preço, por exemplo: 001234 19,99.' };
    row.code = match[1].toUpperCase();
    row.priceCents = Math.round(Number(match[2].replace(',', '.')) * 100);
    if (!Number.isSafeInteger(row.priceCents) || row.priceCents < 1 || row.priceCents > 100000000) row.error = 'Preço inválido.';
    const { targets, legacySizedProduct } = targetsForCode(products, row.code);
    if (targets.length !== 1) row.error = targets.length ? 'Código duplicado no catálogo. Corrija o cadastro.' : legacySizedProduct ? 'Este produto tem tamanhos. Use o código reduzido do tamanho.' : 'Código não encontrado.';
    if (targets.length === 1) {
      const { product, variant } = targets[0];
      row.productId = product.id;
      row.variantId = variant?.id ?? null;
      row.variantSize = variant?.size ?? null;
      row.name = variant ? `${product.name} — ${variant.size}` : product.name;
      row.detail = variant ? `Tamanho ${variant.size} · pacote com ${variant.packageQuantity} unidades` : product.detail;
      row.previousCents = ownPrice(product, variant);
    }
    return row;
  });
  const counts = new Map();
  for (const row of rows) if (row.code) counts.set(row.code, (counts.get(row.code) || 0) + 1);
  return rows.map(row => counts.get(row.code) > 1 ? { ...row, error: 'Código repetido neste lote.' } : row);
}

export function applyPrices(catalog, rows) {
  if (!rows.length || rows.some(row => row.error)) throw Error('Corrija todas as linhas antes de confirmar.');
  const next = structuredClone(catalog);
  const seen = new Set();
  for (const row of rows) {
    const product = next.products.find(p => p.id === row.productId);
    if (!product) throw Error('O catálogo mudou. Analise o lote novamente.');
    const key = row.variantId == null ? `p:${row.productId}` : `v:${row.productId}:${row.variantId}`;
    if (seen.has(key)) throw Error('O catálogo mudou. Analise o lote novamente.');
    if (row.variantId != null) {
      const variant = product.variants?.find(v => v.id === row.variantId);
      if (!variant || codeOf(variant.shortCode) !== row.code || ownPrice(product, variant) !== row.previousCents)
        throw Error('O catálogo mudou. Analise o lote novamente.');
      if (!Number.isSafeInteger(row.priceCents) || row.priceCents < 1 || row.priceCents > 100000000) throw Error('Preço inválido.');
      variant.priceCents = row.priceCents;
    } else {
      if (product.variants?.length || codeOf(product.shortCode) !== row.code || product.priceCents !== row.previousCents)
        throw Error('O catálogo mudou. Analise o lote novamente.');
      if (!Number.isSafeInteger(row.priceCents) || row.priceCents < 1 || row.priceCents > 100000000) throw Error('Preço inválido.');
      product.priceCents = row.priceCents;
    }
    seen.add(key);
    product.updatedAt = new Date().toISOString();
  }
  return next;
}

export function catalogCheckup(products) {
  const names = new Map();
  products.forEach(p => { const key = normalize([p.name,p.brand,p.detail].join(' ')).trim(); names.set(key, (names.get(key) || 0) + 1); });
  return products.flatMap(p => {
    const issues = [];
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (variants.length) {
      const missing = variants.filter(v => !v.shortCode).map(v => v.size);
      if (missing.length) issues.push(`Tamanhos sem código reduzido: ${missing.join(', ')}`);
    } else if (!p.shortCode) {
      issues.push('Sem código reduzido');
    }
    if (names.get(normalize([p.name,p.brand,p.detail].join(' ')).trim()) > 1) issues.push('Possível cadastro duplicado: confira apresentação e tamanhos');
    if (p.oldPriceCents > 0 && p.oldPriceCents <= p.priceCents) issues.push('Preço anterior não é maior que o atual');
    return issues.length ? [{ id:p.id, name:p.name, issues }] : [];
  });
}
