import { productPreviews } from './product-media.js';

// Only list/cart images use previews. Detail views keep their original source.
export function productThumbnail(source) {
  const value = String(source || '');
  return new URL(productPreviews[value] || value, import.meta.url).href;
}
