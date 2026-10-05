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
test('public carousel auto-advances, pauses, navigates, opens all pages and zooms without cropping',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await publicRoute(page,()=>payload([makeCampaign(1),makeCampaign(2,{kind:'post',pages:[],link_url:'https://wa.me/5517999999999'})]));
  await page.clock.install();await page.goto('/');await expect(page.locator('#campaign-carousel')).toBeVisible();
  await expect(page.locator('.hero-photo')).toHaveAttribute('src','assets/family.webp');
  await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');await page.clock.runFor(5100);await expect(page.locator('.campaign-name')).toHaveText('Campanha 2');
  await expect(page.locator('.campaign-art')).toHaveAttribute('href','https://wa.me/5517999999999');
  await page.getByRole('button',{name:'Oferta anterior',exact:true}).click();await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');await page.clock.runFor(5500);await expect(page.locator('.campaign-name')).toHaveText('Campanha 1');
  await page.locator('.campaign-art').click();await expect(page.locator('.campaign-viewer')).toBeVisible();await expect(page.locator('[data-page]')).toHaveText('1 de 2');
  await page.getByRole('button',{name:'Próxima página'}).click();await expect(page.locator('[data-page]')).toHaveText('2 de 2');await page.getByRole('button',{name:'Ampliar imagem'}).click();await expect(page.locator('.campaign-viewer img')).toHaveClass('zoomed');
  await page.getByRole('button',{name:'Fechar encarte'}).click();expect(await page.locator('.campaign-art img').evaluate(e=>getComputedStyle(e).objectFit)).toBe('contain');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
  await page.getByRole('button',{name:'Reproduzir carrossel'}).click();await page.clock.runFor(5100);await expect(page.locator('.campaign-name')).toHaveText('Campanha 2');await page.getByRole('button',{name:'Pausar carrossel'}).click();await page.clock.runFor(5100);await expect(page.locator('.campaign-name')).toHaveText('Campanha 2');
  await page.locator('#campaign-carousel').screenshot({path:`test-results/public-${test.info().project.name}.png`});
});
test('expiration closes an open flyer immediately even offline and without further requests',async({page})=>{
  const now=Date.now();let count=0;
  await publicRoute(page,()=>++count===1?payload([makeCampaign(1,{ends_at:new Date(now+5000).toISOString()})],{server_now:new Date(now).toISOString()}):null);
  await page.clock.install({time:now});await page.goto('/');await expect(page.locator('#campaign-carousel')).toBeVisible();await page.locator('.campaign-art').click();await expect(page.locator('.campaign-viewer')).toBeVisible();
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
async function adminRoute(page,role='admin',initial=[]) {
  await config(page);const rows=initial,assets=new Map();let saves=[];
  const user={id,email:'admin@example.test',aud:'authenticated',role:'authenticated'};
  const token=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:4102444800})).toString('base64url')}.test`;
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
      else{const c=rows.find(c=>c.id===b.campaign.id);if(b.action==='duplicate')rows.push({...structuredClone(c),id:crypto.randomUUID(),title:c.title+' (cópia)',version:1,publication_state:'draft',active:false});if(b.action==='deactivate')c.active=false;if(b.action==='archive'){c.active=false;c.publication_state='archived';}if(b.action==='delete')rows.splice(rows.indexOf(c),1);data={id:c.id};}}
    }
    await r.fulfill({json:data});
  });
  return {rows,saves};
}
test('admin creates a multipage flyer, previews, reorders, publishes, edits, duplicates, archives and deletes',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));const state=await adminRoute(page);await page.goto('/admin/');await expect(page.locator('#login-screen')).toBeHidden();
  await page.locator('[data-view="campaigns"]').click();await expect(page.locator('#campaign-feedback')).toContainText('0 campanhas');await page.locator('#campaign-new').click();
  const form=page.locator('#campaign-form');await form.locator('[name=title]').fill('Encarte de teste');await form.locator('[name=kind]').selectOption('flyer');await form.locator('[name=starts_at]').fill(saoPauloInput(Date.now()+86400000));await form.locator('[name=ends_at]').fill(saoPauloInput(Date.now()+2*86400000));
  await page.locator('#campaign-cover-upload').setInputFiles('assets/products/3.png');await expect(page.locator('#campaign-form-feedback')).toContainText('Imagens enviadas');
  await page.locator('#campaign-pages-upload').setInputFiles(['assets/products/5.jpg','assets/family.webp']);await expect(page.locator('#campaign-pages li')).toHaveCount(2);await page.getByRole('button',{name:'Mover página 2 para cima'}).click();
  await page.locator('#campaign-preview-form').click();await expect(page.locator('.campaign-preview-dialog')).toBeVisible();await page.locator('.campaign-preview-dialog .campaign-art').click();await expect(page.locator('[data-page]')).toHaveText('1 de 2');await page.getByRole('button',{name:'Fechar encarte'}).click();await page.getByRole('button',{name:'Fechar prévia'}).click();
  await form.getByRole('button',{name:'Publicar campanha'}).click();await expect(page.locator('#campaign-editor')).not.toBeVisible();await expect(page.locator('.campaign-row')).toHaveCount(1);await expect(page.locator('.campaign-badge')).toHaveText('Programada');expect(state.saves[0].pages).toHaveLength(2);
  const oldOrder=[...state.saves[0].pages];await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByRole('button',{name:'Mover página 2 para cima'}).click();await form.getByRole('button',{name:'Salvar rascunho'}).click();await expect(page.locator('.campaign-badge')).toHaveText('Rascunho');expect(state.saves[1].pages).toEqual(oldOrder.reverse());
  await page.getByRole('button',{name:'Duplicar',exact:true}).click();await expect(page.locator('.campaign-row')).toHaveCount(2);page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Arquivar',exact:true}).first().click();await expect(page.locator('.campaign-row')).toHaveCount(1);
  await page.locator('#campaign-status-filter').selectOption('archived');await page.getByRole('button',{name:'Excluir',exact:true}).click();await expect(page.locator('.campaign-row')).toHaveCount(0);expect(state.rows).toHaveLength(1);
  await page.locator('.sidebar [data-view="products"]').click();await expect(page.locator('#rows tr')).toHaveCount(catalog.products.length);expect(errors).toEqual([]);
});
test('editors only save drafts; admin and campaign layout fit desktop and mobile',async({page})=>{
  await adminRoute(page,'editor',[makeCampaign(1,{kind:'post',pages:[]})]);await page.goto('/admin/');await page.locator('[data-view="campaigns"]').click();await expect(page.locator('.campaign-row')).toHaveCount(1);await page.screenshot({path:`test-results/admin-${test.info().project.name}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.locator('#campaign-new').click();await expect(page.getByRole('button',{name:'Publicar campanha'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Salvar rascunho'})).toBeVisible();
});
test('logged-out visitors cannot open the administrative campaign forms',async({page})=>{
  await config(page);await page.goto('/admin/');await expect(page.locator('#login-screen')).toBeVisible();await expect(page.locator('#campaign-new')).toHaveCount(0);
});
