import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCatalog} from '../catalog-validation.js';
import {orderMessage,filterProducts,priceInfo} from '../catalog-utils.js';
import {variantLabel,variantImage,shadeSuggestion} from '../product-variants.js';
import {applyInventory} from '../trier-inventory.js';
import {stockMarkup} from '../product-stock.js';
const original=JSON.parse(readFileSync(new URL('../catalog.json',import.meta.url)));
test('Trier name suggestions use explicit number and color only, leaving ambiguous names for review',()=>{assert.deepEqual(shadeSuggestion('TINTA BIOCOLOR 10.0 LOIRO ULTRACLARO 60G'),{number:'10.0',name:'LOIRO ULTRACLARO'});assert.deepEqual(shadeSuggestion('TINTURA 6.7'),{number:'6.7',name:''});assert.deepEqual(shadeSuggestion('TINTA 6.7 OU 7.0 CHOCOLATE'),{number:'',name:'CHOCOLATE'});assert.deepEqual(shadeSuggestion('PRODUTO SEM COR 60ML'),{number:'',name:''});});
const catalog=()=>({...original,products:[{...original.products[0],shortCode:'',variantType:'shade',variants:[{id:9001,size:'6.7',shadeName:'Chocolate',packageQuantity:1,priceCents:1999,stockQuantity:0,shortCode:'990001',ean:'7900000000001',imageUrl:'assets/products/3.png'},{id:9002,size:'10.0',shadeName:'Loiro ultraclaro',packageQuantity:1,priceCents:2499,stockQuantity:0,shortCode:'990002',imageUrl:''}]}]});
test('shade metadata validates without changing variant identifiers and rejects unsafe photos or missing identifiers',()=>{
 const c=catalog();assert.equal(validateCatalog(c),c);assert.equal(variantLabel(c.products[0],c.products[0].variants[0]),'6.7 — Chocolate');assert.equal(variantImage(c.products[0],'6.7'),'assets/products/3.png');assert.equal(variantImage(c.products[0],'10.0'),c.products[0].imageUrl);
 for(const patch of [{imageUrl:'javascript:alert(1)'},{shadeName:''},{shortCode:''},{priceCents:null}]){const bad=catalog();Object.assign(bad.products[0].variants[0],patch);assert.throws(()=>validateCatalog(bad));}
});
test('ERP prices and stock remain independent per shade; search and WhatsApp retain the selected identity',()=>{
 const c=catalog(),p=c.products[0],now=Date.now();const synced=applyInventory(c,[{productId:p.id,variantId:9001,priceCents:1599,regularPriceCents:1999,stockQuantity:3,available:true,lastUpdatedAt:new Date(now).toISOString()},{productId:p.id,variantId:9002,priceCents:2499,stockQuantity:0,available:false,lastUpdatedAt:new Date(now).toISOString()}],now);const product=synced.products[0];
 assert.equal(product.variants[0].stockQuantity,3);assert.equal(product.variants[1].stockQuantity,0);assert.equal(priceInfo(product,'6.7').priceCents,1599);assert.match(stockMarkup(product,{now}),/Estoque por tonalidade/);assert.equal(filterProducts([product],{query:'Chocolate'}).length,1);
 const message=orderMessage([{id:p.id,variant:'6.7',qty:2}],[product]);assert.match(message,/Tonalidade: 6.7 — Chocolate/);assert.match(message,/Código: 990001/);assert.match(message,/Quantidade: 2 unidades/);assert.doesNotMatch(message,/Tamanho:|Pacote:|990002/);
});
