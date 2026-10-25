import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeEditedVariant,duplicateIdentities} from '../product-identities.js';
import {findDuplicates,reviewRegistration,suggestRegistration} from '../registration-utils.js';
import {validateCatalog} from '../catalog-validation.js';
import {suggestClassification,ensureClassification} from '../admin/category-intelligence.js';
import {photoCrop,whiteBorderBounds,sharpenPhoto} from '../admin/photo-preparation.js';
const base=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
test('manual variant edit preserves ERP association, EAN, old price and unknown metadata; changed code clears stale origin',()=>{
 const previous={id:81,shortCode:'0012',ean:'7891234567890',oldPriceCents:2999,trier:{id:'provider-12',code:'12'},custom:{keep:true}};
 const next=mergeEditedVariant(previous,{id:81,shortCode:'12',stockQuantity:2});assert.deepEqual(next,{...previous,shortCode:'12',stockQuantity:2});assert.deepEqual(previous.trier,{id:'provider-12',code:'12'});
 assert.equal(mergeEditedVariant(previous,{shortCode:'13'}).trier,undefined);
});
test('candidate variants are compared with every existing identity and nearby names never cause merging',()=>{
 const existing=[{id:1,name:'Shampoo Dove 250 mL',brand:'Dove',variants:[{id:10,shortCode:'0012',ean:'7891234567890',trier:{id:'provider-12'}}]}];
 for(const identity of [{shortCode:'12'},{ean:'7891234567890'},{trier:{id:'provider-12'}}])assert.equal(findDuplicates({name:'Outra família',variants:[identity]},existing)[0].exact,true);
 assert.equal(findDuplicates({name:'Dove Shamp 250 ml',brand:'Dove'},existing)[0].exact,false);
 assert.equal(findDuplicates({name:'SHAMPOO DOVE 250ML',brand:'Dove'},existing)[0].exact,false);
 assert.equal(findDuplicates({name:'Shampoo Dove 500 ml',brand:'Outra'},existing).length,0);
 assert.equal(findDuplicates({variants:[{shortCode:'12'}]},existing,1).length,0);
});
test('catalog validator blocks internal variant EAN/ERP collisions and malformed variant identities',()=>{
 const make=()=>({...structuredClone(base),products:[{...structuredClone(base.products[0]),shortCode:'',ean:'',variants:[{id:90,size:'400 g',packageQuantity:1,stockQuantity:2,shortCode:'900001',ean:'7891234567890',trier:{id:'sku1'}}]},{...structuredClone(base.products[1]),shortCode:'900002',ean:'',variants:[]}]});
 const catalog=make();catalog.products[1].ean='7891234567890';assert.throws(()=>validateCatalog(catalog,{strictIdentities:true}),/Identificador repetido/);
 const ids=make();ids.products[1].trier={id:'sku1'};assert.throws(()=>validateCatalog(ids,{strictIdentities:true}),/Identificador repetido/);
 const malformed=make();malformed.products[0].variants[0].ean='bad';assert.throws(()=>validateCatalog(malformed),/Catálogo inválido/);
 assert.equal(duplicateIdentities(make().products).length,0);validateCatalog(make());
});
test('category equivalence preserves singular existing options without mixing shampoo with conditioner',()=>{
 const catalog={categories:[{id:1,name:'Cabelos',subcategories:[{id:1,name:'Shampoo'},{id:2,name:'Condicionador'}]}]};
 assert.equal(suggestClassification({name:'SHAMPOO DOVE'},catalog.categories).subcategory,'Shampoo');
 assert.equal(suggestClassification({name:'CONDICIONADOR DOVE'},catalog.categories).subcategory,'Condicionador');
 const formulas=[{name:'Área Infantil',subcategories:[{name:'Fórmula infantil'}]}];
 assert.equal(suggestClassification({name:'APTAMIL 800G'},formulas).subcategory,'Fórmula infantil');
 assert.equal(suggestRegistration({name:'APTAMIL 800G'},formulas).size,'800 g');
 ensureClassification({categories:formulas},'Área Infantil','Fórmulas infantis');assert.equal(formulas[0].subcategories.length,1);
});
test('review flags each missing or invalid-date variant sync even when another variant is fresh',()=>{
 const p={id:1,name:'Fralda',brand:'Pampers',detail:'60 un',category:'Infantil',subcategory:'Fraldas',imageUrl:'assets/a.png',variants:[{id:11,size:'P',packageQuantity:60,shortCode:'11'},{id:12,size:'M',packageQuantity:60,shortCode:'12'}]};
 const catalog={products:[p],categories:[]};const inventory=[{product_id:1,variant_id:11,last_trier_sync_at:new Date().toISOString()}];
 assert.ok(reviewRegistration(catalog,inventory)[0].issues.some(i=>i.key==='sync'));
 inventory.push({product_id:1,variant_id:12,last_trier_sync_at:'broken'});assert.ok(reviewRegistration(catalog,inventory)[0].issues.some(i=>i.key==='sync'));
 inventory[1].last_trier_sync_at=new Date().toISOString();assert.equal(reviewRegistration(catalog,inventory).flatMap(r=>r.issues).some(i=>i.key==='sync'),false);
});
test('photo crop validates ranges and white-margin crop preserves every nonwhite source pixel plus padding',()=>{
 assert.deepEqual(photoCrop(100,200,{left:10,right:20,top:5,bottom:15}),{x:10,y:10,width:70,height:160});assert.throws(()=>photoCrop(100,100,{left:46}));assert.throws(()=>photoCrop(100,100,{top:NaN}));
 const data=new Uint8ClampedArray(100*100*4).fill(255);for(let y=30;y<70;y++)for(let x=40;x<60;x++){const i=(y*100+x)*4;data[i]=10;data[i+1]=20;data[i+2]=30;}
 assert.deepEqual(whiteBorderBounds({data,width:100,height:100}),{x:37,y:27,width:26,height:46});
 assert.deepEqual(whiteBorderBounds({data:new Uint8ClampedArray(16).fill(255),width:2,height:2}),{x:0,y:0,width:2,height:2});
 const image={data,width:100,height:100};const before=new Uint8ClampedArray(data);sharpenPhoto(image,0);assert.deepEqual(data,before);sharpenPhoto(image);for(let i=3;i<data.length;i+=4)assert.equal(data[i],255);
});

