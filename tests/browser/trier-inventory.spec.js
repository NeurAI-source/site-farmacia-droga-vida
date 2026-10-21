import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
test('fresh Trier prices and stock appear while checkout remains WhatsApp',async({page})=>{
 const c=structuredClone(catalog);c.products=c.products.slice(0,2).map(p=>({...p,active:true,featured:true,variants:[]}));
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://inventory-test.supabase.co",key:"sb_publishable_test"};'}));
 await page.route('**/catalog.json*',r=>r.fulfill({json:c}));
 await page.route('https://inventory-test.supabase.co/**',r=>r.fulfill({json:r.request().url().includes('action=inventory')?{inventory:[{productId:c.products[0].id,variantId:null,priceCents:1234,stockQuantity:3,available:true,lastUpdatedAt:new Date().toISOString()}]}:{}}));
 await page.goto('/');
 const card=page.locator('.product-card').filter({has:page.locator(`[data-add="${c.products[0].id}"]`)});
 await expect(card.locator('.product-price strong')).toContainText('12,34');
 await expect(card).toContainText('Disponível na unidade de entrega');
 await card.locator('[data-add]').click();await page.getByRole('button',{name:'Abrir carrinho',exact:true}).click();
 await expect(page.locator('#order-form').getByRole('button',{name:/Continuar no WhatsApp/})).toBeVisible();
 await expect(page.getByText('Revisar e enviar à farmácia',{exact:true})).toHaveCount(0);
});
