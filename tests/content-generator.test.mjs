import test from 'node:test';
import assert from 'node:assert/strict';
import { draftFromCatalog,extractSourceFields,mergeDraftContent,parseEvidence,needsProfessionalReview } from '../content-generator.js';
const product={name:'Suplemento Exemplo 400g',brand:'Marca Exemplo',detail:'400g',category:'Suplementos',subcategory:'Suplemento em pó'};
test('Neur.AI gratuita não inventa benefícios, dose ou indicação',()=>{
 const d=draftFromCatalog(product);
 assert.match(d.description,/Suplemento Exemplo/);assert.match(d.specifications,/400g/);
 for(const k of ['purpose','benefits','usage','warnings'])assert.equal(d[k],'');
});
test('Informações do rótulo são extraídas por seção e não inferidas',()=>{
 const d=draftFromCatalog(product,'Para que serve: Uso declarado no rótulo\nBenefícios: Benefício informado\nModo de uso: Ler instruções da embalagem\nAdvertências: Manter fora do alcance de crianças');
 assert.equal(d.purpose,'Uso declarado no rótulo');
 assert.equal(d.usage,'Ler instruções da embalagem');
 assert.match(d.warnings,/crianças/);
});
test('Rascunhos não substituem conteúdos aprovados automaticamente',()=>{
 assert.deepEqual(mergeDraftContent({description:'Original',usage:'Original'}, {description:'Novo',usage:'Alterado',benefits:'A'},false),{description:'Original',usage:'Original',benefits:'A'});
 assert.equal(mergeDraftContent({description:'Original'},{description:'Novo'},true).description,'Novo');
});
test('URLs de evidências rejeitam endereços locais e javascript',()=>{
 assert.deepEqual(parseEvidence('https://fabricante.com.br/ficha javascript:alert(1) http://nao.exemplo https://127.0.0.1/ https://fabricante.com.br/ficha'),['https://fabricante.com.br/ficha']);
});
test('Medicamentos exigem revisão especializada',()=>{
 assert.equal(needsProfessionalReview({...product,category:'Medicamentos'}),true);
 assert.equal(needsProfessionalReview(product),false);
});

test('Fontes oficiais podem aparecer na página após revisão; endereços privados são rejeitados',async()=>{
 const {validateCatalog}=await import('../catalog-validation.js');
 const {productDetailMarkup}=await import('../product-detail.js');
 const original=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../catalog.json',import.meta.url),'utf8'));
 const sample={...original.products[0],content:{description:'Texto conferido'},contentSources:['https://fabricante.com.br/ficha']};
 assert.doesNotThrow(()=>validateCatalog({...original,products:[sample,...original.products.slice(1)]}));
 assert.match(productDetailMarkup(sample),/https:\/\/fabricante\.com\.br\/ficha/);
 assert.throws(()=>validateCatalog({...original,products:[{...sample,contentSources:['https:\/\/127.0.0.1\/admin']},...original.products.slice(1)]}),/inválido/);
});
