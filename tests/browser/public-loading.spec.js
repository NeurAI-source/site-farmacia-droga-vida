import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
const product={...catalog.products.find(p=>!p.variants.length),active:true,featured:true};
async function setup(page){
 const errors=[],legacy=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/catalog.json*',r=>r.fulfill({json:{...catalog,expandedProductPage:true,products:[product]}}));
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://loading-test.supabase.co",key:"sb_publishable_test"};'}));
 await page.route('https://loading-test.supabase.co/**',r=>r.abort());
 // Reproduce old cached modules with no new exports. New public entry points
 // must not request any of these independently, including versioned old URLs.
 await page.route(/\/(trier-inventory|cart-chat|product-stock|product-detail|catalog-utils)\.js(?:\?.*)?$/,r=>{legacy.push(r.request().url());return r.fulfill({contentType:'text/javascript',body:'export const oldVersion=true;'});});
 return {errors,legacy};
}
test('homepage boots icons, catalog and chat despite legacy cached modules and unavailable inventory',async({page})=>{
 const state=await setup(page);await page.goto('/');
 await expect(page.locator('script[src^="app-"]')).toHaveCount(1);
 await expect(page.locator('#search-form svg')).toBeVisible();
 await expect(page.locator('.product-card')).toHaveCount(1);
 await expect(page.locator('#results')).not.toContainText('Carregando');
 await expect(page.locator('.dv-product-stock')).toContainText('Consulte a disponibilidade');
 await page.getByRole('button',{name:'Abrir pré-pedido flutuante'}).click();
 await expect(page.locator('#cart-dialog')).toBeVisible();
 expect(state.legacy).toEqual([]);expect(state.errors).toEqual([]);
});
test('individual page boots the same cart without mixing old detail and stock modules',async({page})=>{
 const state=await setup(page);await page.goto(`/produto.html?id=${product.id}`);
 await expect(page.locator('script[src^="produto-"]')).toHaveCount(1);
 await expect(page.getByRole('heading',{name:product.name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Adicionar ao pré-pedido',exact:true}).click();
 await expect(page.locator('#cart-dialog')).toBeVisible();
 await expect(page.locator('#cart-items')).toContainText(product.name);
 expect(state.legacy).toEqual([]);expect(state.errors).toEqual([]);
});