test('legacy EAN collision stays editable but may not acquire another owner',()=>{
 const original=structuredClone(base);original.products[0].ean=original.products[1].ean='7891234567890';
 validateCatalog(original);const edit=structuredClone(original);edit.products[0].name+=' conferido';validateCatalog(edit,{previousCatalog:original});
 const addition=structuredClone(edit);addition.products[2].ean='7891234567890';assert.throws(()=>validateCatalog(addition,{previousCatalog:original}),/Identificador repetido/);
});
test('SQL guard permits existing EAN collisions and rejects additional owners without rewriting data',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema panel_private;create table public.catalog_draft(catalog jsonb);create function public.catalog_count(jsonb) returns boolean language sql immutable as $$select true$$;`);
 const before={products:[{id:1,ean:'7891234567890',variants:[]},{id:2,ean:'7891234567890',variants:[]},{id:3,variants:[]}]};await db.query('insert into public.catalog_draft values($1)',[JSON.stringify(before)]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261025153435_registration_identity_hardening.sql',import.meta.url),'utf8'));
 const edit=structuredClone(before);edit.products[0].name='Conferido';await db.query('update public.catalog_draft set catalog=$1',[JSON.stringify(edit)]);
 const collision=structuredClone(edit);collision.products[2].ean='7891234567890';await assert.rejects(()=>db.query('update public.catalog_draft set catalog=$1',[JSON.stringify(collision)]),/Identificador repetido/);
 assert.deepEqual((await db.query('select catalog from public.catalog_draft')).rows[0].catalog,edit);
 const reduced=structuredClone(edit);delete reduced.products[1].ean;await db.query('update public.catalog_draft set catalog=$1',[JSON.stringify(reduced)]);
 }finally{await db.close();}
});
