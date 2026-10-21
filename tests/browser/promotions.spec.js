import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const base=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
async function setup(page){
 const template=base.products.find(p=>!p.variants.length);
 const simple={...template,id:8001,active:true,featured:true,name:'Oferta teste',priceCents:7000,oldPriceCents:null,variants:[]};
 const diaper={...template,id:8002,active:true,featured:true,name:'Fralda teste',priceCents:3000,oldPriceCents:null,variants:[{id:91,size:'M',priceCents:2000,packageQuantity:30},{id:92,size:'G',priceCents:2500,packageQuantity:25}]};
 const stamp=new Date().toISOString();
 const rows=[{productId:8001,variantId:null,priceCents:5699,regularPriceCents:6325,stockQuantity:3,available:true,lastUpdatedAt:stamp},{productId:8002,variantId:91,priceCents:1599,regularPriceCents:2000,stockQuantity:8,available:true,lastUpdatedAt:stamp},{productId:8002,variantId:92,priceCents:2500,regularPriceCents:null,stockQuantity:5,available:true,lastUpdatedAt:stamp}];
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://promotion-test.supabase.co",key:"sb_publishable_test"};'}));
 await page.route('**/catalog.json*',r=>r.fulfill({json:{...base,expandedProductPage:true,products:[simple,diaper]}}));
 await page.route('https://promotion-test.supabase.co/**',r=>r.fulfill({json:r.request().url().includes('action=inventory')?{inventory:rows}:{}}));
 await page.addInitScript(()=>localStorage.setItem('dv-analytics-consent','denied'));
}
test('regular and promotional price appear on card and detail; cart uses the promotional price',async({page})=>{
 await setup(page);await page.goto('/');const card=page.locator('.product-card').filter({has:page.locator('[data-add="8001"]')});
 await expect(card.locator('del')).toContainText('63,25');await expect(card.locator('.product-price strong')).toContainText('56,99');
 await page.locator('[data-add="8001"]').click();await expect(page.locator('.dv-chat-total')).toContainText('56,99');
 await page.getByRole('button',{name:'Aumentar quantidade de Oferta teste',exact:true}).click();await expect(page.locator('.dv-chat-total')).toContainText('113,98');
 await page.getByRole('button',{name:'Fechar carrinho'}).click();await page.getByRole('button',{name:'Oferta teste',exact:true}).click();
 await expect(page.locator('#product-page-price del')).toContainText('63,25');await expect(page.locator('#product-page-price strong')).toContainText('56,99');
});
test('each size has its own promotion; selecting another size never borrows a discount',async({page})=>{
 await setup(page);await page.goto('/produto.html?id=8002&tamanho=M');
 await expect(page.locator('#product-page-price del')).toContainText('20,00');await expect(page.locator('#product-page-price strong')).toContainText('15,99');
 await page.locator('#product-page-variant').selectOption('G');await expect(page.locator('#product-page-price del')).toHaveCount(0);await expect(page.locator('#product-page-price strong')).toContainText('25,00');
 await page.getByRole('button',{name:'Adicionar ao pré-pedido',exact:true}).click();await expect(page.locator('.dv-chat-total')).toContainText('25,00');
});
test('expired integration prices lose the discount and refresh cards and an open cart safely',async({page})=>{
 await setup(page);await page.clock.install();await page.goto('/');await expect(page.locator('.product-card').first().locator('del')).toBeVisible();
 await page.locator('[data-add="8001"]').click();
 await page.clock.setSystemTime(new Date(Date.now()+61*60*1000));await page.clock.fastForward(60001);
 await expect(page.locator('.dv-chat-total')).toContainText('70,00');await page.getByRole('button',{name:'Fechar carrinho'}).click();
 await expect(page.locator('.product-card del')).toHaveCount(0);await expect(page.locator('.product-card').first().locator('.product-price strong')).toContainText('70,00');
});
