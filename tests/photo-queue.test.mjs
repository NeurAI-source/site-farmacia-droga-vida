import test from 'node:test';
import assert from 'node:assert/strict';
import {isPhotoPending,matchPhotoFilename,photoTargets,matchPhotoTarget,photoIdentity,photoAuditResult} from '../photo-queue-utils.js';
import {photoCredit} from '../photo-credits.js';
const products=[{id:1,name:'Shampoo',shortCode:'12345',ean:'7891234567890',imageUrl:'assets/product-pending.svg',imagePending:true,variants:[]},{id:2,name:'Fralda',shortCode:'',ean:'',imageUrl:'assets/product-pending.svg',variants:[{shortCode:'44444'}]},{id:3,name:'Creme',shortCode:'54321',ean:'',imageUrl:'https://example.com/creme.png'}];
test('only missing/placeholder photos are pending',()=>{assert.equal(isPhotoPending(products[0]),true);assert.equal(isPhotoPending(products[1]),true);assert.equal(isPhotoPending(products[2]),false);assert.equal(isPhotoPending({imageUrl:''}),true);});
test('match files exclusively to one exact EAN or reduced code, never a parent from a variant code',()=>{assert.equal(matchPhotoFilename('7891234567890-frente.jpg',products)?.id,1);assert.equal(matchPhotoFilename('foto_12345.png',products)?.id,1);assert.equal(matchPhotoFilename('44444.webp',products),null);assert.equal(matchPhotoFilename('20261122_shampoo.jpg',products),null);});
test('never guess ambiguous files',()=>{assert.equal(matchPhotoFilename('12345_54321.jpg',products),null);assert.equal(matchPhotoFilename('foto-sem-codigo.png',products),null);assert.equal(matchPhotoFilename('0.jpg',products),null);});
test('photo destinations distinguish every shade and size, with exact filename association',()=>{
 const targets=photoTargets({products:[{...products[1],variantType:'shade',variants:[{id:7,size:'6.7',shadeName:'Chocolate',ean:'7890000000001',shortCode:'00444'}]}]});
 assert.equal(matchPhotoTarget('ean-7890000000001.png',targets).key,'2:7');assert.equal(matchPhotoTarget('444.png',targets).key,'2:7');assert.equal(targets[1].shade,'6.7');assert.equal(targets[0].pending,true);
});
const identity={ean:'7890000000001',brand:'Dove',name:'Shampoo Dove 250 mL',detail:'250 mL'};
test('image identity requires exact EAN and rejects wrong brand and presentation',()=>{
 const c={...identity,quantity:'250 ml'};assert.equal(photoIdentity(identity,c).confidence,95);
 for(const wrong of [{ean:'7890000000002'},{brand:'Outra'},{quantity:'400 ml'}])assert.equal(photoIdentity(identity,{...c,...wrong}).blocked,true);
 assert.equal(photoIdentity(identity,{ean:identity.ean,name:'Shampoo'}).confidence,70);
 assert.equal(photoIdentity(identity,{...c,quantity:'0.25 L'}).blocked,false);
});
test('wrong shade or size is blocked even for an exact EAN',()=>{
 assert.equal(photoIdentity({...identity,shade:'6.7'},{...identity,name:'Tintura 6.0',quantity:'250 ml'}).blocked,true);
 assert.equal(photoIdentity({...identity,size:'G'},{...identity,name:'Fralda XG',quantity:'250 ml'}).blocked,true);
 assert.equal(photoIdentity({...identity,size:'G'},{...identity,name:'Fralda G',quantity:'250 ml'}).confidence,95);
 assert.equal(photoIdentity({...identity,packageQuantity:60},{...identity,name:'Fralda G 50 unidades',quantity:'250 ml'}).blocked,true);
});
test('photo audit distinguishes broken sources from small, valid originals',()=>{
 assert.equal(photoAuditResult(1200,500).lowResolution,true);assert.equal(photoAuditResult(0,0,true).broken,true);assert.equal(photoAuditResult(0,0,true).lowResolution,false);
});
test('credits are conditional, escaped, licensed and follow the actually displayed variation',()=>{
 assert.equal(photoCredit(products[0]),'');const review={source:{provider:'open-beauty-facts',ean:identity.ean,attribution:'<img onerror=1>'},processing:{}};
 const p={imageUrl:'root.png',photoReview:review,variants:[{size:'G',imageUrl:'assets/G.png'}]};
 const html=photoCredit(p);assert.match(html,/CC BY-SA 3.0/);assert.match(html,/&lt;img/);assert.match(html,/Recorte/);assert.equal(photoCredit(p,'G'),'');
});

test('a weight variation uses its own presentation rather than the parent presentation',()=>{
 const [parent,variant]=photoTargets({products:[{id:5,name:'Fórmula',detail:'400 g',brand:'Marca',variants:[{id:8,size:'800 g',ean:'7890000000001'}]}]});
 assert.equal(parent.detail,'400 g');assert.equal(variant.detail,'800 g');assert.equal(photoIdentity(variant,{ean:variant.ean,name:'Fórmula 800 g',brand:'Marca',quantity:'800 g'}).blocked,false);assert.equal(photoIdentity(variant,{ean:variant.ean,name:'Fórmula 400 g',brand:'Marca',quantity:'400 g'}).blocked,true);
});
