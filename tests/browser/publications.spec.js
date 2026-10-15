import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
const id='11111111-1111-4111-8111-111111111111';
async function setup(page){
 const item={id,status:'building',kind:'catalog',draft_version:12,created_at:'2026-10-15T15:30:00Z',started_at:'2026-10-15T15:31:00Z',percent:72,stage:'Preparando os arquivos do site'};
 const state={items:[item,{...item,id:'22222222-2222-4222-8222-222222222222',draft_version:11,status:'published',percent:100,stage:'Site publicado',finished_at:'2026-10-15T14:35:00Z'}],fail:false,calls:[]};
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://pub-test.supabase.co",key:"sb_publishable_test"};'}));
 const user={id,email:'admin@example.test',aud:'authenticated',role:'authenticated'};const token=`e30.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',aal:'aal1',exp:4102444800})).toString('base64url')}.test`;
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pub-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',token_type:'bearer',expires_at:4102444800,user})),{user,token});
 await page.route('https://pub-test.supabase.co/**',async r=>{
  const url=new URL(r.request().url());let data={};
  if(url.pathname.endsWith('/user'))data=user;
  else if(url.pathname.includes('/team_members'))data={role:'admin',active:true};
  else if(url.pathname.includes('/catalog_draft'))data={catalog,version:12};
  else if(url.pathname.includes('/publications')||url.pathname.includes('/traffic_summary'))data=[];
  else if(url.pathname.endsWith('/admin-api')){
   const body=r.request().postDataJSON();state.calls.push(body);
   if(body.action==='publication-history'){if(state.fail)return r.fulfill({status:503,json:{error:'Offline'}});data={items:body.offset?[]:state.items,hasMore:!body.offset,checkedAt:'2026-10-15T15:32:00Z'};}
   if(body.action==='publication-detail')data={publication:{...item,status:'published'},baselineAvailable:true,baselineVersion:11,changes:[{entity:'<img src=x onerror=alert(1)>',field:'Preço',before:1000,after:1500,money:true}],catalog};
  }
  await r.fulfill({json:data});
 });
 await page.goto('/admin/');await expect(page.locator('#login-screen')).toBeHidden();await page.getByRole('button',{name:'Publicações',exact:true}).click();await expect(page.locator('[data-active]')).toContainText('72%');return state;
}
test('publishing tab displays verified progress, timestamps and responsive history',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 await expect(page.locator('#publications-view [data-history]')).toContainText('100%');await expect(page.locator('#publications-view [data-history]')).toContainText('15/10/2026, 12:30:00');await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('.notice')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 await page.locator('#publications-view').screenshot({path:`test-results/publications-${test.info().project.name}.png`});
});
test('details show before and after and immutable snapshot without interpreting stored HTML',async({page})=>{
 await setup(page);await page.locator('#publications-view [data-history] button').first().click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('Comparação com o catálogo publicado na versão 11');await expect(dialog).toContainText('10,00');await expect(dialog).toContainText('15,00');await expect(dialog).toContainText('<img src=x onerror=alert(1)>');await expect(dialog.locator('.pub-changes img')).toHaveCount(0);
 await expect(dialog).toContainText(catalog.products[0].name);await dialog.getByText('Ver cópia completa do catálogo').click();await expect(dialog.locator('details pre')).toBeVisible();await page.getByRole('button',{name:'Fechar detalhes'}).click();await expect(dialog).not.toBeVisible();
});
test('refresh failure retains last progress, pagination and navigation remain usable',async({page})=>{
 const state=await setup(page);state.fail=true;await page.getByRole('button',{name:'Atualizar agora',exact:true}).click();await expect(page.locator('[data-feedback]')).toContainText('últimos dados');await expect(page.locator('[data-active]')).toContainText('72%');
 state.fail=false;await page.getByRole('button',{name:'Próxima página',exact:true}).click();await expect(page.locator('#publications-view [data-page]')).toHaveText('Página 2');await expect(page.locator('#publications-view [data-history]')).toContainText('Nenhuma publicação');await page.getByRole('button',{name:'Página anterior',exact:true}).click();await expect(page.locator('#publications-view [data-page]')).toHaveText('Página 1');await page.locator('nav [data-view=products]').click();await expect(page.locator('#publications-view')).toBeHidden();
});
