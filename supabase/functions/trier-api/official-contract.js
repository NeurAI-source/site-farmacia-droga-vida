import { TrierClient, TrierError, moneyToCents } from './integration.js';
// The documented bulk endpoint avoids one request per item. Complete the scan
// before applying anything; partial/failed scans never advertise a discount.
async function loadDiscounts(settings, fetcher, sleep, deadline, selected) {
  const discounts=new Map(), seen=new Set(), pageSize=500;
  for(let offset=0;;offset+=pageSize){
    const contract={request(){const url=new URL(settings.baseUrl.replace(/\/$/,'')+'/rest/integracao/produto/desconto/melhor/obter-todos-v1');url.searchParams.set('removerRestricaoEstoque','true');url.searchParams.set('primeiroRegistro',String(offset));url.searchParams.set('quantidadeRegistros',String(pageSize));return {url:url.href,headers:{Authorization:`Bearer ${settings.token}`,Accept:'application/json'}};},decode(payload){if(!Array.isArray(payload)||payload.length>pageSize)throw Error();return payload;}};
    const rows=await new TrierClient({...settings,maxProducts:pageSize},contract,fetcher,sleep).products({deadline});
    if(offset+rows.length>20000)throw new TrierError('too_many_discounts');
    for(const row of rows){
      if(!Number.isSafeInteger(row.codigoProduto))throw new TrierError('unexpected_schema');
      const code=String(row.codigoProduto);if(!selected.has(code))continue;
      if(seen.has(code)){discounts.set(code,null);continue;}seen.add(code);
      // A cash/card/partner-specific price must not become a universal offer.
      if(!Object.hasOwn(row,'codigoCondicaoPagamento')||!Object.hasOwn(row,'nomeCondicaoPagamento')||row.codigoCondicaoPagamento!=null||row.nomeCondicaoPagamento!=null){discounts.set(code,null);continue;}
      try{const normal=moneyToCents(row.valorVenda,'decimal'),sale=moneyToCents(row.valorPromocao,'decimal');
        discounts.set(code,normal>sale&&sale>0?{normal,sale,regular:row.valorVenda,price:row.valorPromocao}:null);
      }catch{discounts.set(code,null);}
    }
    if(rows.length<pageSize)return discounts;
  }
}
// Trier SGF LTS 1.5.22: /rest + documented OpenAPI paths. Array
// filters use form/explode (repeated codigo), not comma-separated codes.
export function createOfficialContract(codes, deliveryCode = '46295') {
  const selected = [...new Set(codes.filter(c => /^\d{1,12}$/.test(String(c))).map(c => String(Number(c))))].filter(c => c !== deliveryCode);
  return {
    async load(settings, fetcher, sleep, deadline) {
      const result = [], seen = new Set();
      for (let batch = 0; batch < selected.length; batch += 30) {
        const chunk = selected.slice(batch, batch + 30);
        for (let offset = 0; ; offset += 50) {
          const contract = {
            request() {
              const url = new URL(settings.baseUrl.replace(/\/$/, '') + '/rest/integracao/produto/obter-v1');
              for (const code of chunk) url.searchParams.append('codigo', code);
              url.searchParams.set('primeiroRegistro', String(offset));
              url.searchParams.set('quantidadeRegistros', '50');
              return { url: url.href, headers: { Authorization: `Bearer ${settings.token}`, Accept: 'application/json' } };
            },
            decode(payload) {
              if (!Array.isArray(payload) || payload.length > 50) throw Error();
              return payload;
            }
          };
          const rows = await new TrierClient(settings, contract, fetcher, sleep).products({deadline});
          for (const p of rows) {
            if (!Number.isSafeInteger(p.codigo) || !chunk.includes(String(p.codigo)) || seen.has(p.codigo)) throw new TrierError('unexpected_schema');
            seen.add(p.codigo);
            if (typeof p.ativo !== 'boolean' || typeof p.integracaoEcommerce !== 'boolean') throw new TrierError('unexpected_schema');
            result.push({ reducedCode: String(p.codigo), ean: /^\d{8,14}$/.test(String(p.codigoBarras)) ? String(p.codigoBarras) : undefined,
              name: p.nomeEcommerce || p.nome, price: p.valorVendaEcommerce ?? p.valorVenda,
              stockQuantity: p.quantidadeEstoqueEcommerce ?? p.quantidadeEstoque,
              // This storefront accepts WhatsApp pre-orders, not ERP ecommerce
              // sales. Ecommerce opt-in is independent of active stock; the
              // mapper still blocks inactive products and non-positive balances.
              status: p.ativo ? 'sellable' : 'blocked', storeId: settings.storeId });
          }
          if (result.length > settings.maxProducts) throw new TrierError('too_many_products');
          if (rows.length < 50) break;
        }
      }
      let discounts=new Map(),discountStatus='checked';
      try{discounts=await loadDiscounts(settings,fetcher,sleep,Math.min(deadline,Date.now()+Math.min(30000,Math.floor((deadline-Date.now())*.4))),new Set(result.map(p=>p.reducedCode)));}
      catch{discountStatus='unavailable';}
      for(const item of result){
        const offer=discounts.get(item.reducedCode);item.regularPrice=null;
        // Never double-discount or replace an explicit, different ecommerce price.
        if(offer){try{if(moneyToCents(item.price,'decimal')===offer.normal){item.price=offer.price;item.regularPrice=offer.regular;}}catch{}}
      }
      Object.defineProperty(result,'discountStatus',{value:discountStatus});
      return result;
    }
  };
}
export const officialPolicy = { priceUnit: 'decimal', isSellable: status => status === 'sellable' };
