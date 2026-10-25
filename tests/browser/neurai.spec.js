import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const original=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
const id='11111111-1111-4111-8111-111111111111';
async function setup(page,{role='admin',lost=false,seedContent=false}={}){
 const catalog=structuredClone(original);catalog.products=catalog.products.slice(0,2).map((p,i)=>({...p,shortCode:i?'1':'001',variants:[],priceCents:i?800:600}));
 if(seedContent){
  catalog.products[0].content={description:'Descrição histórica preservada',warnings:'Advertência conferida'};
  catalog.products[0].contentSources=['https://fabricante.com.br/produto'];
 }
 const state={catalog,version:7,batches:[],calls:[],status:'pending',lost};
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://neurai-test.supabase.co",key:"sb_publishable_test"};'}));
 const user={id,email:'admin@example.test',aud:'authenticated',role:'authenticated'};const token=`e30.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',aal:'aal2',exp:4102444800})).toString('base64url')}.test`;
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-neurai-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',token_type:'bearer',expires_at:4102444800,user})),{user,token});
 await page.route('https://neurai-test.supabase.co/**',async r=>{
  const url=new URL(r.request().url());let data={};
  if(url.pathname.endsWith('/user'))data=user;
  else if(url.pathname.includes('/team_members'))data={role,active:true};
  else if(url.pathname.includes('/catalog_draft'))data={catalog:state.catalog,version:state.version};
  else if(url.pathname.endsWith('/save_catalog')){const body=r.request().postDataJSON();state.calls.push(body);state.catalog=body.payload;state.version++;data=state.version;}
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
 await expect(page.locator('.neur-dialog [data-history]')).toContainText('admin@example.test');expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('.neur-dialog[aria-labelledby="neur-title"]').screenshot({path:`test-results/neurai-${test.info().project.name}.png`});
});
test('disabled automatic publication saves a draft; editor cannot enable publication',async({page})=>{
 const state=await setup(page,{role:'editor'});await expect(page.getByLabel('Publicar automaticamente após confirmação')).toBeDisabled();await analyze(page);await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-message]')).toContainText('Rascunho salvo');expect(state.calls.find(c=>c.action==='price-batch').autoPublish).toBe(false);
});
test('category suggestions require review, save selected products and protect manual choices',async({page})=>{
 const state=await setup(page);state.catalog.products[0].name='ESM RISQUE TESTE';state.catalog.products[0].category='Perfumaria e Cuidados Pessoais';state.catalog.products[0].subcategory='Higiene pessoal';
 state.catalog.products[1].name='ABS ALWAYS TESTE';state.catalog.products[1].category='Perfumaria e Cuidados Pessoais';state.catalog.products[1].subcategory='';state.catalog.products[1].classification={locked:true,source:'manual'};
 await page.getByRole('button',{name:'Organizar catálogo',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'Organização de categorias'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('Esmaltes');await expect(dialog).toContainText('Escolha manual protegida');
 expect(state.calls.filter(c=>c.payload)).toHaveLength(0);
 await dialog.getByLabel('Classificar ABS ALWAYS TESTE',{exact:true}).isEnabled().then(enabled=>expect(enabled).toBe(false));
 await dialog.getByLabel('Classificar ESM RISQUE TESTE',{exact:true}).check();const prices=state.catalog.products.map(p=>p.priceCents);
 await dialog.getByRole('button',{name:'Confirmar classificações selecionadas'}).click();await expect(dialog).toBeHidden();
 expect(state.catalog.products[0].subcategory).toBe('Esmaltes');expect(state.catalog.products[0].classification.locked).toBe(true);expect(state.catalog.products[1].subcategory).toBe('');expect(state.catalog.products.map(p=>p.priceCents)).toEqual(prices);
});
test('new collagen product suggests Supplements and creates its missing subcategory only when saved',async({page})=>{
 const state=await setup(page),before=structuredClone(state.catalog.products);
 state.catalog.categories.find(c=>c.name==='Suplementos').subcategories=state.catalog.categories.find(c=>c.name==='Suplementos').subcategories.filter(s=>s.name!=='Colágenos');
 await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.locator('#new-product').click();
 const form=page.locator('#product-form');await form.locator('[name=name]').fill('LAVITAN COLAGENO HIDROLISADO 300G');
 await form.locator('[name=detail]').fill('300g');
 await expect(form.locator('[name=category]')).toHaveValue('Suplementos');await expect(form.locator('[name=subcategory]')).toHaveValue('Colágenos');
 expect(state.calls.filter(c=>c.payload)).toHaveLength(0);
 await form.locator('[name=imageUrl]').fill('assets/products/3.png');await form.locator('[name=price]').fill('39.99');
 await form.getByRole('button',{name:'Salvar produto',exact:true}).click();await expect(page.locator('#editor')).toBeHidden();
 expect(state.catalog.products.slice(0,before.length)).toEqual(before);
 expect(state.catalog.products.at(-1).subcategory).toBe('Colágenos');expect(state.catalog.products.at(-1).classification.locked).toBe(true);
 expect(state.catalog.categories.find(c=>c.name==='Suplementos').subcategories.some(s=>s.name==='Colágenos')).toBe(true);
 expect(state.calls.some(c=>c.action==='publish')).toBe(false);
});
test('category management adds defaults, edits structures and enables safe automatic completion',async({page})=>{
 const state=await setup(page);await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.locator('.sidebar [data-view="categories"]').click();
 await page.getByRole('button',{name:'Completar categorias da farmácia'}).click();await expect(page.locator('#category-cards')).toContainText('Absorventes e protetores diários');await expect(page.locator('#category-cards')).toContainText('Esmaltes');
 await page.getByRole('button',{name:'Nova categoria',exact:true}).click();const d=page.getByRole('dialog',{name:'Organização de categorias'});
 await d.getByLabel('Nome da categoria',{exact:true}).fill('Acessórios de teste');await d.getByLabel('Subcategorias — uma por linha',{exact:true}).fill('Acessório A\nAcessório B');await d.getByRole('button',{name:'Salvar categoria'}).click();await expect(d).toBeHidden();await expect(page.locator('#category-cards')).toContainText('Acessório B');
 state.catalog.products[0].name='ESM RISQUE TESTE';state.catalog.products[0].category='Beleza e cosméticos';state.catalog.products[0].subcategory='';
 await page.reload();await expect(page.locator('#login-screen')).toBeHidden();await page.locator('.sidebar [data-view="categories"]').click();
 await page.getByLabel('Completar subcategorias vazias automaticamente enquanto o painel estiver aberto').check();await expect(page.locator('[data-category-status]')).toContainText('Alterações salvas');expect(state.catalog.products[0].subcategory).toBe('Esmaltes');expect(state.catalog.categoryIntelligence.automatic).toBe(true);
});
test('invalid and duplicated codes block the entire batch before saving',async({page})=>{
 const state=await setup(page);for(const text of ['001 5,00\nmissing 9,99','001 5,00\n001 6,00','001 -1','001 0']){await analyze(page,text);await expect(page.locator('[data-confirm]')).toBeHidden();await expect(page.locator('[data-message]')).toContainText('Nenhum preço');}expect(state.calls.some(c=>c.action==='price-batch')).toBe(false);
});

test('classification conflict preserves the reviewed draft and reports a reload instead of overwriting',async({page})=>{
 const state=await setup(page);state.catalog.products[0].name='ESM RISQUE TESTE';state.catalog.products[0].category='Perfumaria e Cuidados Pessoais';state.catalog.products[0].subcategory='Higiene pessoal';
 await page.getByRole('button',{name:'Organizar catálogo',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'Organização de categorias'});await dialog.getByLabel('Classificar ESM RISQUE TESTE',{exact:true}).check();
 await page.route('**/rest/v1/rpc/save_catalog',r=>r.fulfill({status:409,json:{message:'Conflict: reload catalog'}}));
 await dialog.getByRole('button',{name:'Confirmar classificações selecionadas'}).click();await expect(dialog.locator('[data-review-status]')).toContainText('Outro usuário');expect(state.catalog.products[0].subcategory).toBe('Higiene pessoal');expect(state.calls.some(c=>c.action==='publish')).toBe(false);
});

test('classification history recovery requires review and keeps current prices',async({page})=>{
 const state=await setup(page);const product=state.catalog.products[0];product.category='Perfumaria e Cuidados Pessoais';product.subcategory='Esmaltes';product.classification={locked:true,source:'reviewed'};const price=product.priceCents;
 const row={id:1,created_at:new Date().toISOString(),actor_id:id,after_version:7,changes:[{id:product.id,name:product.name,before:{category:product.category,subcategory:'Higiene pessoal',classification:null},after:{category:product.category,subcategory:product.subcategory,classification:product.classification}}]};
 await page.route('**/rest/v1/category_history*',r=>r.fulfill({json:[row]}));
 await page.reload();await expect(page.locator('#login-screen')).toBeHidden();await page.locator('.sidebar [data-view="categories"]').click();await page.getByRole('button',{name:'Consultar histórico de classificação'}).click();await page.locator('[data-category-history-list] summary').click();await page.getByRole('button',{name:'Revisar recuperação',exact:true}).click();const d=page.getByRole('dialog',{name:'Organização de categorias'});await expect(d).toContainText('Higiene pessoal');expect(product.subcategory).toBe('Esmaltes');
 await d.getByRole('button',{name:'Confirmar recuperação',exact:true}).click();await expect(d).toBeHidden();expect(state.catalog.products[0].subcategory).toBe('Higiene pessoal');expect(state.catalog.products[0].priceCents).toBe(price);expect(state.catalog.products[0].classification.locked).toBe(true);
});
test('concurrent edit invalidates preview and publishes nothing',async({page})=>{
 const state=await setup(page);await analyze(page);state.version++;await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-message]')).toContainText('catálogo mudou');expect(state.batches).toHaveLength(0);
});
test('lost save response recovers the same request without applying prices again, even after reopening',async({page})=>{
 const state=await setup(page,{lost:true});await analyze(page);await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-recover]')).toBeVisible();await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:'Abrir assistente Neur.AI'}).click();await page.getByRole('button',{name:'Recuperar confirmação do lote'}).click();await expect(page.locator('[data-message]')).toContainText('Alterações salvas');expect(state.version).toBe(8);expect(state.batches).toHaveLength(1);const saves=state.calls.filter(c=>c.action==='price-batch');expect(saves).toHaveLength(2);expect(saves[0].batchId).toBe(saves[1].batchId);
});
test('failed publication retry does not resave prices; restore requires a second reviewed confirmation',async({page})=>{
 const state=await setup(page);await page.getByLabel('Publicar automaticamente após confirmação').check();await analyze(page);await page.getByRole('button',{name:'Confirmar remarcação',exact:true}).click();await expect(page.locator('[data-message]')).toContainText('Alterações salvas');state.status='failed';await page.getByRole('button',{name:'Atualizar histórico'}).click();await page.locator('.neur-history summary').click();await page.getByRole('button',{name:'Consultar / tentar novamente'}).click();await expect(page.getByRole('button',{name:'Atualizar histórico'})).toBeEnabled();expect(state.calls.filter(c=>c.action==='price-batch')).toHaveLength(1);
 await page.locator('.neur-history summary').click();await page.getByRole('button',{name:'Revisar recuperação dos preços'}).click();await expect(page.locator('[data-preview]')).toContainText('6,00');expect(state.batches).toHaveLength(1);await page.getByRole('button',{name:'Confirmar recuperação dos preços'}).click();await expect(page.locator('[data-message]')).toContainText('Alterações salvas');expect(state.batches).toHaveLength(2);expect(state.catalog.products.map(p=>p.priceCents)).toEqual([600,800]);
});

