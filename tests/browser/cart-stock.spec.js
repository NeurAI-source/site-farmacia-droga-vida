import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const base=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
async function setup(page,{expanded=false}={}){
 const simple={...base.products.find(p=>!p.variants.length),id:8001,name:'Produto simples de teste',active:true,featured:true,variants:[],stockQuantity:999};
 const diaper={...base.products.find(p=>p.variants.length),id:8002,name:'FR BABYSEC TESTE',active:true,featured:true,variants:[{id:801,size:'M',packageQuantity:38,stockQuantity:999},{id:802,size:'G',packageQuantity:32,stockQuantity:999},{id:803,size:'XG',packageQuantity:30,stockQuantity:999}]};
 const unknown={...simple,id:8003,name:'Produto sem vínculo'};
 const catalog={...base,expandedProductPage:expanded,products:[simple,diaper,unknown]};
 const stamp=new Date().toISOString();
 const rows=[{productId:8001,variantId:null,priceCents:1234,stockQuantity:2,available:true,lastUpdatedAt:stamp},...[['M',801,8],['G',802,0]].map(([size,id,stock])=>({productId:8002,variantId:id,priceCents:3299,stockQuantity:stock,available:stock>0,lastUpdatedAt:stamp}))];
 let writes=0;
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://stock-test.supabase.co",key:"sb_publishable_test"};'}));
 await page.route('**/catalog.json*',r=>r.fulfill({json:catalog}));
 await page.route('https://stock-test.supabase.co/**',r=>{if(r.request().method()==='POST')writes++;return r.fulfill({json:r.request().url().includes('action=inventory')?{inventory:rows}:{}});});
 await page.addInitScript(()=>localStorage.setItem('dv-analytics-consent','denied'));
 return {catalog,rows,get writes(){return writes}};
}
test('all active cards show real independent stock or consult, without replacing the header cart',async({page})=>{
 const state=await setup(page);await page.goto('/');
 await expect(page.locator('.cart-trigger')).toHaveCount(1);await expect(page.locator('.dv-cart-launch')).toBeVisible();
 const simple=page.locator('.product-card').filter({has:page.locator('[data-add="8001"]')});
 await expect(simple).toContainText('2 unidades disponíveis');await expect(simple).not.toContainText('999');
 const diaper=page.locator('.product-card').filter({has:page.locator('[data-add="8002"]')});
 await expect(diaper.locator('[data-stock-size="M"]')).toContainText('8 pac.');await expect(diaper.locator('[data-stock-size="G"]')).toBeDisabled();
 await expect(diaper.locator('[data-stock-size="XG"]')).toContainText('Consultar');
 await expect(page.locator('[data-stock-id="8003"]')).toContainText('Consulte a disponibilidade');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);expect(state.writes).toBe(0);
});
test('adding opens chat, shares the header count, limits stock and keeps checkout off the top of the page',async({page})=>{
 await setup(page);await page.goto('/');await page.locator('[data-add="8001"]').click();
 await expect(page.locator('#cart-dialog')).toBeVisible();await expect(page.locator('#cart-count')).toHaveText('1');
 await page.getByRole('button',{name:'Aumentar quantidade de Produto simples de teste',exact:true}).click();
 await expect(page.getByRole('button',{name:'Aumentar quantidade de Produto simples de teste',exact:true})).toBeDisabled();
 await expect(page.locator('.dv-chat-total')).toContainText('24,68');
 await page.getByRole('button',{name:/Continuar comprando/}).click();const y=await page.evaluate(()=>scrollY);
 await page.getByRole('button',{name:'Abrir pré-pedido flutuante'}).click();await page.getByRole('button',{name:'Fechar carrinho'}).click();
 expect(Math.abs(await page.evaluate(()=>scrollY)-y)).toBeLessThan(3);
 await page.getByRole('button',{name:'Abrir carrinho',exact:true}).click();await page.getByRole('button',{name:'Continuar para o WhatsApp →',exact:true}).click();
 await page.locator('#order-form').getByLabel('Seu nome',{exact:true}).fill('Cliente de teste');await page.getByLabel('Forma de recebimento').selectOption('retirada');
 await expect(page.locator('#neighborhood-label')).not.toBeVisible();await page.getByRole('button',{name:'Revisar meu pré-pedido →'}).click();
 await expect(page.locator('#order-preview')).toContainText('Cliente de teste');await expect(page.locator('#order-preview')).toContainText('Retirada');
 await page.context().route('https://wa.me/**',r=>r.fulfill({body:'WhatsApp interceptado pelo teste'}));
 const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'Continuar no WhatsApp →',exact:true}).click();const win=await popup;await win.waitForLoadState();
 expect(decodeURIComponent(win.url())).toContain('PRÉ-PEDIDO');expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('Cliente de teste');
});
test('individual product page selects size, adds to the same chat and never forces return to the homepage',async({page})=>{
 await setup(page,{expanded:true});await page.goto('/');
 await page.locator('[data-stock-id="8002"] [data-stock-size="M"]').click();
 await expect(page).toHaveURL(/produto.html\?id=8002/);await expect(page.locator('#product-page-variant')).toHaveValue('M');
 await expect(page.locator('[data-stock-size="G"]')).toBeDisabled();
 await page.getByRole('button',{name:'Adicionar ao pré-pedido',exact:true}).click();await expect(page.locator('#cart-dialog')).toBeVisible();
 await expect(page.locator('#cart-items')).toContainText('M · 38 unidades por pacote');await expect(page).toHaveURL(/produto.html/);
 await page.getByRole('button',{name:'Fechar carrinho'}).click();await page.getByRole('link',{name:/Ver meu pré-pedido/}).click();await expect(page.locator('#cart-dialog')).toBeVisible();
});
test('delivery requires a neighborhood and preserves customer inputs while reviewing without sending',async({page})=>{
 await setup(page);await page.goto('/');await page.locator('[data-add="8001"]').click();
 await page.getByRole('button',{name:'Continuar para o WhatsApp →',exact:true}).click();
 await page.locator('#order-name').fill('Cliente entrega');await page.getByRole('button',{name:'Revisar meu pré-pedido →'}).click();
 await expect(page.locator('#order-form')).toBeVisible();await expect(page.locator('#order-neighborhood')).toHaveAttribute('required','');
 await page.locator('#order-neighborhood').fill('Bairro de teste');await page.getByRole('button',{name:'Revisar meu pré-pedido →'}).click();
 await expect(page.locator('#order-preview')).toContainText('Bairro de teste');await expect(page.locator('#order-preview')).toContainText('Taxa de entrega');
 await page.getByRole('button',{name:'← Voltar',exact:true}).click();await expect(page.locator('#order-name')).toHaveValue('Cliente entrega');await expect(page.locator('#order-neighborhood')).toHaveValue('Bairro de teste');
});
test('expired cache becomes consult instead of exposing old or legacy balances',async({page})=>{
 await setup(page);await page.clock.install();await page.goto('/');await expect(page.locator('[data-stock-id="8001"]')).toContainText('2 unidades disponíveis');
 await page.clock.setSystemTime(new Date(Date.now()+61*60*1000));await page.clock.fastForward(60001);
 await expect(page.locator('[data-stock-id="8001"]')).toContainText('Consulte a disponibilidade');
 await expect(page.locator('[data-stock-id="8002"]')).not.toContainText('8 pac.');
});
