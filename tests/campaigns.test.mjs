import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { saoPauloInput,saoPauloISO,validateCampaign,inspectImage,visibleCampaigns,campaignStatus,safeLink } from '../campaign-utils.js';
const admin='11111111-1111-4111-8111-111111111111',editor='22222222-2222-4222-8222-222222222222',outsider='33333333-3333-4333-8333-333333333333';
const cover='44444444-4444-4444-8444-444444444444',page='55555555-5555-4555-8555-555555555555';
const base=()=>({id:crypto.randomUUID(),version:0,title:'Ofertas de outubro',kind:'flyer',cover_id:cover,pages:[cover,page],starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),sort_order:2,active:true,publication_state:'draft',link_url:''});
test('São Paulo schedule ignores the administrator device timezone and includes the last minute',()=>{
  assert.equal(saoPauloISO('2026-10-05T00:00'),'2026-10-05T03:00:00.000Z');
  assert.equal(saoPauloISO('2026-10-10T23:59',true),'2026-10-11T03:00:00.000Z');
  assert.equal(saoPauloInput('2026-10-11T02:59:59Z'),'2026-10-10T23:59');
  assert.throws(()=>saoPauloISO('2026-02-31T12:00'));
  const c={...base(),publication_state:'published',starts_at:saoPauloISO('2026-10-05T00:00'),ends_at:saoPauloISO('2026-10-10T23:59',true)};
  assert.equal(visibleCampaigns([c],Date.parse(c.starts_at)-1).length,0);
  assert.equal(visibleCampaigns([c],Date.parse(c.starts_at)).length,1);
  assert.equal(visibleCampaigns([c],Date.parse(c.ends_at)-1).length,1);
  assert.equal(visibleCampaigns([c],Date.parse(c.ends_at)).length,0);
  assert.equal(campaignStatus(c,Date.parse(c.ends_at)),'expired');
});
test('campaign validation rejects unsafe links, malformed IDs, unordered dates and extra post pages',()=>{
  assert.equal(validateCampaign(base()).title,'Ofertas de outubro');
  for(const patch of [{link_url:'javascript:alert(1)'},{link_url:'https://a:b@example.com'},{cover_id:'../../products/1.png'},{pages:Array(31).fill(page)},{pages:[page,page]},{ends_at:'2000-01-01'},{active:'true'},{publication_state:'archived'},{kind:'post'}])assert.throws(()=>validateCampaign({...base(),...patch}));
  assert.equal(safeLink('https://wa.me/5517999999999'),'https://wa.me/5517999999999');
});
test('real JPG, PNG and WebP pass inspection; spoofed, oversized and truncated images fail',async()=>{
  for(const [path,mime] of [['assets/products/5.jpg','image/jpeg'],['assets/products/3.png','image/png'],['assets/family.webp','image/webp']]){
    const data=new Uint8Array(await readFile(new URL('../'+path,import.meta.url)));
    const info=inspectImage(data,mime);assert.ok(info.width>16&&info.height>16);
    assert.throws(()=>inspectImage(data,'text/html'));assert.throws(()=>inspectImage(data.slice(0,30),mime));
  }
  assert.throws(()=>inspectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),'image/png'));
  assert.throws(()=>inspectImage(new Uint8Array(5242881),'image/jpeg'));
});
test('additive migration: CRUD, ordering, role checks, conflicts, scheduling, grants and private assets',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
      create table auth.users(id uuid primary key); create table public.team_members(user_id uuid primary key references auth.users, role text, active boolean);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table public.catalog_draft(id integer primary key,catalog jsonb,version bigint);insert into public.catalog_draft values(1,'{"products":[{"id":8,"shortCode":"001","priceCents":1599,"stockQuantity":2}]}',7);
      grant usage on schema public,auth,storage to service_role;grant select,update on public.team_members to service_role;
      insert into auth.users values('${admin}'),('${editor}'),('${outsider}');insert into public.team_members values('${admin}','admin',true),('${editor}','editor',true);`);
    const before=await db.query('select * from public.catalog_draft');
    const migration=await readFile(new URL('../supabase/migrations/20261001190410_carousel_campaigns.sql',import.meta.url),'utf8');await db.exec(migration);
    await db.exec(`insert into public.campaign_assets(id,path,mime,size,width,height,uploaded_by) values('${cover}','${cover}.png','image/png',500,100,200,'${admin}'),('${page}','${page}.jpg','image/jpeg',500,100,200,'${editor}');`);
    const write=async(action,actor,payload)=>{await db.exec('set role service_role');try{return (await db.query('select public.campaign_write($1,$2,$3) id',[action,actor,JSON.stringify(payload)])).rows[0].id;}finally{await db.exec('reset role');}};
    const snapshot=async()=>{await db.exec('set role service_role');try{return (await db.query('select public.campaign_public_snapshot() data')).rows[0].data;}finally{await db.exec('reset role');}};
    let c=base();await write('save',editor,c);assert.equal((await snapshot()).campaigns.length,0);
    await assert.rejects(()=>write('save',editor,{...c,version:1,publication_state:'published'}),/administradores/);
    await assert.rejects(()=>write('save',outsider,base()),/Acesso negado/);
    await write('save',admin,{...c,version:1,publication_state:'published',pages:[page,cover]});
    let publicData=await snapshot();assert.equal(publicData.campaigns.length,1);assert.equal(publicData.campaigns[0].page_paths[0],`${page}.jpg`);assert.ok(publicData.server_now);
    await assert.rejects(()=>write('save',admin,{...c,version:1}),/outra pessoa/);
    await assert.rejects(()=>write('save',admin,{...c,version:2,pages:['66666666-6666-4666-8666-666666666666']}),/foreign key/);
    assert.equal((await snapshot()).campaigns.length,1,'invalid edits roll back atomically');
    const duplicate=await write('duplicate',editor,{id:c.id,version:2});const dup=(await db.query('select * from public.campaigns where id=$1',[duplicate])).rows[0];assert.equal(dup.publication_state,'draft');assert.equal(dup.active,false);
    await write('deactivate',editor,{id:c.id,version:2});assert.equal((await snapshot()).campaigns.length,0);
    await write('save',admin,{...c,version:3,publication_state:'published',starts_at:new Date(Date.now()+120000).toISOString()});
    assert.equal((await snapshot()).campaigns.length,0);assert.ok((await snapshot()).next_start);
    await db.query("update public.campaigns set starts_at=now()-interval '2 minutes',ends_at=now()-interval '1 second' where id=$1",[c.id]);assert.equal((await snapshot()).campaigns.length,0);
    await assert.rejects(()=>write('save',admin,{...c,version:4,ends_at:new Date(Date.now()-1000).toISOString(),publication_state:'published'}),/vencida/);
    await write('archive',editor,{id:c.id,version:4});await assert.rejects(()=>write('delete',editor,{id:c.id,version:5}),/administradores/);
    await write('delete',admin,{id:c.id,version:5});assert.equal((await db.query('select * from public.campaign_pages where campaign_id=$1',[c.id])).rows.length,0);
    assert.equal((await db.query('select * from public.campaign_pages where campaign_id=$1',[duplicate])).rows.length,2,'duplicated flyer retains shared assets');
    for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from public.campaigns'),/permission denied/);await assert.rejects(()=>db.query('select public.campaign_public_snapshot()'),/permission denied/);await assert.rejects(()=>db.query('select public.campaign_write($1,$2,$3)',['save',admin,JSON.stringify(base())]),/permission denied/);await db.exec('reset role');}
    assert.equal((await db.query("select public from storage.buckets where id='campaign-images'")).rows[0].public,false);
    assert.deepEqual(await db.query('select * from public.catalog_draft'),before,'catalog untouched');
  }finally{await db.close();}
});
test('hero, catalog data, storefront and existing assets remain byte-for-byte intact',async()=>{
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const hashes={"catalog.json": "bfb440b3592e30fafb2cc4f92d2fd6264da59a1d92ba46ed993d97088ae0ed0f", "app.js": "62172979bcf3edfba0f4352c7fb8078d5d47190fe3f6d5af7f08470e2cdf480e", "styles.css": "df6d7292d0d2168b6a5333ecdc021b974676f6d23f5554e773363a44e778d37d", "assets/family.webp": "39063134a612435d9482690d4868ef12f53dbdc348db6e4c6236296a04153e3c"};
  for(const [path,hash] of Object.entries(hashes))assert.equal(digest(await readFile(new URL('../'+path,import.meta.url))),hash,path);
  const hero=(await readFile(new URL('../index.html',import.meta.url),'utf8')).match(/<section class="hero"[\s\S]*?<\/section>/)[0];
  assert.equal(digest(hero),'0aa1d67aa2b44a8f1c3423c6043c9eded64fe47638d4b8211e808ea11ea9d365');
});
