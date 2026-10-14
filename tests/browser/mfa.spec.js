import { test, expect } from '@playwright/test';
async function setup(page, { factor = true, failAssurance = false, failCode = false } = {}) {
  await page.route('**/public-config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const config={url:"https://mfa-test.supabase.co",key:"sb_publishable_test"}' }));
  await page.route('**/vendor/supabase.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function createClient(){let level='aal1';window.mfaCalls=[];return {
      auth:{getSession:async()=>({data:{session:{user:{id:'test-user'}}}}),signOut:async()=>{window.mfaCalls.push('signout')},onAuthStateChange:()=>{},
      mfa:{getAuthenticatorAssuranceLevel:async()=>(${failAssurance ? '{error:{message:"unavailable"}}' : '{data:{currentLevel:level}}'}),
      listFactors:async()=>({data:{totp:${factor ? '[{id:"existing",status:"verified"}]' : '[]'}}}),
      enroll:async()=>{window.mfaCalls.push('enroll');return {data:{id:'new',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg"><script>window.qrExecuted=true</script></svg>',secret:'TEST-SETUP-SECRET'}}}},
      challengeAndVerify:async(args)=>{window.mfaCalls.push(args.factorId);${failCode ? 'return {error:{message:"invalid"}}' : "level='aal2';return {data:{}}"}},
      unenroll:async()=>{window.mfaCalls.push('unenroll');return {data:{}}}}},
      from:()=>{const query={select:()=>query,eq:()=>query,single:async()=>({data:{role:'admin',active:true}})};return query},
      functions:{invoke:async()=>({data:{}})}}}
  ` }));
  await page.goto('/admin/');
}
test('existing factor keeps the panel locked until successful verification', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#mfa-form')).toBeVisible();
  await expect(page.locator('body')).toHaveClass('locked');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#mfa-code').fill('123456');
  await page.locator('#mfa-form button').click();
  await expect(page.locator('body')).not.toHaveClass('locked');
  expect(await page.evaluate(() => window.mfaCalls)).toEqual(['existing']);
});
test('invalid code never unlocks the panel', async ({ page }) => {
  await setup(page, { failCode: true });
  await page.locator('#mfa-code').fill('123456');
  await page.locator('#mfa-form button').click();
  await expect(page.locator('#mfa-status')).toContainText('Código não confirmado');
  await expect(page.locator('body')).toHaveClass('locked');
});
test('new account enrolls safely and must verify before entering', async ({ page }) => {
  await setup(page, { factor: false });
  await page.locator('#mfa-enroll').click();
  await expect(page.locator('#mfa-qr')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(page.locator('body')).toHaveClass('locked');
  expect(await page.evaluate(() => window.qrExecuted)).toBeUndefined();
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('TEST-SETUP-SECRET')))).toBe(false);
  await page.locator('#mfa-code').fill('123456');
  await page.locator('#mfa-form button').click();
  await expect(page.locator('body')).not.toHaveClass('locked');
  await expect(page.locator('#mfa-secret')).toHaveText('');
  await expect(page.locator('#mfa-qr')).not.toHaveAttribute('src');
});
test('assurance lookup failure remains locked and allows logout', async ({ page }) => {
  await setup(page, { failAssurance: true });
  await expect(page.locator('#mfa-status')).toContainText('Não foi possível verificar');
  await expect(page.locator('body')).toHaveClass('locked');
  await expect(page.locator('#mfa-enroll')).toBeHidden();
  await expect(page.locator('#mfa-cancel')).toBeVisible();
});
