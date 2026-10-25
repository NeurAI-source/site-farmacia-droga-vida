import { normalize } from './catalog-utils.js';

// Some ERP records put the manufacturer in brand. Recognize the commercial
// labels present in product names without changing their stored data.
export const commercialBrands = [
  ['Sempre Livre'], ['Always'], ['Intimus'], ['Carefree'], ['Diana'],
  ['Babysec'], ['Pampers'], ['Huggies'], ['Pom Pom'], ['Toquinho de Gente'],
  ['Giovanna Baby','Giovan Baby'], ['Dermacyd'], ['Dove'], ['Nivea'],
  ['Risqué','Risque'], ['Colorama'], ['Impala'], ['Rexona'], ['Colgate'],
  ['Oral B','Oral-B'], ['Johnson','Johnsons'], ['Granado'], ['Bepantol'],
  ['Nutren'], ['Ensure'], ['Ninho'], ['Nan'], ['Aptamil'], ['Neslac'], ['Lavitan'], ['Cimed']
];
const key=value=>normalize(value||'').replace(/[^a-z0-9]+/g,' ').trim();
const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
export function sortCatalogProducts(products,by='brand') {
  if(by==='brand')return orderProductsByBrand(products);
  if(!['name','category','price','createdAt','updatedAt'].includes(by))return [...products];
  return [...products].sort((a,b)=>by==='price'?a.priceCents-b.priceCents:by==='createdAt'||by==='updatedAt'?String(b[by]||'').localeCompare(String(a[by]||'')):collator.compare(a[by]||'',b[by]||'')||collator.compare(a.name||'',b.name||''));
}
export function orderProductsByBrand(products) {
  const candidates=new Map();
  for(const aliases of commercialBrands)for(const alias of aliases)candidates.set(key(alias),key(aliases[0]));
  for(const p of products){const brand=key(p.brand);if(brand&&!candidates.has(brand))candidates.set(brand,brand);}
  const brandOf=p=>{
    const name=` ${key(p.name)} `,matches=new Set();
    for(const [alias,brand] of candidates)if(name.includes(` ${alias} `))matches.add(brand);
    // Kits naming multiple brands keep the explicitly registered brand.
    return matches.size===1?[...matches][0]:(candidates.get(key(p.brand))||key(p.brand));
  };
  return products.map((product,index)=>({product,index,brand:brandOf(product)}))
    .sort((a,b)=>(!a.brand)-(!b.brand)||collator.compare(a.brand,b.brand)
      ||collator.compare(a.product.name||'',b.product.name||'')
      ||collator.compare(a.product.detail||'',b.product.detail||'')
      ||(a.product.sortOrder||0)-(b.product.sortOrder||0)||a.index-b.index)
    .map(row=>row.product);
}
