import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const base=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
test('catalog sorts brands before pagination and keeps individual cards, search and featured selection',async({page})=>{
 const products=Array.from({length:18},(_,i)=>{const brand=['Sempre Livre','Always','Intimus'][i%3];return {...base.products[0],id:9100+i,shortCode:String(9100+i),name:`ABSORVENTE ${brand.toUpperCase()} MODELO ${Math.floor(i/3)+1}`,brand:brand==='Sempre Livre'?'Kenvue':brand==='Always'?'P&G':'Kimberly Clark',detail:'8 unidades',variants:[],active:true,featured:true,createdAt:i===15?'2030-01-01':'2026-01-01'};});
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"",key:""};'}));await page.route('**/catalog.json*',r=>r.fulfill({json:{...base,products}}));await page.addInitScript(()=>localStorage.setItem('dv-analytics-consent','denied'));
 await page.goto('/');await expect(page.locator('#products [data-add]').first()).toHaveAttribute('data-add','9100');
 await page.getByRole('button',{name:'Ver todos os produtos',exact:true}).click();
 const cards=page.locator('#products .product-card');await expect(cards).toHaveCount(12);
 await expect(cards.locator('h3')).toHaveText([...Array.from({length:6},(_,i)=>`ABSORVENTE ALWAYS MODELO ${i+1}`),...Array.from({length:6},(_,i)=>`ABSORVENTE INTIMUS MODELO ${i+1}`)]);
 await page.locator('#load-more').click();await expect(cards).toHaveCount(18);await expect(cards.locator('h3').last()).toHaveText('ABSORVENTE SEMPRE LIVRE MODELO 6');
 await page.getByRole('searchbox',{name:'Buscar produtos',exact:true}).fill('Sempre Livre');await expect(cards).toHaveCount(6);await expect(cards.locator('h3')).toHaveText(Array.from({length:6},(_,i)=>`ABSORVENTE SEMPRE LIVRE MODELO ${i+1}`));
 await cards.last().getByRole('button',{name:'Adicionar',exact:true}).click();await expect(page.locator('#cart-dialog')).toContainText('ABSORVENTE SEMPRE LIVRE MODELO 6');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
