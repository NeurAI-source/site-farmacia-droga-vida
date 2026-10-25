import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {buildRegistration,PENDING_IMAGE} from '../../registration-utils.js';
import {completeTaxonomy} from '../../admin/category-intelligence.js';
const original=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
const actor='11111111-1111-4111-8111-111111111111';
const fixtureRow=(code,name)=>({shortCode:code,externalId:'sku-'+code,ean:code==='900001'?'7900000000001':'7900000000002',name,priceCents:1999,regularPriceCents:2499,stockQuantity:4,active:true,storeId:'2',fetchedAt:new Date().toISOString(),discountStatus:'checked'});
async function setup(page,{role='admin',offline=false,lost=false}={}){
 const state={catalog:completeTaxonomy(original),version:7,ledger:new Map(),calls:[],offline,lost,previews:new Map(),rows:[fixtureRow('900001','SHAMPOO DOVE 250ML'),fixtureRow('900002','CONDICIONADOR DOVE 200ML')]};
 const user={id:actor,email:'fixture@example.test',aud:'authenticated',role:'authenticated'};const token=`e30.${Buffer.from(JSON.stringify({sub:actor,role:'authenticated',aal:'aal2',exp:4102444800})).toString('base64url')}.fixture`;
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://registration-test.supabase.co",key:"sb_publishable_fixture"};'}));
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-registration-test-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:4102444800,user})),{user,token});
 await page.route('https://registration-test.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());let data={};
   if(url.pathname.endsWith('/user'))data=user;
   else if(url.pathname.includes('/team_members'))data={role,active:true};
   else if(url.pathname.includes('/catalog_draft'))data={catalog:state.catalog,version:state.version};
   else if(url.pathname.endsWith('/save_catalog')){const body=req.postDataJSON();state.calls.push(body);state.catalog=body.payload;state.version++;data=state.version;}
   else if(url.searchParams.get('action')==='upload-product-image'){data={url:'https://registration-test.supabase.co/storage/v1/object/public/product-images/fixture.png'};state.calls.push({upload:true,mime:req.headers()['content-type']});}
   else if(url.pathname.endsWith('/trier-api')){
     const b=req.postDataJSON();state.calls.push(b);if(state.offline)return route.fulfill({status:503,json:{error:'provider_unavailable'}});
     if(b.action==='registration-search'){
       if(!['browse','name','code','ean'].includes(b.mode)||(b.mode==='code'||b.mode==='ean')&&!b.query)return route.fulfill({status:400,json:{error:'invalid_query'}});
       data={rows:state.rows.filter(r=>b.mode==='code'?r.shortCode===b.query:b.mode==='ean'?r.ean===b.query:true),nextOffset:2,hasMore:false};
     }
     if(b.action==='registration-preview'){const rows=state.rows.filter(r=>b.codes.includes(r.shortCode)),previewId='preview:'+crypto.randomUUID();state.previews.set(previewId,rows);data={rows,previewId};}
   }else if(url.pathname.endsWith('/admin-api')){
     const b=req.postDataJSON();state.calls.push(b);
     if(b.action==='registration-inventory')data={inventory:[]};
     if(b.action==='registration-commit'){
       if(state.ledger.has(b.batchId))data=state.ledger.get(b.batchId);
       else {if(b.version!==state.version)return route.fulfill({status:409,json:{error:'O catálogo mudou. Recarregue.'}});const result=buildRegistration(state.catalog,state.previews.get(b.previewId),b.choices);state.catalog=result.catalog;state.version++;data={version:state.version,report:result.report,completed:true};state.ledger.set(b.batchId,data);}
       if(state.lost){state.lost=false;return route.abort();}
     }
     if(b.action==='registration-result')data=state.ledger.get(b.batchId)||{completed:false};
   }else if(url.pathname.includes('/publications')||url.pathname.includes('/traffic_summary')||url.pathname.includes('/registration_history'))data=[];
   await route.fulfill({json:data});
 });
 await page.goto('/admin/');await expect(page.locator('#login-screen')).toBeHidden();return state;
}
async function selectRows(page){await page.locator('.sidebar [data-view="registration"]').click();await page.locator('[data-search-form] [name=mode]').selectOption('browse');await page.getByRole('button',{name:'Consultar Trier',exact:true}).click();await expect(page.locator('[data-results] tr')).toHaveCount(2);await page.getByRole('button',{name:'Selecionar página',exact:true}).click();await page.getByRole('button',{name:'Revisar selecionados',exact:true}).click();await expect(page.getByRole('dialog',{name:'Revisar importação da Trier'})).toBeVisible();}
test('code and EAN filters remain present while the request locks the form',async({page})=>{
 const state=await setup(page);await page.locator('.sidebar [data-view="registration"]').click();const form=page.locator('[data-search-form]');await form.locator('[name=query]').fill('900001');await form.getByRole('button',{name:'Consultar Trier',exact:true}).click();await expect(page.locator('[data-results]')).toContainText('SHAMPOO DOVE');expect(state.calls.find(c=>c.action==='registration-search')).toMatchObject({mode:'code',query:'900001',activeOnly:true});
 await form.locator('[name=mode]').selectOption('ean');await form.locator('[name=query]').fill('7900000000002');await form.locator('[name=activeOnly]').uncheck();await form.getByRole('button',{name:'Consultar Trier',exact:true}).click();await expect(page.locator('[data-results]')).toContainText('CONDICIONADOR DOVE');expect(state.calls.filter(c=>c.action==='registration-search').at(-1)).toMatchObject({mode:'ean',query:'7900000000002',activeOnly:false});
});
test('real import UI reviews a controlled batch and creates inactive drafts without touching existing products or publishing',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const state=await setup(page);const before=structuredClone(state.catalog.products);await selectRows(page);
 const dialog=page.getByRole('dialog',{name:'Revisar importação da Trier'});await expect(dialog).toContainText('Filial 2');await expect(dialog.locator('[data-choice]')).toHaveCount(2);
 expect(state.catalog.products).toEqual(before);await dialog.getByRole('button',{name:'Confirmar importação no rascunho'}).click();await expect(dialog).toBeHidden();await expect(page.locator('[data-import-status]')).toContainText('2 itens salvos');
 expect(state.catalog.products.slice(0,before.length)).toEqual(before);expect(state.catalog.products.slice(-2).every(p=>!p.active&&p.imagePending&&p.imageUrl===PENDING_IMAGE&&!p.availableStore1)).toBe(true);expect(state.calls.some(c=>c.action==='publish')).toBe(false);expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('a lost import response recovers the same batch without adding products twice',async({page})=>{
 const state=await setup(page,{lost:true});const count=state.catalog.products.length;await selectRows(page);const dialog=page.getByRole('dialog',{name:'Revisar importação da Trier'});await dialog.getByRole('button',{name:'Confirmar importação no rascunho'}).click();await expect(dialog.locator('[data-commit-status]')).toContainText('Recuperar importação');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('button',{name:'Recuperar importação',exact:true}).click();await expect(page.locator('[data-import-status]')).toContainText('Importação recuperada');expect(state.catalog.products).toHaveLength(count+2);expect(state.ledger.size).toBe(1);
});
test('provider failure preserves manual registration, pending values and the current catalogue',async({page})=>{
 const state=await setup(page,{offline:true});const before=structuredClone(state.catalog);await page.locator('.sidebar [data-view="registration"]').click();await page.getByRole('button',{name:'Consultar Trier',exact:true}).click();await expect(page.locator('[data-import-status]')).toContainText('preservados');expect(state.catalog).toEqual(before);
 await page.locator('.sidebar [data-view="products"]').click();await page.locator('#new-product').click();await expect(page.getByRole('heading',{name:'Identificação',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Integração Trier',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Publicação',exact:true})).toBeVisible();
 await page.locator('#product-form [name=name]').fill('Shampoo Dove 250ML');await page.locator('#product-form [name=detail]').click();await expect(page.locator('#product-form [name=category]')).toHaveValue('Cabelos');expect(state.calls.some(c=>c.payload)).toBe(false);
});
test('image preparation compares the original with a real 1200px PNG and uploads only after approval',async({page})=>{
 const state=await setup(page);await page.locator('#new-product').click();await page.locator('[data-prepare-photo]').setInputFiles('assets/products/3.png');await expect(page.locator('.registration-photo-compare')).toBeVisible();expect(state.calls.some(c=>c.upload)).toBe(false);
 const dimensions=await page.locator('[data-treated]').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));expect(dimensions).toEqual({width:1200,height:1200});
 const signature=await page.locator('[data-treated]').evaluate(async img=>Array.from(new Uint8Array(await(await fetch(img.src)).arrayBuffer()).slice(0,8)));expect(signature).toEqual([137,80,78,71,13,10,26,10]);
 await page.getByRole('button',{name:'Aprovar e enviar imagem preparada',exact:true}).click();await expect(page.locator('[data-photo-status]')).toContainText('PNG aprovado enviado');expect(state.calls.find(c=>c.upload).mime).toBe('image/png');expect(state.calls.some(c=>c.payload)).toBe(false);
});
test('manual registration blocks a canonical duplicate code and preserves the entered fields',async({page})=>{
 const state=await setup(page);state.catalog.products[0].shortCode='00900001';await page.reload();await expect(page.locator('#login-screen')).toBeHidden();await page.locator('#new-product').click();
 const f=page.locator('#product-form');await f.locator('[name=name]').fill('PRODUTO NOVO DIFERENTE');await f.locator('[name=shortCode]').fill('900001');await f.locator('[name=imageUrl]').fill('assets/products/3.png');await f.locator('[name=price]').fill('19.99');
 await f.getByRole('button',{name:'Salvar produto',exact:true}).click();const duplicate=page.getByRole('dialog',{name:'Conferir possíveis duplicados'});await expect(duplicate).toBeVisible();await expect(duplicate).toContainText('Código reduzido');await duplicate.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(f.locator('[name=name]')).toHaveValue('PRODUTO NOVO DIFERENTE');expect(state.calls.some(c=>c.payload)).toBe(false);
});
test('concurrent catalog changes stop import without overwriting another editor',async({page})=>{
 const state=await setup(page);const count=state.catalog.products.length;await selectRows(page);state.version++;
 const dialog=page.getByRole('dialog',{name:'Revisar importação da Trier'});await dialog.getByRole('button',{name:'Confirmar importação no rascunho'}).click();await expect(dialog.locator('[data-commit-status]')).toContainText('catálogo mudou');expect(state.catalog.products).toHaveLength(count);expect(state.ledger.size).toBe(0);
});
test('closing the scanner while camera permission is pending stops the stream when it arrives',async({page})=>{
 await page.addInitScript(()=>{window.BarcodeDetector=class{async detect(){return [];}};window.__cameraStopped=0;Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(resolve=>window.__resolveCamera=()=>resolve({getTracks:()=>[{stop(){window.__cameraStopped++;}}]}))}});});
 await setup(page);await page.locator('.sidebar [data-view="registration"]').click();await page.getByRole('button',{name:'Usar câmera para EAN',exact:true}).click();await page.getByRole('button',{name:'Fechar câmera',exact:true}).click();await page.evaluate(()=>window.__resolveCamera());await expect.poll(()=>page.evaluate(()=>window.__cameraStopped)).toBe(1);
});
test('photo preparation completing after another product opens never leaks the old image into the new editor',async({page})=>{
 await page.addInitScript(()=>{const original=window.createImageBitmap.bind(window);window.createImageBitmap=file=>new Promise(resolve=>window.__resolveBitmap=async()=>resolve(await original(file)));});
 const state=await setup(page);await page.locator('#new-product').click();await page.locator('[data-prepare-photo]').setInputFiles('assets/products/3.png');await page.locator('#close-editor').click();await page.locator('#new-product').click();await page.evaluate(()=>window.__resolveBitmap());await expect(page.locator('.registration-photo-compare')).toBeHidden();await expect(page.locator('[data-approve-photo]')).toBeHidden();expect(state.calls.some(c=>c.upload)).toBe(false);
});
test('public price ordering follows displayed variant prices while keeping independent cards',async({page})=>{
 const template=original.products[0];await page.route('**/catalog.json*',route=>route.fulfill({json:{...original,products:[{...template,id:8001,name:'FAMÍLIA TESTE',active:true,featured:true,priceCents:9999,variants:[{id:80,size:'M',packageQuantity:30,priceCents:500,stockQuantity:0}]},{...template,id:8002,name:'SIMPLES TESTE',active:true,featured:true,priceCents:600,variants:[]}]}}));
 await page.goto('/');await page.getByLabel('Ordenar produtos',{exact:true}).selectOption('price');await expect(page.locator('.product-card')).toHaveCount(2);await expect(page.locator('.product-card').first()).toContainText('FAMÍLIA TESTE');
});
test('review shows pending photo and duplicate checks; editor can prepare drafts but does not gain publication permission',async({page})=>{
 const state=await setup(page,{role:'editor'});state.catalog.products[0].imagePending=true;state.catalog.products[0].imageUrl=PENDING_IMAGE;state.catalog.products[0].active=false;
 await page.locator('.sidebar [data-view="review"]').click();await expect(page.locator('[data-review-list]')).toContainText('Pendente de foto real');await expect(page.locator('#publish')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
