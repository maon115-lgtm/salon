import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {supabaseStore,configuredStore} from '../db/store.mjs';
import {branchState} from '../lib/categories.mjs';

test('Supabase configuration fails closed and rejects browser keys',()=>{
  assert.throws(()=>configuredStore({DB_PROVIDER:'supabase',DB:{}}),/incomplete/);
  assert.throws(()=>configuredStore({SUPABASE_URL:'https://example.supabase.co',DB:{}}),/incomplete/);
  assert.throws(()=>supabaseStore('https://example.supabase.co','sb_publishable_test'),/secret/);
  for(const url of ['http://example.supabase.co','https://user:password@example.supabase.co','https://example.supabase.co/path'])
    assert.throws(()=>supabaseStore(url,'sb_secret_test'),/origin/);
});

test('Network errors hide credentials and database details without retrying',async()=>{
  let attempts=0;
  const store=supabaseStore('https://example.supabase.co','sb_secret_test',async()=>{
    attempts++; return new Response('private database contents',{status:500});
  });
  await assert.rejects(store.getWorkspace('x'),e=>!e.message.includes('private')&&!e.message.includes('sb_secret'));
  assert.equal(attempts,1);
});

test('Redirect responses are rejected without forwarding the server secret',async()=>{
  const calls=[];
  const store=supabaseStore('https://example.supabase.co','sb_secret_test',async(url,options)=>{
    calls.push(String(url));
    // Cloudflare Workers rejects redirect:error before sending a request.
    if(!['manual','follow'].includes(options.redirect))throw Error('Unsupported Worker redirect mode');
    assert.equal(options.redirect,'manual');
    return new Response(null,{status:307,headers:{Location:'https://other.example/collect'}});
  });
  await assert.rejects(store.getWorkspace('x'));
  assert.deepEqual(calls,['https://example.supabase.co/rest/v1/rpc/salon_store']);
});

test('PostgreSQL migration, server adapter and database permissions',async t=>{
  const pg=new PGlite();
  try {
    await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await pg.exec(await readFile(new URL('../supabase/migrations/202610200001_salon_storage.sql',import.meta.url),'utf8'));
    const rpc=async(operation,args)=>(await pg.query('select public.salon_store($1,$2::jsonb) as value',[operation,JSON.stringify(args)])).rows[0].value;
    await t.test('anonymous and signed-in browser roles cannot read or call the RPC',async()=>{
      for(const role of ['anon','authenticated']){
        await pg.exec(`set role ${role}`);
        await assert.rejects(pg.query('select * from public.salon_workspaces'),/permission denied/);
        await assert.rejects(pg.query('select * from public.salon_branches'),/permission denied/);
        await assert.rejects(rpc('get_workspace',{id:'x'}),/permission denied/);
        await pg.exec('reset role');
      }
      const r=await pg.query("select relrowsecurity from pg_class where relname in ('salon_workspaces','salon_branches')");
      assert.equal(r.rows.length,2);assert.ok(r.rows.every(x=>x.relrowsecurity));
    });
    await pg.exec('set role service_role');
    const store=supabaseStore('https://example.supabase.co','sb_secret_test',async(url,options)=>{
      assert.equal(String(url),'https://example.supabase.co/rest/v1/rpc/salon_store');
      assert.equal(options.headers.apikey,'sb_secret_test');
      assert.equal(options.redirect,'manual');
      const body=JSON.parse(options.body);
      return Response.json(await rpc(body.p_operation,body.p_args));
    });
    const state=branchState('spa','اختبار Spa');
    const ready={...state,staff:[{id:'staff',active:true}],services:[{id:'service',active:true,price:100}]};
    await t.test('creating a branch is atomic and defaults to hidden',async()=>{
      await assert.rejects(store.createBranch({id:'bad',owner_id:'a',category:'invalid',name:'فرع',city:'الرياض'},JSON.stringify(state)));
      assert.equal(await store.getWorkspace('bad'),null);
      await store.createBranch({id:'a1',owner_id:'a',category:'spa',name:'اختبار Spa',city:'الرياض'},JSON.stringify(state));
      await store.createBranch({id:'b1',owner_id:'b',category:'men',name:'فرع رجال',city:'جدة'},JSON.stringify(branchState('men','فرع رجال')));
      assert.equal((await store.getBranch('a1')).owner_id,'a');
      assert.equal((await store.getWorkspace('a1')).revision,0);
      assert.deepEqual((await store.listBranches('a')).map(b=>b.id),['a1']);
      assert.deepEqual(await store.catalog('spa'),[]);
      assert.equal(await store.listedBranch('a1'),null);
      assert.equal(await store.setVisibility('a1','a',true,0),false);
    });
    await t.test('CAS rejects stale saves and keeps branches independent',async()=>{
      assert.equal(await store.saveWorkspace('a1',JSON.stringify(ready),0),true);
      assert.equal(await store.saveWorkspace('a1',JSON.stringify(state),0),false);
      assert.equal((await store.getWorkspace('a1')).revision,1);
      assert.equal((await store.getWorkspace('b1')).revision,0);
      assert.equal(await store.setVisibility('a1','b',true,1),false);
      assert.equal(await store.setVisibility('a1','a',true,0),false);
      assert.equal(await store.setVisibility('a1','a',true,1),true);
      assert.equal((await store.catalog('spa')).length,1);
      assert.equal((await store.listedBranch('a1')).revision,1);
      assert.equal((await store.catalog('men')).length,0);
    });
    await t.test('hidden branches reject reservations; own booking lookup persists',async()=>{
      const booked={...ready,settings:{...ready.settings,name:'اسم جديد'},bookings:[{id:'booking',customerId:'client-a'}]};
      assert.equal(await store.saveWorkspace('a1',JSON.stringify(booked),1,true),true);
      assert.equal((await store.customerBranches('client-a')).length,1);
      assert.deepEqual(await store.customerBranches('client-b'),[]);
      assert.equal((await store.listBranches('a'))[0].name,'اسم جديد');
      assert.equal(await store.setVisibility('a1','a',false,2),true);
      assert.equal(await store.saveWorkspace('a1',JSON.stringify(ready),2,true),false);
      assert.equal((await store.getWorkspace('a1')).revision,2);
      assert.equal((await store.customerBranches('client-a')).length,1);
    });
    await t.test('legacy workspace creation never overwrites existing data',async()=>{
      await store.ensureWorkspace('legacy',JSON.stringify(state));
      await store.ensureWorkspace('legacy',JSON.stringify(ready));
      assert.deepEqual(JSON.parse((await store.getWorkspace('legacy')).payload),state);
      await assert.rejects(rpc('arbitrary_sql',{sql:'delete from salon_workspaces'}),/Unsupported/);
    });
  } finally {await pg.close();}
});
