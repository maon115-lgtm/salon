import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dayNow} from '../lib/domain.mjs';
const base='http://127.0.0.1:5173',ids=[];
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),headers={Cookie:auth.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
const post=(path,b)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(b)});
const read=async path=>{const r=await fetch(base+path,{headers});assert.equal(r.status,200);return r.json()};
const quote=x=>"'"+x.replaceAll("'","''")+"'";
function sql(text){fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/branch-qa.sql',text);const p=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','work/branch-qa.sql'],{encoding:'utf8',timeout:60000});if(p.status!==0)throw Error(p.stderr||p.stdout)}
try{
 assert.equal((await fetch(base+'/api/branches')).status,401);
 for(const category of ['women','spa','men']){
 let r=await post('/api/branches',{category,name:'اختبار آلي '+category,city:'الرياض'});assert.equal(r.status,201);const {id}=await r.json();ids.push(id);
 let w=await read('/api/workspace?workspace='+id);assert.equal(w.access.role,'admin');assert.equal(w.access.category,category);assert.equal(w.state.bookings.length,0);
 assert.ok(!(await read('/api/catalog?category='+category)).branches.some(b=>b.id===id));
 assert.equal((await post('/api/branches',{type:'visibility',id,listed:true})).status,400);
 for(const action of [{type:'saveStaff',data:{id:'same-staff-id',name:'فريق الاختبار',role:'عناية',start:'09:00',end:'18:00',active:true}},{type:'saveService',data:{...w.state.services[0],active:true,price:10000}}]){r=await post('/api/workspace?workspace='+id,{revision:w.revision,action});assert.equal(r.status,200);w=await r.json();assert.equal(w.access.category,category)}
 assert.equal((await post('/api/branches',{type:'visibility',id,listed:true})).status,200);
 const catalog=await read('/api/catalog?category='+category);const b=catalog.branches.find(b=>b.id===id);assert.ok(b);assert.equal(b.services.length,1);assert.equal(b.customers,undefined);
 }
 let w=await read('/api/workspace?workspace='+ids[1]);const d=dayNow(new Date(Date.now()+86400000));const available=await read('/api/catalog?branch='+ids[1]+'&service='+w.state.services[0].id+'&date='+d);assert.ok(available.slots.length);
 const request={branch:ids[1],serviceId:w.state.services[0].id,date:d,time:available.slots[0].time,staffId:available.slots[0].staffId,revision:available.revision,name:'اختبار حجز عميل',phone:'0501234567'};
 const results=await Promise.all([post('/api/catalog',request),post('/api/catalog',request)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 w=await read('/api/workspace?workspace='+ids[1]);assert.equal(w.state.bookings.length,1);assert.equal((await read('/api/workspace?workspace='+ids[0])).state.bookings.length,0);
 const mine=await read('/api/catalog?mine=1');assert.ok(mine.bookings.some(b=>b.id===w.state.bookings[0].id));assert.ok(mine.bookings.every(b=>b.customerId===undefined&&b.notes===undefined));
 assert.equal((await post('/api/branches',{type:'visibility',id:ids[1],listed:false})).status,200);assert.equal((await post('/api/catalog',{...request,revision:w.revision,time:'13:00'})).status,404);
 const foreign=crypto.randomUUID();ids.push(foreign);sql(`INSERT INTO business_branches VALUES(${quote(foreign)},'different-owner','spa','اختبار عزل','الرياض',0,'2026-10-06'); INSERT INTO workspaces VALUES(${quote(foreign)},${quote(JSON.stringify(w.state))},0,'2026-10-06');`);
 assert.equal((await fetch(base+'/api/workspace?workspace='+foreign,{headers})).status,403);assert.equal((await post('/api/branches',{type:'visibility',id:foreign,listed:true})).status,403);assert.ok(!(await read('/api/branches')).branches.some(b=>b.id===foreign));
 console.log('PASS: three category creation, private defaults, setup guard, role metadata, publication, category catalogs, atomic booking race, cross-branch isolation, own bookings, hidden-branch booking denial, foreign-owner read/write/list isolation.');
}finally{if(ids.length)sql('DELETE FROM workspaces WHERE owner_id IN ('+ids.map(quote).join(',')+'); DELETE FROM business_branches WHERE id IN ('+ids.map(quote).join(',')+');');fs.rmSync('work/branch-qa.sql',{force:true})}
