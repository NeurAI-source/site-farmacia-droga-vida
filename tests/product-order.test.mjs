import test from 'node:test';
import assert from 'node:assert/strict';
import {orderProductsByBrand} from '../product-order.js';

test('commercial brands stay adjacent despite interleaved ERP manufacturers, package sizes and future registration dates',()=>{
 const products=[
  {id:1,name:'ABSORVENTE SEMPRE LIVRE SUAVE',brand:'Kenvue',detail:'8 unidades'},
  {id:2,name:'ABSORVENTE INTIMUS NOTURNO',brand:'Kimberly Clark'},
  {id:3,name:'ABSORVENTE ALWAYS DIA',brand:'P&G'},
  {id:4,name:'ABSORVENTE CAREFREE DIARIO',brand:'Kenvue'},
  {id:5,name:'ABSORVENTE SEMPRE LIVRE SUAVE',brand:'Kenvue',detail:'32 unidades',createdAt:'2030-01-01'},
  {id:6,name:'ABSORVENTE INTIMUS DIARIO',brand:'Kimberly Clark'},
  {id:7,name:'ABSORVENTE ALWAYS NOTURNO',brand:'P&G'}
 ];const before=structuredClone(products),ordered=orderProductsByBrand(products);
 assert.deepEqual(ordered.map(p=>p.id),[3,7,4,6,2,1,5]);assert.deepEqual(products,before);assert.equal(ordered.length,products.length);
});
test('case, punctuation and accents normalize; new registered brands work without a hardcoded alias and missing brands remain visible',()=>{
 const products=[{id:1,name:'Produto sem marca',brand:''},{id:2,name:'Creme novo',brand:'Nova Marca'},{id:3,name:'Óleo novo',brand:'nova-marca'},{id:4,name:'ESM RISQUE',brand:'Fabricante'},{id:5,name:'Esmalte Risqué',brand:'Outro fabricante'}];
 assert.deepEqual(orderProductsByBrand(products).map(p=>p.id),[2,3,4,5,1]);
});
