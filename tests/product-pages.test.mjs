import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog } from '../catalog-validation.js';
import { productDetailMarkup } from '../product-detail.js';
const raw=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
test('Página individual fica desligada por padrão e é reversível',()=>{
 assert.doesNotThrow(()=>validateCatalog({...raw,expandedProductPage:false}));
 assert.doesNotThrow(()=>validateCatalog({...raw,expandedProductPage:true}));
 assert.throws(()=>validateCatalog({...raw,expandedProductPage:'true'}),/inválido/);
});
test('Campos editoriais opcionais são validados e não inventam informações',()=>{
 const p={...raw.products[0],ean:'7891234567890',content:{description:'Descrição verificada',purpose:'',warnings:'Leia o rótulo.'}};
 assert.doesNotThrow(()=>validateCatalog({...raw,products:[p,...raw.products.slice(1)]}));
 const html=productDetailMarkup(p);
 assert.match(html,/Descrição verificada/);
 assert.match(html,/Leia o rótulo/);
 assert.doesNotMatch(html,/Para que serve/);
 assert.match(html,/Adicionar ao pré-pedido/);
 assert.doesNotMatch(html,/Em estoque|Disponível agora/);
 assert.throws(()=>validateCatalog({...raw,products:[{...p,ean:'123x'},...raw.products.slice(1)]}),/inválido/);
 assert.throws(()=>validateCatalog({...raw,products:[{...p,content:{purpose:'a'.repeat(2401)}},...raw.products.slice(1)]}),/inválido/);
});
test('Conteúdo potencialmente perigoso é escapado na página detalhada',()=>{
 const html=productDetailMarkup({...raw.products[0],name:'<script>alert(1)</script>',content:{description:'<img src=x onerror=alert(1)>'}});
 assert.doesNotMatch(html,/<script>|<img src=x/);
 assert.match(html,/&lt;script&gt;/);
});