test('Neur.AI permanece com remarcação e check-up, sem gerador de descrições',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await setup(page);
 await expect(page.locator('.neur-dialog[aria-labelledby="neur-title"]')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Remarcação em lote'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Check-up do cadastro'})).toBeVisible();
 await expect(page.locator('.neur-dialog [data-content-ai-launch]')).toHaveCount(0);
 await expect(page.locator('#content-ai-dialog')).toHaveCount(0);
 await expect(page.locator('#open-neur-content')).toHaveCount(0);
 await expect(page.locator('#open-neur-editor')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('editor de produto nao mostra informacoes detalhadas e preserva textos antigos ao salvar',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const state=await setup(page,{seedContent:true});
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 const id=state.catalog.products[0].id;
 await page.locator('#recent-products [data-edit="'+id+'"]').click();
 await expect(page.locator('#editor')).toBeVisible();
 await expect(page.locator('#editor .content-editor')).toHaveCount(0);
 await expect(page.getByText('Informações para a página individual')).toHaveCount(0);
 await expect(page.locator('#show-content-history')).toHaveCount(0);
 await page.locator('#product-form [name="badge"]').fill('Oferta');
 await page.locator('#product-form [type="submit"]').click();
 await expect(page.locator('#editor')).not.toBeVisible();
 const product=state.catalog.products.find(p=>p.id===id);
 expect(product.content).toEqual({description:'Descrição histórica preservada',warnings:'Advertência conferida'});
 expect(product.contentSources).toEqual(['https://fabricante.com.br/produto']);
 expect(product.badge).toBe('Oferta');
 expect(state.calls.some(x=>x.payload?.products?.length)).toBe(true);
 expect(errors).toEqual([]);
});

