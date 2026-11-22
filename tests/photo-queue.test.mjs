import test from 'node:test';
import assert from 'node:assert/strict';
import {isPhotoPending,matchPhotoFilename} from '../photo-queue-utils.js';
const products=[{id:1,name:'Shampoo',shortCode:'12345',ean:'7891234567890',imageUrl:'assets/product-pending.svg',imagePending:true,variants:[]},{id:2,name:'Fralda',shortCode:'',ean:'',imageUrl:'assets/product-pending.svg',variants:[{shortCode:'44444'}]},{id:3,name:'Creme',shortCode:'54321',ean:'',imageUrl:'https://example.com/creme.png'}];
test('only missing/placeholder photos are pending',()=>{assert.equal(isPhotoPending(products[0]),true);assert.equal(isPhotoPending(products[1]),true);assert.equal(isPhotoPending(products[2]),false);assert.equal(isPhotoPending({imageUrl:''}),true);});
test('match files exclusively to one exact EAN or reduced code',()=>{assert.equal(matchPhotoFilename('7891234567890-frente.jpg',products)?.id,1);assert.equal(matchPhotoFilename('foto_12345.png',products)?.id,1);assert.equal(matchPhotoFilename('44444.webp',products)?.id,2);assert.equal(matchPhotoFilename('20261122_shampoo.jpg',products),null);});
test('never guess ambiguous files',()=>{assert.equal(matchPhotoFilename('12345_54321.jpg',products),null);assert.equal(matchPhotoFilename('foto-sem-codigo.png',products),null);assert.equal(matchPhotoFilename('0.jpg',products),null);});
