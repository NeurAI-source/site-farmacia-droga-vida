import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const base=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
async function setup(page,{expanded=false,delayed=false}={}){
 const prototype=base.products.find(p=>!p.variants.length);
 const products=Array.from({length:8},(_,i)=>({...prototype,id:9700+i,name:`Pampers Conforto ${i+1}`,brand:'Pampers',category:'Área Infantil',subcategory:'Fraldas',detail:'Pacote',imageUrl:'assets/products/3.png',variants:[],priceCents:1000+i,active:true,featured:i===0}));
 products.push({...products[0],id:9799,name:'Pampers oculto',active:false});
 products.push({...products[0],id:9800,name:'Loção suave <img src=x onerror="window.injected=true">',brand:'Marca especial',category:'Higiene e cuidados pessoais',subcategory:'Hidratantes',priceCents:990,featured:false});
 products[0].variants=[{id:9801,size:'M',packageQuantity:30,priceCents:1500,stockQuantity:0},{id:9802,size:'G',packageQuantity:25,priceCents:1250,stockQuantity:0}];
 await page.addInitScript(()=>localStorage.setItem('dv-analytics-consent','denied'));
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"",key:""};'}));
 let release;const barrier=delayed?new Promise(r=>release=r):Promise.resolve();
 await page.route('**/catalog.json*',async r=>{await barrier;await r.fulfill({json:{...base,expandedProductPage:expanded,products}});});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/',{waitUntil:delayed?'commit':'load'});
 if(!delayed)await expect(page.locator('#products .product-card')).toHaveCount(1);
 return {products,errors,release};
}
test('existing search suggests at most five active products across the full catalog with current presentation prices',async({page})=>{
 const state=await setup(page);const input=page.getByRole('combobox',{name:'Buscar produtos',exact:true});
 await input.fill('p');await expect(page.locator('#search-suggestions')).toBeHidden();
 await input.fill('pam');const options=page.locator('#search-suggestions [role=option]');await expect(options).toHaveCount(5);await expect(options.first()).toContainText('Pampers Conforto 1');await expect(options.first()).toContainText('A partir de R$ 12,50');await expect(options.first().locator('img')).toBeVisible();
 await expect(page.locator('#products .product-card')).toHaveCount(8);await expect(page.locator('#search-suggestions')).not.toContainText('oculto');
 const list=await page.locator('#search-suggestions').boundingBox();expect(list.x).toBeGreaterThanOrEqual(0);expect(list.x+list.width).toBeLessThanOrEqual(page.viewportSize().width+1);
 await options.nth(1).click();await expect(page.locator('#detail-dialog')).toBeVisible();await expect(page.locator('#detail-dialog h2')).toHaveText('Pampers Conforto 2');await expect(page.locator('#search-suggestions')).toBeHidden();expect(state.errors).toEqual([]);
});
test('keyboard selection opens the right individual page while Enter without a selection keeps all results',async({page})=>{
 await setup(page,{expanded:true});const input=page.locator('#search');await input.fill('pampers');await input.press('Enter');await expect(page.locator('#search-suggestions')).toBeHidden();await expect(page.locator('#products .product-card')).toHaveCount(8);await input.click();await expect(page.locator('#search-suggestions')).toBeVisible();await input.press('ArrowDown');await input.press('ArrowDown');await expect(input).toHaveAttribute('aria-activedescendant','search-suggestions-1');await input.press('Enter');await expect(page).toHaveURL(/produto\.html\?id=9701/);
});
test('accented search, literal product names, empty results and dismissal do not alter the typed query',async({page})=>{
 await setup(page);const input=page.locator('#search');await input.fill('locao');await expect(page.locator('#search-suggestions [role=option]')).toHaveCount(1);await expect(page.locator('#search-suggestions')).toContainText('<img src=x');expect(await page.evaluate(()=>window.injected)).toBeUndefined();
 await input.press('Escape');await expect(input).toHaveValue('locao');await expect(input).toHaveAttribute('aria-expanded','false');await input.press('ArrowUp');await expect(input).toHaveAttribute('aria-activedescendant','search-suggestions-0');
 await page.locator('header .brand').click();await expect(page.locator('#search-suggestions')).toBeHidden();await input.fill('inexistente');await expect(page.locator('#search-suggestions')).toContainText('Nenhum produto encontrado');await expect(page.locator('#search-suggestions [role=option]')).toHaveCount(0);await input.fill('');await expect(page.locator('#search-suggestions')).toBeHidden();
 await input.fill('marca especial');await expect(page.locator('#search-suggestions [role=option]')).toHaveCount(1);await input.press('Tab');await expect(page.locator('#search-suggestions')).toBeVisible();await page.keyboard.press('Tab');await expect(page.locator('#search-suggestions')).toBeHidden();
});
test('typing before catalog load refreshes suggestions when data arrives and clearing category filters dismisses them',async({page})=>{
 const state=await setup(page,{delayed:true});const input=page.locator('#search');await input.fill('pam');await expect(page.locator('#search-suggestions')).toContainText('Nenhum produto encontrado');state.release();await expect(page.locator('#search-suggestions [role=option]')).toHaveCount(5);await page.locator('.nav [data-category="Área Infantil"]').click();await expect(input).toHaveValue('');await expect(page.locator('#search-suggestions')).toBeHidden();expect(state.errors).toEqual([]);
});
