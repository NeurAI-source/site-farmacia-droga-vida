import { normalize } from './catalog-utils.js';
import { sortCatalogProducts } from './product-order.js';

const words = value => normalize(value || '').match(/[\p{L}\p{N}]+/gu) || [];

// Autocomplete matches word beginnings, not accidental fragments such as
// "ni" inside "unidades". Name/brand matches precede descriptive metadata.
export function suggestProducts(products, query) {
  const terms = words(query);
  if (!terms.length || terms.join('').length < 2) return [];
  const scored = sortCatalogProducts(products.filter(p => p.active), 'brand').map(product => {
    const primary = words([product.name, product.brand].filter(Boolean).join(' '));
    const secondary = words([product.detail, product.category, product.subcategory].filter(Boolean).join(' '));
    let score = 0;
    for (const term of terms) {
      if (primary.some(word => word.startsWith(term))) score += 2;
      else if (secondary.some(word => word.startsWith(term))) score += 1;
      else return null;
    }
    return {product, score};
  }).filter(Boolean);
  return scored.sort((a, b) => b.score - a.score).slice(0, 5).map(row => row.product);
}