test('product image upload shows progress, fills the photo URL and preserves product fields without saving a real product', async ({page}) => {
 const state = await setup(page);
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.locator('#new-product').click();
 await page.locator('#product-form [name="name"]').fill('Produto de teste isolado');
 let release;const wait=new Promise(resolve=>release=resolve);let uploads=0;
 await page.route('**/storage/v1/object/public/product-images/**',route=>route.fulfill({contentType:'image/png',body:readFileSync(new URL('../../assets/products/3.png',import.meta.url))}));
 await page.route('**/functions/v1/admin-api?action=upload-product-image',async route=>{uploads++;await wait;await route.fulfill({json:{url:'https://neurai-test.supabase.co/storage/v1/object/public/product-images/test/test.png'}});});
 await page.locator('#image-upload').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:readFileSync(new URL('../../assets/products/3.png',import.meta.url))});
 await expect(page.locator('#image-upload-status')).toContainText('Enviando imagem');
 await expect(page.locator('#product-form [type="submit"]')).toBeDisabled();
 release();
 await expect(page.locator('#image-upload-status')).toContainText('Imagem enviada');
 await expect(page.getByRole('textbox',{name:'Endereço da imagem'})).toHaveValue(/\/product-images\/test\/test.png$/);
 await expect(page.locator('#product-preview')).toBeVisible();
 await expect.poll(()=>page.locator('#product-preview').evaluate(image=>image.naturalWidth)).toBeGreaterThan(0);
 await expect(page.locator('#product-form [name="name"]')).toHaveValue('Produto de teste isolado');
 await expect(page.locator('#product-form [type="submit"]')).toBeEnabled();
 expect(uploads).toBe(1);expect(state.calls.some(c=>c.payload)).toBe(false);
});
test('upload failure is visible beside the photo and keeps the previous image and unsaved form values', async ({page}) => {
 const state = await setup(page);
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.locator('#recent-products [data-edit]').first().click();
 const old=await page.getByRole('textbox',{name:'Endereço da imagem'}).inputValue();
 await page.locator('#product-form [name="name"]').fill('Nome ainda não salvo');
 await page.route('**/functions/v1/admin-api?action=upload-product-image',route=>route.fulfill({status:503,json:{error:'Não foi possível guardar a imagem. Tente novamente em instantes.'}}));
 await page.locator('#image-upload').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:readFileSync(new URL('../../assets/products/3.png',import.meta.url))});
 await expect(page.locator('#image-upload-status')).toBeVisible();
 await expect(page.locator('#image-upload-status')).toContainText('Não foi possível guardar');
 await expect(page.getByRole('textbox',{name:'Endereço da imagem'})).toHaveValue(old);
 await expect(page.locator('#product-form [name="name"]')).toHaveValue('Nome ainda não salvo');
 await expect(page.locator('#image-upload')).toBeEnabled();expect(state.calls.some(c=>c.payload)).toBe(false);
});

