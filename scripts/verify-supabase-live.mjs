// Explicit opt-in: creates a temporary branch through the local application
// and removes only its returned ID from the configured Supabase project.
import assert from 'node:assert/strict';
import {supabaseStore} from '../db/store.mjs';
import {dayNow} from '../lib/domain.mjs';
if(process.env.SUPABASE_TEST_WRITES!=='1')throw Error('Set SUPABASE_TEST_WRITES=1 to allow temporary cloud test records.');
const {SUPABASE_URL,SUPABASE_SECRET_KEY}=process.env;
const store=supabaseStore(SUPABASE_URL,SUPABASE_SECRET_KEY);
const base='http://127.0.0.1:5173';
let branchId;
try {
  assert.equal((await fetch(base+'/api/branches')).status,401);
  const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
  const cookie=auth.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie,'Local development sign-in must be available.');
  const headers={Cookie:cookie,'Content-Type':'application/json'};
  const post=(path,data)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(data)});
  const read=async path=>{const r=await fetch(base+path,{headers});assert.equal(r.status,200);return r.json()};
  const created=await post('/api/branches',{category:'spa',name:'اختبار اتصال مؤقت',city:'الرياض'});
  assert.equal(created.status,201);
  branchId=(await created.json()).id;
  assert.match(branchId,/^[0-9a-f-]{36}$/);
  assert.ok(await store.getBranch(branchId),'Application must write to this Supabase project, not local D1.');
  let w=await read('/api/workspace?workspace='+branchId);
  assert.equal(w.access.role,'admin');assert.equal(w.state.bookings.length,0);
  assert.equal(await store.listedBranch(branchId),null);
  for(const action of [
    {type:'saveStaff',data:{id:'qa-staff',name:'فريق اختبار مؤقت',role:'عناية',start:'09:00',end:'18:00',active:true}},
    {type:'saveService',data:{...w.state.services[0],active:true,price:10000}}
  ]) {
    const r=await post('/api/workspace?workspace='+branchId,{revision:w.revision,action});
    assert.equal(r.status,200);w=await r.json();
  }
  assert.equal((await post('/api/branches',{type:'visibility',id:branchId,listed:true})).status,200);
  const date=dayNow(new Date(Date.now()+86400000));
  const times=await read('/api/catalog?branch='+branchId+'&service='+w.state.services[0].id+'&date='+date);
  assert.ok(times.slots.length);
  const reservation={branch:branchId,serviceId:w.state.services[0].id,date,...times.slots[0],
    revision:times.revision,name:'اختبار اتصال',phone:'0501234567'};
  const raced=await Promise.all([post('/api/catalog',reservation),post('/api/catalog',reservation)]);
  assert.deepEqual(raced.map(r=>r.status).sort(),[201,409]);
  const persisted=await store.getWorkspace(branchId);
  assert.equal(JSON.parse(persisted.payload).bookings.length,1);
  w=await read('/api/workspace?workspace='+branchId);
  assert.equal(w.state.bookings.length,1);
  assert.equal((await post('/api/branches',{type:'visibility',id:branchId,listed:false})).status,200);
  assert.equal((await post('/api/catalog',{...reservation,revision:w.revision})).status,404);
  console.log('PASS: application writes to live Supabase; persisted booking; concurrent 201/409; hidden branch rejects booking.');
} finally {
  if(branchId&&/^[0-9a-f-]{36}$/.test(branchId)) {
    for(const [table,column] of [['salon_branches','id'],['salon_workspaces','owner_id']]) {
      const url=new URL('/rest/v1/'+table,SUPABASE_URL);
      url.searchParams.set(column,'eq.'+branchId);
      const r=await fetch(url,{method:'DELETE',headers:{apikey:SUPABASE_SECRET_KEY},redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw Error('Temporary fixture cleanup failed; inspect only branch ID '+branchId);
    }
    assert.equal(await store.getWorkspace(branchId),null);
    console.log('PASS: temporary cloud branch removed; no pre-existing data modified.');
  }
}
