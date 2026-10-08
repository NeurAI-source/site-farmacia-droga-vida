import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile(new URL('../../catalog.json', import.meta.url), 'utf8'));
const product=catalog.products.find(p=>p.active&&!p.variants.length);
test('página individual mantém pré-pedido no desktop e celular',async({page})=>{
 await page.route('**/catalog.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...catalog,expandedProductPage:true})}));
 await page.goto('/produto.html?id='+product.id);
 await expect(page.getByRole('heading',{level:1,name:product.name})).toBeVisible();
 await expect(page.getByText('Preço, disponibilidade e taxa de entrega sujeitos à confirmação')).toBeVisible();
 await page.getByRole('button',{name:'Adicionar ao pré-pedido'}).click();
 await expect(page.locator('#product-page-feedback')).toContainText('adicionado ao pré-pedido');
 await page.getByRole('link',{name:/Ver meu pré-pedido/}).click();
 await expect(page.locator('#cart-dialog')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});
test('modelo antigo permanece disponível enquanto o recurso está desligado',async({page})=>{
 await page.goto('/produto.html?id='+product.id);
 await expect(page.getByRole('heading',{name:/Esta página ainda não está disponível/})).toBeVisible();
 await page.goto('/');
 await page.locator('[data-detail]').first().click();
 await expect(page.locator('#detail-dialog')).toBeVisible();
});
