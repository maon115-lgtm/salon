import { database } from '@/db/database';
import { initialState, applyAction } from '@/lib/domain.mjs';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export const dynamic = 'force-dynamic';
const headersOut={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:headersOut});
export async function GET(){
 try{
  const user=await getChatGPTUser();if(!user)return json({error:'سجّلي الدخول لفتح مساحة العمل'},401);
  const row=await database().prepare('SELECT payload,revision FROM workspaces WHERE owner_id=?').bind(user.userId).first<{payload:string,revision:number}>();
  return json(row?{state:JSON.parse(row.payload),revision:row.revision}:{state:initialState(),revision:0});
 }catch(e){console.error('workspace read failed',e);return json({error:'تعذر تحميل البيانات. حاولي مرة أخرى.'},503)}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'يلزم تسجيل الدخول'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'مصدر الطلب غير مسموح'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'نوع الطلب غير صالح'},415);
 const text=await request.text();if(text.length>20000)return json({error:'الطلب أكبر من المسموح'},413);
 let body:any;try{body=JSON.parse(text)}catch{return json({error:'بيانات غير صالحة'},400)}
 if(!body||typeof body!=='object'||!Number.isInteger(body.revision)||body.revision<0)return json({error:'إصدار البيانات غير صالح'},400);
 try{
  const db=database();
  await db.prepare('INSERT OR IGNORE INTO workspaces (owner_id,payload,revision,updated_at) VALUES (?,?,0,?)').bind(user.userId,JSON.stringify(initialState()),new Date().toISOString()).run();
  const row=await db.prepare('SELECT payload,revision FROM workspaces WHERE owner_id=?').bind(user.userId).first<{payload:string,revision:number}>();
  if(!row||row.revision!==body.revision)return json({error:'تغيرت البيانات في نافذة أخرى. حدّثي البيانات ثم أعيدي المحاولة؛ مدخلاتك محفوظة في النموذج.'},409);
  let state:any;try{state=applyAction(JSON.parse(row.payload),body.action)}catch(e:any){return json({error:e.issues?.[0]?.message||e.message||'تحققي من البيانات'},400)}
  const result=await db.prepare('UPDATE workspaces SET payload=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?').bind(JSON.stringify(state),new Date().toISOString(),user.userId,body.revision).run();
  if(result.meta.changes!==1)return json({error:'سبق حفظ تعديل آخر. حدّثي البيانات ثم أعيدي المحاولة.'},409);
  return json({state,revision:body.revision+1});
 }catch(e){console.error('workspace write failed',e);return json({error:'تعذر الحفظ الآن. لم نفقد مدخلاتك؛ حاولي مرة أخرى.'},503)}
}
