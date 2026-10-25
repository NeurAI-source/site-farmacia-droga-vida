import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {suggestClassification,classificationReview,applyClassifications,fillMissingClassifications,completeTaxonomy,restoreClassifications,classificationOf} from '../admin/category-intelligence.js';
const catalog={categories:[{id:1,name:'Perfumaria e Cuidados Pessoais',subcategories:[]}],products:[{id:1,name:'ESM RISQUE MET CAFE COM CANELA',category:'Perfumaria e Cuidados Pessoais',subcategory:'',priceCents:675,stockQuantity:3,shortCode:'0001',variants:[],imageUrl:'assets/product.png'}]};
test('explicit terms classify abbreviations and reject brands, kits and unknown names',()=>{
 for(const [name,sub] of [['ESM RISQUE 8ML','Esmaltes'],['ABS ALWAYS NOTURNO','Absorventes e protetores diários'],['Fralda geriátrica adulta','Fraldas geriátricas'],['Fralda Babysec Mega','Fraldas'],['Removedor de esmalte','Removedores de esmalte'],['Sabonete íntimo','Higiene íntima']])assert.equal(suggestClassification({name},catalog.categories).subcategory,sub);
 for(const name of ['Risqué','Always','Produto novo','Kit sabonete e shampoo'])assert.equal(suggestClassification({name},catalog.categories).review,true);
});
test('supplements recognize collagen and abbreviated names without classifying cosmetics or brands alone',()=>{
 const categories=completeTaxonomy(catalog).categories;
 for(const [name,sub] of [
  ['LAVITAN COLÁGENO HIDROLISADO VERISOL 300G COM VITAMINAS','Colágenos'],
  ['LAVITAN COLAG HIDROL 300G HIB LIM','Colágenos'],
  ['COLAGENO TIPO II 60 CAPS','Colágenos'],
  ['ÔMEGA-3 1000MG VITAMINA E','Ômega e ácidos graxos'],
  ['CREATINA MONOHIDRATADA 300G','Nutrição esportiva'],
  ['WHEY PROTEIN CHOCOLATE','Nutrição esportiva'],
  ['POLIVITAMINICO A Z','Polivitamínicos'],
  ['VIT D3 2000UI','Vitaminas e minerais'],
  ['MAGNESIO 60 CAPS','Vitaminas e minerais'],
  ['BIOTINA VITAMINA B7 60 CAPS','Cabelo, pele e unhas']
 ]){const result=suggestClassification({name},categories);assert.equal(result.category,'Suplementos',name);assert.equal(result.subcategory,sub,name);assert.equal(result.ruleVersion,2);}
 for(const name of ['LAVITAN','CIMED','LAVITAN 300G','NUTREN ACTIVE COM 14 VITAMINAS','OXIDO DE ZINCO 60G','KIT COLAGENO E VITAMINA C','COLAGENO E WHEY'])assert.equal(suggestClassification({name},categories).review,true,name);
 for(const name of ['SHAMPOO COM COLAGENO','SERUM FACIAL VITAMINA C','CREME COLAGENO','MASCARA CAPILAR BIOTINA','POMADA VITAMINA A','PROTETOR SOLAR COM ZINCO'])assert.notEqual(suggestClassification({name},categories).category,'Suplementos',name);
});
test('new collagen suggestions add missing options only on confirmation and preserve manual classifications',()=>{
 const input=structuredClone(catalog);input.categoryIntelligence={automatic:true};
 input.products=[{...input.products[0],name:'LAVITAN COLAGENO 300G',category:'Suplementos'},
  {...input.products[0],id:2,name:'COLAGENO 60 CAPS',category:'Suplementos',classification:{locked:true,source:'manual'}},
  {...input.products[0],id:3,name:'COLAGENO 300G',category:'Suplementos',subcategory:'Cabelo, pele e unhas'},
  {...input.products[0],id:4,name:'COLAGENO 300G',category:'Perfumaria e Cuidados Pessoais'}];
 const next=fillMissingClassifications(input);assert.equal(next.products[0].subcategory,'Colágenos');assert.equal(next.products[0].classification.ruleVersion,2);
 assert.deepEqual(next.products.slice(1),input.products.slice(1));
 assert.equal(input.categories.some(c=>c.name==='Suplementos'),false,'suggestions never mutate the source catalogue');
 for(const key of ['priceCents','stockQuantity','shortCode','variants','imageUrl'])assert.deepEqual(next.products[0][key],input.products[0][key]);
});
test('automatic mode is opt-in, fills only empty subcategories and preserves every commercial field',()=>{
 assert.equal(fillMissingClassifications(catalog),catalog);
 const input=structuredClone(catalog);input.categoryIntelligence={automatic:true};input.products.push({...input.products[0],id:2,subcategory:'Higiene pessoal'},{...input.products[0],id:3,classification:{locked:true,source:'manual'}});
 const next=fillMissingClassifications(input);assert.equal(next.products[0].subcategory,'Esmaltes');assert.equal(next.products[1].subcategory,'Higiene pessoal');assert.equal(next.products[2].subcategory,'');
 for(const key of ['priceCents','stockQuantity','shortCode','variants','imageUrl'])assert.deepEqual(next.products[0][key],input.products[0][key]);
 assert.equal(input.products[0].subcategory,'');assert.equal(next.products[0].classification.locked,false);
});
test('reviewed changes lock classification, reject stale or duplicate rows and can be recovered without reverting prices',()=>{
 const rows=classificationReview(catalog),next=applyClassifications(catalog,rows);assert.equal(next.products[0].classification.locked,true);
 assert.throws(()=>applyClassifications(next,rows),/mudou/);assert.throws(()=>applyClassifications(catalog,[...rows,...rows]),/mudou/);
 assert.throws(()=>applyClassifications(next,classificationReview({...next,products:[{...next.products[0],name:'Abs Always'}]})),/protegido/);
 const changes=[{id:1,before:classificationOf(catalog.products[0]),after:JSON.parse(JSON.stringify(classificationOf(next.products[0])))}];next.products[0].priceCents=1234;
 const restored=restoreClassifications(next,changes);assert.equal(restored.products[0].subcategory,'');assert.equal(restored.products[0].priceCents,1234);assert.equal(restored.products[0].classification.locked,true);
 next.products[0].subcategory='Outra';assert.throws(()=>restoreClassifications(next,changes),/posteriores/);
});
test('default taxonomy is additive and idempotent with unique IDs',()=>{
 const next=completeTaxonomy(catalog);assert.deepEqual(next.products,catalog.products);assert.deepEqual(completeTaxonomy(next),next);
 assert.equal(new Set(next.categories.map(c=>c.id)).size,next.categories.length);
 const subs=next.categories.flatMap(c=>c.subcategories);assert.equal(new Set(subs.map(s=>s.id)).size,subs.length);
 assert.ok(subs.some(s=>s.name==='Esmaltes'));assert.ok(subs.some(s=>s.name==='Absorventes e protetores diários'));
});
test('database history records authenticated actor atomically, protects audit rows and leaves price-only updates alone',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function public.is_team() returns boolean language sql as $$select auth.uid()='11111111-1111-4111-8111-111111111111'::uuid$$;grant usage on schema auth to authenticated;create table public.catalog_draft(id int primary key,catalog jsonb,version bigint);`);
 await db.query('insert into public.catalog_draft values(1,$1,1)',[JSON.stringify(catalog)]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261023173424_intelligent_categories.sql',import.meta.url),'utf8'));
 await db.exec("set test.uid='11111111-1111-4111-8111-111111111111'");
 const next=applyClassifications(catalog,classificationReview(catalog));await db.query('update public.catalog_draft set catalog=$1,version=2',[JSON.stringify(next)]);
 const h=(await db.query('select * from public.category_history')).rows[0];assert.equal(h.actor_id,'11111111-1111-4111-8111-111111111111');assert.equal(h.changes[0].before.subcategory,'');assert.equal(h.changes[0].after.subcategory,'Esmaltes');assert.equal(h.after_version,2);
 next.products[0].priceCents=700;await db.query('update public.catalog_draft set catalog=$1,version=3',[JSON.stringify(next)]);assert.equal((await db.query('select * from public.category_history')).rows.length,1);
 await db.exec('set role authenticated');assert.equal((await db.query('select * from public.category_history')).rows.length,1);await assert.rejects(()=>db.exec('delete from public.category_history'),/permission denied/);
 await db.exec("set test.uid='22222222-2222-4222-8222-222222222222'");assert.equal((await db.query('select * from public.category_history')).rows.length,0);
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from public.category_history'),/permission denied/);
 }finally{await db.close();}
});
