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

test('classic registration is restored without import or review navigation or background requests',async({page})=>{
 const state=await setup(page);await expect(page.locator('.sidebar [data-view="registration"]')).toHaveCount(0);await expect(page.locator('.sidebar [data-view="review"]')).toHaveCount(0);
 await page.locator('#new-product').click();const f=page.locator('#product-form');await expect(f.locator('.registration-editor-section')).toHaveCount(0);await expect(f.locator('[data-find-trier]')).toHaveCount(0);await expect(f.locator('#image-upload')).toBeVisible();
 await f.locator('[name=name]').fill('Produto manual de teste');await f.locator('[name=shortCode]').fill('990001');await f.locator('[name=brand]').fill('Marca teste');await f.locator('[name=price]').fill('19.99');await f.locator('[name=stockQuantity]').fill('2');await f.locator('[name=imageUrl]').fill('assets/products/3.png');
 await f.getByRole('button',{name:'Salvar produto',exact:true}).click();await expect(page.locator('#editor')).toBeHidden();expect(state.catalog.products.at(-1)).toMatchObject({name:'Produto manual de teste',priceCents:1999,shortCode:'990001',stockQuantity:2});expect(state.calls.some(c=>String(c.action||'').startsWith('registration-'))).toBe(false);expect(state.calls.some(c=>c.action==='publish')).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('classic image upload retains its preview and does not save or publish by itself',async({page})=>{
 const state=await setup(page);const before=structuredClone(state.catalog);await page.locator('#new-product').click();await page.locator('#image-upload').setInputFiles('assets/products/3.png');await expect(page.locator('#image-upload-status')).toContainText('Imagem enviada');expect(state.catalog).toEqual(before);expect(state.calls.some(c=>c.upload)).toBe(true);expect(state.calls.some(c=>c.action==='publish')).toBe(false);
});
test('restored manual form still warns about a duplicate official identity and keeps entered values',async({page})=>{
 const state=await setup(page);state.catalog.products[0].shortCode='00900001';await page.reload();await expect(page.locator('#login-screen')).toBeHidden();await page.locator('#new-product').click();const f=page.locator('#product-form');await f.locator('[name=name]').fill('Produto separado');await f.locator('[name=shortCode]').fill('900001');await f.locator('[name=imageUrl]').fill('assets/products/3.png');await f.locator('[name=price]').fill('19.99');await f.locator('[name=stockQuantity]').fill('1');await f.getByRole('button',{name:'Salvar produto',exact:true}).click();const duplicate=page.getByRole('dialog',{name:'Conferir possíveis duplicados'});await expect(duplicate).toBeVisible();await duplicate.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(f.locator('[name=name]')).toHaveValue('Produto separado');expect(state.calls.some(c=>c.payload)).toBe(false);
});
test('editing an imported variant preserves EAN, ERP metadata, previous price and other fields',async({page})=>{
 const state=await setup(page);const p=state.catalog.products.find(p=>p.variants.length);p.shortCode='';
 p.variants=p.variants.map((v,i)=>({...v,shortCode:String(910000+i),priceCents:1999,oldPriceCents:2499,ean:'79000000000'+String(i+10),trier:{id:'variant-'+v.id,code:String(910000+i),storeId:'2'},customSource:'keep'}));
 const before=structuredClone(p.variants);await page.reload();await expect(page.locator('#login-screen')).toBeHidden();await page.locator('.sidebar [data-view="products"]').click();await page.locator(`#rows [data-edit="${p.id}"]`).click();
 const f=page.locator('#product-form');await f.locator('[name=badge]').fill('Conferido');await f.getByRole('button',{name:'Salvar produto',exact:true}).click();await expect(page.locator('#editor')).toBeHidden();
 const after=state.catalog.products.find(item=>item.id===p.id).variants;
 for(let i=0;i<before.length;i++){expect(after[i].trier).toEqual(before[i].trier);expect(after[i].ean).toBe(before[i].ean);expect(after[i].oldPriceCents).toBe(2499);expect(after[i].customSource).toBe('keep');expect(after[i].id).toBe(before[i].id);}
});
