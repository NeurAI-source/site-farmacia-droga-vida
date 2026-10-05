import { normalize } from '../catalog-utils.js';

export function analyzePrices(input, products) {
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 100 || input.length > 8000) throw Error('Informe de 1 a 100 produtos por lote (até 8.000 caracteres).');
  const rows = lines.map((raw, index) => {
    const row = { line: index + 1, raw, code: '', error: '' };
    // Delimiters are explicit so a malformed price never becomes a different code.
    const match = raw.match(/^([A-Z0-9._\/-]{1,40})\s*(?:\s|;|=|:)\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)$/i);
    if (!match) return { ...row, error: 'Use código + preço, por exemplo: 001234 19,99.' };
    row.code = match[1].toUpperCase();
    row.priceCents = Math.round(Number(match[2].replace(',', '.')) * 100);
    if (!Number.isSafeInteger(row.priceCents) || row.priceCents < 1 || row.priceCents > 100000000) row.error = 'Preço inválido.';
    const matches = products.filter(p => (p.shortCode || '').toUpperCase() === row.code);
    if (matches.length !== 1) row.error = matches.length ? 'Código duplicado no catálogo. Corrija o cadastro.' : 'Código não encontrado.';
    if (matches.length === 1) {
      row.productId = matches[0].id;
      row.name = matches[0].name;
      row.detail = matches[0].detail;
      if (matches[0].variants?.length) row.error = 'Este código tem tamanhos com preço compartilhado. Revise no cadastro individual.';
      row.previousCents = matches[0].priceCents;
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
    if (!product || seen.has(row.productId) || (product.shortCode || '').toUpperCase() !== row.code || product.priceCents !== row.previousCents)
      throw Error('O catálogo mudou. Analise o lote novamente.');
    if (!Number.isSafeInteger(row.priceCents) || row.priceCents < 1 || row.priceCents > 100000000) throw Error('Preço inválido.');
    seen.add(row.productId);
    product.priceCents = row.priceCents;
    product.updatedAt = new Date().toISOString();
  }
  return next;
}

export function catalogCheckup(products) {
  const names = new Map();
  products.forEach(p => { const key = normalize([p.name,p.brand,p.detail].join(' ')).trim(); names.set(key, (names.get(key) || 0) + 1); });
  return products.flatMap(p => {
    const issues = [];
    if (!p.shortCode) issues.push('Sem código reduzido');
    if (names.get(normalize([p.name,p.brand,p.detail].join(' ')).trim()) > 1) issues.push('Possível cadastro duplicado: confira apresentação e tamanhos');
    if (p.oldPriceCents > 0 && p.oldPriceCents <= p.priceCents) issues.push('Preço anterior não é maior que o atual');
    return issues.length ? [{ id:p.id, name:p.name, issues }] : [];
  });
}
