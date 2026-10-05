import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const original=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
const id='11111111-1111-4111-8111-111111111111';
async function setup(page,{role='admin',lost=false}={}){
 const catalog=structuredClone(original);catalog.products=catalog.products.slice(0,2).map((p,i)=>({...p,shortCode:i?'1':'001',variants:[],priceCents:i?800:600}));
 const state={catalog,version:7,batches:[],calls:[],status:'pending',lost};
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://neurai-test.supabase.co",key:"sb_publishable_test"};'}));
 const user={id,email:'admin@example.test',aud:'authenticated',role:'authenticated'};const token=`e30.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:4102444800})).toString('base64url')}.test`;
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-neurai-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',token_type:'bearer',expires_at:4102444800,user})),{user,token});
 await page.route('https://neurai-test.supabase.co/**',async r=>{
  const url=new URL(r.request().url());let data={};
  if(url.pathname.endsWith('/user'))data=user;
  else if(url.pathname.includes('/team_members'))data={role,active:true};
  else if(url.pathname.includes('/catalog_draft'))data={catalog:state.catalog,version:state.version};
  else if(url.pathname.includes('/publications')||url.pathname.includes('/traffic_summary'))data=[];
  else if(url.pathname.endsWith('/admin-api')){
   const b=r.request().postDataJSON();state.calls.push(b);
   if(b.action==='price-history')data={batches:state.batches.map(x=>({...x,publication:x.publication_id?{id:x.publication_id,status:state.status}:null}))};
   if(b.action==='price-batch'){
    let batch=state.batches.find(x=>x.id===b.batchId);
    if(!batch){if(state.version!==b.version)return r.fulfill({status:409,json:{error:'O catálogo mudou. Recarregue e analise novamente.'}});
      b.rows.forEach(row=>state.catalog.products.find(p=>p.id===row.productId).priceCents=row.priceCents);state.version++;
      batch={id:b.batchId,changes:b.rows.map(row=>({...row,name:state.catalog.products.find(p=>p.id===row.productId).name})),after_version:state.version,actor_label:user.email,created_at:new Date().toISOString(),publication_id:b.autoPublish?'job-1':null,restores_id:b.restoresId};state.batches.unshift(batch);}
    if(state.lost){state.lost=false;return r.abort();}data={batch};
   }
   if(b.action==='publication-status'||b.action==='retry-publication')data={publication:b.id?{id:b.id,status:state.status}:null};
  }
  await r.fulfill({json:data});
 });
 await page.goto('/admin/');await expect(page.locator('#login-screen')).toBeHidden();await page.getByRole('button',{name:'Abrir assistente Neur.AI'}).click();return state;
}
async function analyze(page,text='001 5,00\n1 7,00'){await page.locator('#neur-input').fill(text);await page.getByRole('button',{name:'Analisar lote',exact:true}).click();}
test('optional automatic publication requires review, saves one batch and shows verified status and history',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const state=await setup(page);
 await page.getByLabel('Publicar automaticamente após confirmação').check();await analyze(page);
 await expect(page.locator('[data-preview]')).toContainText('001');await expect(page.locator('[data-preview]')).toContainText('6,00');await expect(page.locator('[data-preview]')).toContainText('5,00');expect(state.calls.filter(c=>c.action==='price-batch')).toHaveLength(0);
 await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-message]')).toContainText('Alterações salvas: 2');expect(state.batches).toHaveLength(1);expect(state.calls.find(c=>c.action==='price-batch').autoPublish).toBe(true);
 state.status='building';await page.getByRole('button',{name:'Atualizar histórico'}).click();await expect(page.locator('[data-publication]')).toHaveText('Publicação em andamento.');state.status='published';await page.getByRole('button',{name:'Atualizar histórico'}).click();await expect(page.locator('[data-publication]')).toHaveText('Publicação concluída.');
 await expect(page.locator('[data-history]')).toContainText('admin@example.test');expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('.neur-dialog').screenshot({path:`test-results/neurai-${test.info().project.name}.png`});
});
test('disabled automatic publication saves a draft; editor cannot enable publication',async({page})=>{
 const state=await setup(page,{role:'editor'});await expect(page.getByLabel('Publicar automaticamente após confirmação')).toBeDisabled();await analyze(page);await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-message]')).toContainText('Rascunho salvo');expect(state.calls.find(c=>c.action==='price-batch').autoPublish).toBe(false);
});
test('invalid and duplicated codes block the entire batch before saving',async({page})=>{
 const state=await setup(page);for(const text of ['001 5,00\nmissing 9,99','001 5,00\n001 6,00','001 -1','001 0']){await analyze(page,text);await expect(page.locator('[data-confirm]')).toBeHidden();await expect(page.locator('[data-message]')).toContainText('Nenhum preço');}expect(state.calls.some(c=>c.action==='price-batch')).toBe(false);
});
test('concurrent edit invalidates preview and publishes nothing',async({page})=>{
 const state=await setup(page);await analyze(page);state.version++;await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-message]')).toContainText('catálogo mudou');expect(state.batches).toHaveLength(0);
});
test('lost save response recovers the same request without applying prices again, even after reopening',async({page})=>{
 const state=await setup(page,{lost:true});await analyze(page);await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-recover]')).toBeVisible();await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:'Abrir assistente Neur.AI'}).click();await page.getByRole('button',{name:'Recuperar confirmação do lote'}).click();await expect(page.locator('[data-message]')).toContainText('Alterações salvas');expect(state.version).toBe(8);expect(state.batches).toHaveLength(1);const saves=state.calls.filter(c=>c.action==='price-batch');expect(saves).toHaveLength(2);expect(saves[0].batchId).toBe(saves[1].batchId);
});
test('failed publication retry does not resave prices; restore requires a second reviewed confirmation',async({page})=>{
 const state=await setup(page);await page.getByLabel('Publicar automaticamente após confirmação').check();await analyze(page);await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-message]')).toContainText('Alterações salvas');state.status='failed';await page.getByRole('button',{name:'Atualizar histórico'}).click();await page.locator('.neur-history summary').click();await page.getByRole('button',{name:'Consultar / tentar novamente'}).click();expect(state.calls.filter(c=>c.action==='price-batch')).toHaveLength(1);
 await page.locator('.neur-history summary').click();await page.getByRole('button',{name:'Revisar recuperação dos preços'}).click();await expect(page.locator('[data-preview]')).toContainText('6,00');expect(state.batches).toHaveLength(1);await page.getByRole('button',{name:'Confirmar recuperação dos preços'}).click();await expect(page.locator('[data-message]')).toContainText('Alterações salvas');expect(state.batches).toHaveLength(2);expect(state.catalog.products.map(p=>p.priceCents)).toEqual([600,800]);
});
