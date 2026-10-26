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

test('melatonin has its own classification, reuses equivalent options and keeps ambiguous products for review',()=>{
 for(const name of ['MELATONINA 0,21MG 30 CAPS','LAVITAN MELATONINA GOTAS 20ML','MELATONIN 60 GUMMIES','MELATONINA VITAMINA B6 30CP']){
  const result=suggestClassification({name},[]);assert.equal(result.category,'Suplementos',name);assert.equal(result.subcategory,'Melatonina',name);
 }
 const existing=[{id:91,name:'Suplementos',subcategories:[{id:92,name:'Melatoninas'}]}];
 const suggestion=suggestClassification({name:'MELATONINA 30CP'},existing);assert.equal(suggestion.subcategory,'Melatoninas');
 const next=completeTaxonomy({categories:existing,products:[]});assert.equal(next.categories.find(c=>c.id===91).subcategories.filter(s=>/melatonin/i.test(s.name)).length,1);
 assert.ok(completeTaxonomy(catalog).categories.find(c=>c.name==='Suplementos').subcategories.some(s=>s.name==='Melatonina'));
 for(const name of ['LAVITAN','MELATON','KIT MELATONINA E COLAGENO','MELATONINA E WHEY'])assert.equal(suggestClassification({name},[]).review,true,name);
 for(const name of ['CREME COM MELATONINA','SERUM FACIAL MELATONINA'])assert.notEqual(suggestClassification({name},[]).category,'Suplementos',name);
 const input={categories:[],products:[{id:1,name:'MELATONINA 30CP',category:'',subcategory:'',priceCents:1999,shortCode:'990001',classification:null}]};
 const rows=classificationReview(input);assert.equal(input.categories.length,0);const applied=applyClassifications(input,rows);assert.equal(applied.products[0].subcategory,'Melatonina');assert.equal(applied.products[0].priceCents,1999);assert.equal(applied.products[0].shortCode,'990001');
});

test('verified abbreviated product lines classify without expanding ambiguous names or brands',()=>{
 for(const [name,category,subcategory] of [
  ['LAVITAN COL HID HI/LI PO 300G','Suplementos','Colágenos'],
  ['LAVITAN AZ ORIGINAL 60CP','Suplementos','Polivitamínicos'],
  ['LAVITAN A-Z ORIGINAL 90 COMPRIMIDOS','Suplementos','Polivitamínicos'],
  ['LAVITAN MEMO NEURO 60CP','Suplementos','Vitaminas e minerais'],
  ['SH DOVE 250ML','Cabelos','Shampoos e condicionadores'],
  ['COND DOVE 200ML','Cabelos','Shampoos e condicionadores']
 ])assert.deepEqual(((r)=>[r.category,r.subcategory])(suggestClassification({name},[])),[category,subcategory],name);
 for(const name of ['COL HID 300G','LAVITAN','LAVITAN AZ','MEMO NEURO 60CP','LAVITAN MEMO NEURO','LAVITAN AZ ORIGINAL KIT 60CP','LAVITAN COL HID E WHEY 300G'])assert.equal(suggestClassification({name},[]).review,true,name);
 for(const name of ['SH LAVITAN COL HID 300G','CREME LAVITAN AZ ORIGINAL 60CP','SERUM LAVITAN MEMO NEURO 60CP'])assert.notEqual(suggestClassification({name},[]).category,'Suplementos',name);
});

test('infant colognes have a dedicated reusable subcategory and never classify adult fragrances or a brand alone',()=>{
 for(const name of ['COLONIA INFANTIL 200ML','DEO COLÔNIA JOHNSONS BABY 200ML','COLONIA PARA BEBÊ 100ML','COL JOHNSONS BABY 200M','COLONIAS INFANTIS 100ML','COLÔNIA KIDS 100ML']){
  const r=suggestClassification({name},[]);assert.equal(r.category,'Área Infantil',name);assert.equal(r.subcategory,'Colônias infantis',name);
 }
 for(const name of ['JOHNSONS BABY','COLONIA ADULTO 100ML','COLONIA 200ML','KIT COLONIA INFANTIL E SHAMPOO','COLAGENO BABY 300G'])assert.notEqual(suggestClassification({name},[]).subcategory,'Colônias infantis',name);
 const input={categories:[{id:17,name:'Área Infantil',subcategories:[{id:91,name:'Colônia infantil',categoryId:17}]}],products:[]};
 const r=suggestClassification({name:'COLONIA BABY 200ML'},input.categories);assert.equal(r.subcategory,'Colônia infantil');
 const completed=completeTaxonomy(input);assert.equal(completed.categories.find(c=>c.id===17).subcategories.filter(s=>/col.nia/i.test(s.name)).length,1);assert.deepEqual(completeTaxonomy(completed),completed);assert.equal(input.categories[0].subcategories.length,1);
});

test('talc and infant moisturizer classifications require explicit audience and reuse equivalent options',()=>{
 const categories=[{id:1,name:'Perfumaria e Cuidados Pessoais',subcategories:[{id:11,name:'Talco adulto'}]},{id:2,name:'Área Infantil',subcategories:[{id:12,name:'Talco infantil'},{id:13,name:'Hidratante infantil'}]}];
 for(const [name,category,sub] of [
  ['TALCO INFANTIL 100G','Área Infantil','Talco infantil'],['TALC JOHNSONS BABY 200G','Área Infantil','Talco infantil'],
  ['TALCO ADULTO 100G','Perfumaria e Cuidados Pessoais','Talco adulto'],['TALCO PARA ADULTOS 200G','Perfumaria e Cuidados Pessoais','Talco adulto'],
  ['HIDRATANTE INFANTIL 200ML','Área Infantil','Hidratante infantil'],['LOCAO HIDRATANTE BEBÊ 200ML','Área Infantil','Hidratante infantil'],['HIDR BABY 200M','Área Infantil','Hidratante infantil']
 ]){const r=suggestClassification({name},categories);assert.equal(r.category,category,name);assert.equal(r.subcategory,sub,name);}
 for(const name of ['TALCO 100G','HIDRATANTE ADULTO 200ML','JOHNSONS BABY','KIT TALCO INFANTIL E HIDRATANTE','TALCO ADULTO BABY 200G'])assert.equal(suggestClassification({name},categories).review,true,name);
 const original={categories,products:[]};const result=completeTaxonomy(original);assert.deepEqual(completeTaxonomy(result),result);assert.equal(result.categories.find(c=>c.id===2).subcategories.filter(s=>/talco|hidratante/i.test(s.name)).length,2);assert.deepEqual(original.categories,categories);
 assert.equal(suggestClassification({name:'TALCO ADULTO 100G'},[]).subcategory,'Talcos adultos');
 assert.equal(suggestClassification({name:'HIDRATANTE INFANTIL COM COLAGENO 200ML'},[]).subcategory,'Hidratantes infantis');
});
