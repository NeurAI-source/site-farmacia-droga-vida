import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {saoPauloInput} from '../../campaign-utils.js';
const catalog=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
const asset='http://127.0.0.1:4173/assets/family.webp';
const id='11111111-1111-4111-8111-111111111111';
const makeCampaign=(i,overrides={})=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,version:1,title:`Campanha ${i}`,kind:'flyer',cover_id:id,cover_url:asset,pages:[asset,'http://127.0.0.1:4173/assets/store-1.webp'],link_url:'',starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),sort_order:i,active:true,publication_state:'published',...overrides});
async function config(page){await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://campaign-test.supabase.co",key:"sb_publishable_test"};'}));}
async function publicRoute(page,getData){await config(page);await page.route('https://campaign-test.supabase.co/**',async r=>{if(!r.request().url().includes('action=public'))return r.fulfill({json:{}});const data=await getData();if(data===null)return r.abort();return r.fulfill({headers:{'cache-control':'no-store'},json:data});});}
const payload=(campaigns,other={})=>({server_now:new Date().toISOString(),next_start:null,lease_ms:60000,campaigns,...other});
const currentArt = '.campaign-panel[aria-hidden="false"] .campaign-art';

test('hidden pages stop polling and revalidate before restoring expired campaigns', async({page}) => {
  let snapshots = 0;
  await publicRoute(page, () => { snapshots++; return payload([makeCampaign(1)]); });
  await page.addInitScript(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => Boolean(window.__testHidden) }));
  await page.clock.install(); await page.goto('/');
  await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  const before = snapshots;
  await page.evaluate(() => { window.__testHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(120000);
  expect(snapshots).toBe(before); await expect(page.locator('#campaign-carousel')).toBeHidden();
  await page.evaluate(() => { window.__testHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => snapshots).toBe(before + 1);
  await expect(page.locator('#campaign-carousel')).toBeVisible();
  await page.clock.runFor(22000); await expect.poll(() => snapshots).toBe(before + 2);
});

test('unavailable campaigns retain a bounded retry interval', async({page}) => {
  await config(page); let snapshots = 0;
  await page.route('https://campaign-test.supabase.co/functions/v1/campaign-api?*', async route => { snapshots++; await route.fulfill({ status: 503, json: {} }); });
  await page.clock.install(); await page.goto('/'); await expect.poll(() => snapshots).toBe(1);
  await page.clock.runFor(10000); expect(snapshots).toBe(1);
  await page.clock.runFor(12000); await expect.poll(() => snapshots).toBe(2);
});
test('deployment loads one versioned carousel bundle even when the previous slider is cached',async({page})=>{
  const errors=[],legacyRequests=[];page.on('pageerror',e=>errors.push(e.message));
  await publicRoute(page,()=>payload([makeCampaign(1),makeCampaign(2)]));
  await page.route('**/campaign-slider.js',route=>{legacyRequests.push(route.request().url());return route.fulfill({contentType:'text/javascript',body:'export const oldSlider = true;'});});
  await page.goto('/');await expect(page.locator('#campaign-carousel')).toBeVisible();
  await expect(page.locator('script[src^="campaigns-"]')).toHaveCount(1);
  await mouseDrag(page,-1);await expect(page.locator('.campaign-name')).toHaveText('Campanha 2');
  expect(legacyRequests).toEqual([]);expect(errors).toEqual([]);
});
async function mouseDrag(page,direction,distance=180){
  const stage=page.locator('.campaign-viewport');await stage.scrollIntoViewIfNeeded();const box=await stage.boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+direction*Math.min(distance,box.width*.4),y,{steps:12});await page.mouse.up();
}
test('public carousel loops automatically, supports mouse drag and keeps flyers/links intact without playback or arrow buttons',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await publicRoute(page,()=>payload([makeCampaign(1),makeCampaign(2,{kind:'post',pages:[],link_url:'https://wa.me/5517999999999'})]));
  await page.clock.install();await page.goto('/');await expect(page.locator('#campaign-carousel')).toBeVisible();
  await expect(page.locator('.hero-photo')).toHaveAttribute('src','assets/family.webp');
  await expect(page.locator('[data-campaign-pause],[data-campaign-prev],[data-campaign-next]')).toHaveCount(0);
  await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');await page.clock.runFor(6000);await expect(page.locator('.campaign-name')).toHaveText('Campanha 2');
  await expect(page.locator(currentArt)).toHaveAttribute('href','https://wa.me/5517999999999');
  await mouseDrag(page,1);await page.clock.runFor(800);await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await expect(page.locator('.campaign-viewer')).not.toBeVisible();
  await page.locator(currentArt).click();await expect(page.locator('.campaign-viewer')).toBeVisible();await expect(page.locator('[data-page]')).toHaveText('1 de 2');
  await page.getByRole('button',{name:'Próxima página'}).click();await expect(page.locator('[data-page]')).toHaveText('2 de 2');await page.getByRole('button',{name:'Ampliar imagem'}).click();await expect(page.locator('.campaign-viewer img')).toHaveClass('zoomed');
  await page.getByRole('button',{name:'Fechar encarte'}).click();expect(await page.locator(currentArt+' img').evaluate(e=>getComputedStyle(e).objectFit)).toBe('contain');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
  await page.locator('.campaign-name').click();await page.clock.runFor(6000);await expect(page.locator('.campaign-name')).toHaveText('Campanha 2');
  await page.clock.runFor(6000);await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await expect(page.locator('.campaign-panel')).toHaveCount(3);
  await page.locator('#campaign-carousel').screenshot({path:`test-results/public-${test.info().project.name}.png`});
});
test('expiration closes an open flyer immediately even offline and without further requests',async({page})=>{
  const now=Date.now();let count=0;
  await publicRoute(page,()=>++count===1?payload([makeCampaign(1,{ends_at:new Date(now+5000).toISOString()})],{server_now:new Date(now).toISOString()}):null);
  await page.clock.install({time:now});await page.goto('/');await expect(page.locator('#campaign-carousel')).toBeVisible();await page.locator(currentArt).click();await expect(page.locator('.campaign-viewer')).toBeVisible();
  await page.clock.runFor(5100);await expect(page.locator('#campaign-carousel')).toBeHidden();await expect(page.locator('.campaign-viewer')).not.toBeVisible();await expect(page.locator('.hero')).toBeVisible();
});
test('an empty period is hidden; the next server boundary activates a scheduled campaign',async({page})=>{
  const now=Date.now();let count=0;
  await publicRoute(page,()=>++count===1?payload([],{server_now:new Date(now).toISOString(),next_start:new Date(now+3000).toISOString()}):payload([makeCampaign(1)],{server_now:new Date(now+3100).toISOString()}));
  await page.clock.install({time:now});await page.goto('/');await expect(page.locator('#campaign-carousel')).toHaveAttribute('data-campaign-state','ready');await expect(page.locator('#campaign-carousel')).toBeHidden();await page.clock.runFor(3100);await expect(page.locator('#campaign-carousel')).toBeVisible();
});
test('stale cache and a wrong device date cannot extend offers; offline lease fails closed',async({page})=>{
  const now=Date.now();let count=0;
  await publicRoute(page,()=>++count===1?payload([makeCampaign(1)],{server_now:new Date(now).toISOString()}):null);
  await page.clock.install({time:new Date('2035-01-01T00:00:00Z')});await page.goto('/');await expect(page.locator('#campaign-carousel')).toBeVisible();await page.clock.runFor(61000);await expect(page.locator('#campaign-carousel')).toBeHidden();
});
test('touch follows the finger in both directions, wraps, cancels safely and preserves vertical scrolling',async({page})=>{
  await publicRoute(page,()=>payload([makeCampaign(1),makeCampaign(2),makeCampaign(3)]));
  await page.clock.install();await page.goto('/');await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  const session=await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const stage=page.locator('.campaign-viewport');await stage.scrollIntoViewIfNeeded();
  const box=await stage.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2,distance=Math.min(180,box.width*.35);
  const event=(type,px=x,py=y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:px,y:py,id:1}]});
  const position=()=>page.locator('.campaign-panel[aria-hidden="false"]').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m41);
  const initial=await position();await event('touchStart');await event('touchMove',x+distance,y);await page.clock.runFor(32);
  expect(await position()).toBeGreaterThan(initial+distance*.8);
  await event('touchEnd');await page.clock.runFor(800);await expect(page.locator('.campaign-name')).toHaveText('Campanha 3');
  await expect(page.locator('.campaign-viewer')).not.toBeVisible();
  await event('touchStart');await event('touchMove',x-distance,y);await event('touchEnd');await page.clock.runFor(800);
  await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await event('touchStart');await event('touchMove',x-distance,y);await event('touchCancel');await page.clock.runFor(800);
  await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await expect(page.locator('.campaign-slide')).not.toHaveClass(/is-moving/);
  const scrollBefore=await page.evaluate(()=>scrollY);
  await event('touchStart');await event('touchMove',x,y-130);await event('touchMove',x,y-180);await event('touchEnd');
  await page.clock.runFor(300);expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(scrollBefore+30);
  await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
});
test('mouse drag is live, short drags snap back and cache refresh reuses the same bounded panels',async({page})=>{
  let calls=0;await publicRoute(page,()=>{calls++;return payload([makeCampaign(1),makeCampaign(2),makeCampaign(3),makeCampaign(4)]);});
  await page.clock.install();await page.goto('/');await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await page.locator('.campaign-panel').evaluateAll(nodes=>nodes.forEach((node,i)=>node.dataset.original=String(i)));
  const stage=page.locator('.campaign-viewport');await stage.scrollIntoViewIfNeeded();const box=await stage.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const initial=await page.locator('.campaign-panel[aria-hidden="false"]').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m41);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-30,y,{steps:3});await page.clock.runFor(32);
  expect(await page.locator('.campaign-panel[aria-hidden="false"]').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m41)).toBeLessThan(initial-20);
  await page.clock.runFor(120);await page.mouse.up();await page.clock.runFor(400);
  await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await mouseDrag(page,-1);await page.clock.runFor(800);await expect(page.locator('.campaign-name')).toHaveText('Campanha 2');
  await page.clock.runFor(20500);await expect.poll(()=>calls).toBe(2);
  expect(await page.locator('.campaign-panel[data-original]').count()).toBe(4);
  await expect(page.locator('.campaign-panel')).toHaveCount(4);
  await expect(page.locator('.campaign-viewer')).not.toBeVisible();
});
test('reduced motion disables autoplay while keyboard and dots still select images',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await publicRoute(page,()=>payload([makeCampaign(1),makeCampaign(2)]));
  await page.clock.install();await page.goto('/');await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await page.clock.runFor(12000);await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await page.locator(currentArt).focus();await page.keyboard.press('ArrowRight');await expect(page.locator('.campaign-name')).toHaveText('Campanha 2');
  await page.getByRole('button',{name:'Oferta 1: Campanha 1',exact:true}).click();await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
});
test('long titles never shift the page when the carousel advances',async({page})=>{
  const title='Oferta especial para toda a família com várias novidades e condições promocionais disponíveis neste encarte';
  await publicRoute(page,()=>payload([makeCampaign(1),makeCampaign(2,{title})]));await page.clock.install();await page.goto('/');
  await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  const before=await page.locator('#campaign-carousel').boundingBox();await page.clock.runFor(6000);
  await expect(page.locator('.campaign-name')).toHaveText(title);const after=await page.locator('#campaign-carousel').boundingBox();
  expect(Math.abs(after.height-before.height)).toBeLessThan(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('3D depth and tilt are real; a large gallery remains bounded and every image is selectable',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await publicRoute(page,()=>payload(Array.from({length:100},(_,i)=>makeCampaign(i+1))));
  await page.goto('/');await expect(page.locator('.campaign-dots button')).toHaveCount(100);await expect(page.locator('.campaign-panel')).toHaveCount(9);
  expect(await page.locator('.campaign-track').evaluate(e=>getComputedStyle(e).transformStyle)).toBe('preserve-3d');
  const poses=await page.locator('.campaign-panel').evaluateAll(nodes=>nodes.map(e=>{const m=new DOMMatrix(getComputedStyle(e).transform);return {active:e.getAttribute('aria-hidden')==='false',z:m.m43,tilt:m.m13};}));
  expect(poses.find(p=>p.active).z).toBe(0);expect(poses.filter(p=>!p.active).every(p=>p.z<0)).toBe(true);expect(poses.some(p=>Math.abs(p.tilt)>.1)).toBe(true);
  await page.getByRole('button',{name:'Oferta 100: Campanha 100',exact:true}).click();await expect(page.locator('.campaign-name')).toHaveText('Campanha 100');
  await page.getByRole('button',{name:'Oferta 50: Campanha 50',exact:true}).click();await expect(page.locator('.campaign-name')).toHaveText('Campanha 50');await expect(page.locator('.campaign-panel')).toHaveCount(9);
});
async function adminRoute(page,role='admin',initial=[]) {
  await config(page);const rows=initial,assets=new Map(),calls=[],state={failDelete:false,conflictArchive:false};let saves=[];
  const user={id,email:'admin@example.test',aud:'authenticated',role:'authenticated'};
  const token=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',aal:'aal2',exp:4102444800})).toString('base64url')}.test`;
  await page.addInitScript(({user,token})=>localStorage.setItem('sb-campaign-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_at:4102444800,user})),{user,token});
  await page.route('https://campaign-test.supabase.co/**',async r=>{
    const url=new URL(r.request().url());let data={};
    if(url.pathname.endsWith('/user'))data=user;
    else if(url.pathname.includes('/team_members'))data={role,active:true};
    else if(url.pathname.includes('/catalog_draft'))data={catalog,version:7};
    else if(url.pathname.includes('/publications')||url.pathname.includes('/traffic_summary'))data=[];
    else if(url.pathname.endsWith('/campaign-api')){
      if(url.searchParams.get('action')==='upload'){const newId=crypto.randomUUID();assets.set(newId,asset);data={id:newId,url:asset};}
      else{const b=r.request().postDataJSON();if(b.action==='list')data={campaigns:rows,has_more:false,server_now:new Date().toISOString()};
      else if(b.action==='get')data={campaign:rows.find(c=>c.id===b.id)};
      else if(b.action==='save'){saves.push(b.campaign);const c={...b.campaign,version:b.campaign.version+1,cover_url:assets.get(b.campaign.cover_id)||asset,pages:b.campaign.pages.map(id=>({id,url:assets.get(id)||asset}))};const i=rows.findIndex(x=>x.id===c.id);if(i<0)rows.push(c);else rows[i]=c;data={id:c.id};}
      else{const c=rows.find(c=>c.id===b.campaign.id);calls.push(structuredClone(b));if(b.action==='delete'&&state.failDelete)return r.fulfill({status:503,json:{error:'Falha de conexão de teste.'}});if(b.action==='archive'&&state.conflictArchive){state.conflictArchive=false;c.version++;c.title='Editada por outra pessoa';}if(['archive','delete'].includes(b.action)&&b.campaign.version!==c.version)return r.fulfill({status:409,json:{error:'Campanha alterada por outra pessoa. Atualize e tente novamente.'}});if(b.action==='duplicate')rows.push({...structuredClone(c),id:crypto.randomUUID(),title:c.title+' (cópia)',version:1,publication_state:'draft',active:false});if(b.action==='deactivate'){c.active=false;c.version++;}if(b.action==='archive'){c.active=false;c.publication_state='archived';c.version++;}if(b.action==='delete')rows.splice(rows.indexOf(c),1);data={id:c.id};}}
    }
    await r.fulfill({json:data});
  });
  return Object.assign(state,{rows,saves,calls});
}
test('admin creates a multipage flyer, previews, reorders, publishes, edits, duplicates, archives and deletes',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));const state=await adminRoute(page);await page.goto('/admin/');await expect(page.locator('#login-screen')).toBeHidden();
  await page.locator('[data-view="campaigns"]').click();await expect(page.locator('#campaign-feedback')).toContainText('0 campanhas');await page.locator('#campaign-new').click();
  const form=page.locator('#campaign-form');await form.locator('[name=title]').fill('Encarte de teste');await form.locator('[name=kind]').selectOption('flyer');await form.locator('[name=starts_at]').fill(saoPauloInput(Date.now()+86400000));await form.locator('[name=ends_at]').fill(saoPauloInput(Date.now()+2*86400000));
  await page.locator('#campaign-cover-upload').setInputFiles('assets/products/3.png');await expect(page.locator('#campaign-form-feedback')).toContainText('Imagens enviadas');
  await page.locator('#campaign-pages-upload').setInputFiles(['assets/products/5.jpg','assets/family.webp']);await expect(page.locator('#campaign-pages li')).toHaveCount(2);await page.getByRole('button',{name:'Mover página 2 para cima'}).click();
  await page.locator('#campaign-preview-form').click();await expect(page.locator('.campaign-preview-dialog')).toBeVisible();await page.locator('.campaign-preview-dialog .campaign-art').click();await expect(page.locator('.campaign-viewer [data-page]')).toHaveText('1 de 2');await page.getByRole('button',{name:'Fechar encarte'}).click();await page.getByRole('button',{name:'Fechar prévia'}).click();
  await form.getByRole('button',{name:'Publicar campanha'}).click();await expect(page.locator('#campaign-editor')).not.toBeVisible();await expect(page.locator('.campaign-row')).toHaveCount(1);await expect(page.locator('.campaign-badge')).toHaveText('Programada');expect(state.saves[0].pages).toHaveLength(2);
  const oldOrder=[...state.saves[0].pages];await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByRole('button',{name:'Mover página 2 para cima'}).click();await form.getByRole('button',{name:'Salvar rascunho'}).click();await expect(page.locator('.campaign-badge')).toHaveText('Rascunho');expect(state.saves[1].pages).toEqual(oldOrder.reverse());
  await page.getByRole('button',{name:'Duplicar',exact:true}).click();await expect(page.locator('.campaign-row')).toHaveCount(2);page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Arquivar',exact:true}).first().click();await expect(page.locator('.campaign-row')).toHaveCount(1);
  await page.locator('#campaign-status-filter').selectOption('archived');await page.getByRole('button',{name:'Excluir',exact:true}).click();await expect(page.locator('.campaign-row')).toHaveCount(0);expect(state.rows).toHaveLength(1);
  await page.locator('.sidebar [data-view="products"]').click();await expect(page.locator('#rows tr')).toHaveCount(catalog.products.length);expect(errors).toEqual([]);
});
for(const kind of ['post','flyer'])test(`admin deletes a ${kind} directly after confirmation, preserving other campaigns`,async({page})=>{
  const state=await adminRoute(page,'admin',[makeCampaign(1,{kind,publication_state:kind==='post'?'draft':'published'}),makeCampaign(2,{kind})]);
  await page.goto('/admin/');await page.locator('[data-view="campaigns"]').click();
  if(kind==='flyer')await page.getByRole('tab',{name:'Encartes',exact:true}).click();
  await expect(page.locator('.campaign-row')).toHaveCount(2);
  page.once('dialog',async d=>{expect(d.message()).toContain('não pode ser desfeita');await d.dismiss();});
  await page.getByRole('button',{name:'Excluir',exact:true}).first().click();
  expect(state.calls).toEqual([]);expect(state.rows).toHaveLength(2);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Excluir',exact:true}).first().click();
  await expect(page.locator('#campaign-feedback')).toHaveText('Campanha excluída.');
  await expect(page.locator('.campaign-row')).toHaveCount(1);
  expect(state.rows[0].id).toBe(makeCampaign(2).id);
  expect(state.calls.map(c=>[c.action,c.campaign.version])).toEqual([['archive',1],['delete',2]]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('failed deletion keeps the archived campaign and allows a safe retry without archiving twice',async({page})=>{
  const state=await adminRoute(page,'admin',[makeCampaign(1,{kind:'post'})]);state.failDelete=true;
  await page.goto('/admin/');await page.locator('[data-view="campaigns"]').click();page.on('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Excluir',exact:true}).click();
  await expect(page.locator('#campaign-feedback')).toContainText('foi arquivada');
  expect(state.rows).toHaveLength(1);expect(state.rows[0].publication_state).toBe('archived');
  state.failDelete=false;await page.locator('#campaign-status-filter').selectOption('archived');
  await page.getByRole('button',{name:'Excluir',exact:true}).click();
  await expect(page.locator('#campaign-feedback')).toHaveText('Campanha excluída.');
  expect(state.rows).toHaveLength(0);expect(state.calls.map(c=>[c.action,c.campaign.version])).toEqual([['archive',1],['delete',2],['delete',2]]);
});
test('a simultaneous edit stops the deletion before archiving or deleting',async({page})=>{
  const state=await adminRoute(page,'admin',[makeCampaign(1,{kind:'post'})]);state.conflictArchive=true;
  await page.goto('/admin/');await page.locator('[data-view="campaigns"]').click();page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Excluir',exact:true}).click();
  await expect(page.locator('#campaign-feedback')).toContainText('outra pessoa');
  expect(state.rows).toHaveLength(1);expect(state.rows[0].publication_state).toBe('published');
  expect(state.calls.map(c=>c.action)).toEqual(['archive']);
});
test('editors only save drafts; admin and campaign layout fit desktop and mobile',async({page})=>{
  await adminRoute(page,'editor',[makeCampaign(1,{kind:'post',pages:[]})]);await page.goto('/admin/');await page.locator('[data-view="campaigns"]').click();await expect(page.locator('.campaign-row')).toHaveCount(1);await page.screenshot({path:`test-results/admin-${test.info().project.name}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.getByRole('button',{name:'Excluir',exact:true})).toHaveCount(0);
  await page.locator('#campaign-new').click();await expect(page.getByRole('button',{name:'Publicar campanha'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Salvar rascunho'})).toBeVisible();
});
test('logged-out visitors cannot open the administrative campaign forms',async({page})=>{
  await config(page);await page.goto('/admin/');await expect(page.locator('#login-screen')).toBeVisible();await expect(page.locator('#campaign-new')).toHaveCount(0);
});


test('private campaign image downloads once across recycled cards, token refresh and flyer viewer',async({page})=>{
  await config(page);
  let downloads=0,snapshots=0;
  const bytes=readFileSync(new URL('../../assets/family.webp',import.meta.url));
  await page.route('https://campaign-test.supabase.co/**',async route=>{
    if(route.request().url().includes('/trier-api'))return route.fulfill({json:{inventory:[]}});
    if(route.request().url().includes('action=public')){
      const image=`https://campaign-test.supabase.co/storage/v1/object/sign/campaign-images/${id}.webp?token=${++snapshots}`;
      return route.fulfill({headers:{'cache-control':'no-store'},json:payload([makeCampaign(1,{cover_url:image,pages:[image]}),makeCampaign(2,{cover_url:image,pages:[image]})])});
    }
    downloads++;
    return route.fulfill({body:bytes,contentType:'image/webp',headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
  });
  await page.clock.install();await page.goto('/');
  const active=page.locator(`${currentArt} img`);
  await expect(active).toHaveAttribute('src',/^blob:/);
  await expect.poll(()=>active.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await page.clock.runFor(22000);
  await expect.poll(()=>snapshots).toBeGreaterThan(1);
  await page.locator(currentArt).click();
  await expect(page.locator('.campaign-viewer')).toBeVisible();
  await expect(page.locator('.campaign-viewer img')).toHaveAttribute('src',/^blob:/);
  expect(downloads).toBe(1);
});
