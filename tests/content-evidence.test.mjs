import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEvidence,validEvidenceUrl} from '../content-evidence.js';
import {validateCatalog} from '../catalog-validation.js';
import {productDetailMarkup} from '../product-detail.js';
import {readFile} from 'node:fs/promises';
const catalog=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url),'utf8'));
test('Validação de fontes manuais não permite endereços internos, HTTP nem duplicados',()=>{
 assert.deepEqual(parseEvidence('https://fabricante.com.br/ficha javascript:alert(1) http://nao.exemplo https://127.0.0.1/ https://fabricante.com.br/ficha'),['https://fabricante.com.br/ficha']);
 assert.equal(validEvidenceUrl('https://localhost/'),false);
});
test('Fontes manuais continuam preservadas no cadastro e ausentes na página pública',()=>{
 const sample={...catalog.products[0],content:{description:'Texto conferido'},contentSources:['https://fabricante.com.br/ficha']};
 assert.doesNotThrow(()=>validateCatalog({...catalog,products:[sample,...catalog.products.slice(1)]}));
 assert.doesNotMatch(productDetailMarkup(sample),/Texto conferido|fabricante\.com\.br|Descrição completa|Para que serve/);
 assert.throws(()=>validateCatalog({...catalog,products:[{...sample,contentSources:['https://127.0.0.1/admin']},...catalog.products.slice(1)]}),/inválido/);
});
