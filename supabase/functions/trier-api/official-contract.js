import { TrierClient, TrierError } from './integration.js';
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
              status: p.ativo && p.integracaoEcommerce ? 'sellable' : 'blocked', storeId: settings.storeId });
          }
          if (result.length > settings.maxProducts) throw new TrierError('too_many_products');
          if (rows.length < 50) break;
        }
      }
      return result;
    }
  };
}
export const officialPolicy = { priceUnit: 'decimal', isSellable: status => status === 'sellable' };