test('Trier manual sync follows background progress without repeating a lost request',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Fechar',exact:true}).click();
 let writes=0,polls=0;
 const start=new Date().toISOString(),finish=new Date(Date.now()+10000).toISOString();
 await page.route('**/functions/v1/trier-api',async route=>{
  const body=route.request().postDataJSON();
  if(body.action==='sync'){writes++;return route.abort();}
  polls++;
  return route.fulfill({json:{enabled:true,run_id:'test-run',started_at:start,lease_until:new Date(Date.now()+60000).toISOString(),finished_at:polls>1?finish:null,summary:{status:'completed',updated:196,errors:0}}});
 });
 await page.locator('#trier-status button').click();
 await expect(page.locator('#trier-status')).toContainText('em andamento');
 await expect(page.locator('#trier-status')).toContainText('Atualizados: 196',{timeout:10000});
 await expect(page.locator('#trier-status button')).toBeEnabled();expect(writes).toBe(1);
});
test('Trier started response is followed until the actual completed status',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Fechar',exact:true}).click();
 let writes=0;
 await page.route('**/functions/v1/trier-api',route=>{
  const body=route.request().postDataJSON();if(body.action==='sync'){writes++;return route.fulfill({status:202,json:{status:'started',runId:'test-run'}});}
  return route.fulfill({json:{enabled:true,run_id:'test-run',started_at:'2026-10-21T00:00:00Z',finished_at:'2026-10-21T00:01:00Z',summary:{updated:196,errors:0}}});
 });
 await page.locator('#trier-status button').click();await expect(page.locator('#trier-status')).toContainText('Atualização iniciada');
 await expect(page.locator('#trier-status')).toContainText('Atualizados: 196',{timeout:10000});expect(writes).toBe(1);
});
