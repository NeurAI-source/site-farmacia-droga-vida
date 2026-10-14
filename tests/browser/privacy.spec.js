import {test,expect} from '@playwright/test';
test('optional analytics stays off until consent and remains off after withdrawal',async({page})=>{
  let requests=0;
  await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://privacy-test.supabase.co",key:"sb_publishable_test"};'}));
  await page.route('https://privacy-test.supabase.co/**',r=>{if(r.request().url().includes('page-view'))requests++;return r.fulfill({status:204});});
  await page.goto('/');await expect(page.getByRole('button',{name:'Não permitir',exact:true})).toBeVisible();expect(requests).toBe(0);
  await page.getByRole('button',{name:'Permitir',exact:true}).click();await expect.poll(()=>requests).toBe(1);
  await page.locator('#privacy').click();await page.getByRole('button',{name:'Alterar preferência de estatísticas'}).click();
  await page.getByRole('button',{name:'Não permitir',exact:true}).click();await page.reload();
  await expect(page.locator('.statistics-choice')).toHaveCount(0);expect(requests).toBe(1);
});
