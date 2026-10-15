import {test,expect} from '@playwright/test';
async function setup(page,{signedIn=false,active=true,invalidPassword=false}={}) {
  await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://login-test.supabase.co",key:"sb_publishable_test"}'}));
  await page.route('**/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:`
    export function createClient(){return {
      auth:{getSession:async()=>({data:{session:(${signedIn}||sessionStorage.getItem('signed-in'))?{user:{id:'test-user'}}:null}}),
      signInWithPassword:async({email,password})=>{if(${invalidPassword})return {error:{message:'invalid'}};
        if(email!=='admin@example.com'||password!=='test-password')throw Error('Unexpected credentials');
        sessionStorage.setItem('signed-in','1');return {data:{}}},
      signOut:async()=>{sessionStorage.removeItem('signed-in')},onAuthStateChange:()=>{},
      mfa:new Proxy({}, {get(){throw Error('Authenticator must not be called')}})},
      from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{role:'admin',active:${active}}})};return q},
      functions:{invoke:async()=>({data:{}})}}}
  `}));
  await page.goto('/admin/');
}
test('email/password login opens an active member panel without an authenticator',async({page})=>{
  await setup(page);
  await expect(page.locator('#login-form')).toBeVisible();
  await page.locator('#login-email').fill('admin@example.com');
  await page.locator('#login-password').fill('test-password');
  await page.locator('#login-form button').click();
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass('locked');
  await expect(page.locator('#mfa-screen')).toHaveCount(0);
});
test('existing password-only sessions resume without enrollment or verification',async({page})=>{
  await setup(page,{signedIn:true});
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('#mfa-screen')).toHaveCount(0);
});
test('incorrect password keeps the panel locked and clears the password',async({page})=>{
  await setup(page,{invalidPassword:true});
  await page.locator('#login-email').fill('admin@example.com');
  await page.locator('#login-password').fill('incorrect');
  await page.locator('#login-form button').click();
  await expect(page.locator('#login-status')).toContainText('Confira e-mail e senha');
  await expect(page.locator('#login-password')).toHaveValue('');
  await expect(page.locator('body')).toHaveClass('locked');
});
test('inactive members remain blocked even with an authenticated password session',async({page})=>{
  await setup(page,{signedIn:true,active:false});
  await expect(page.locator('#login-status')).toContainText('não tem acesso autorizado');
  await expect(page.locator('body')).toHaveClass('locked');
});
