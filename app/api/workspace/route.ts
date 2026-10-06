import { database } from '@/db/database';
import { initialState, applyAction } from '@/lib/domain.mjs';
import { resolveAccess, assertPermission, visibleState } from '@/lib/access.mjs';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export const dynamic = 'force-dynamic';
const headersOut={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:headersOut});
function scope(request:Request,userId:string){return new URL(request.url).searchParams.get('workspace')||userId}
export async function GET(request:Request){
 try{
  const user=await getChatGPTUser();if(!user)return json({error:'سجّل الدخول لفتح مساحة العمل'},401);
  const workspaceId=scope(request,user.userId);
  if(workspaceId.length>200)return json({error:'مساحة غير صالحة'},400);
  const branch=await database().prepare('SELECT owner_id,category,name FROM business_branches WHERE id=?').bind(workspaceId).first<{owner_id:string,category:string,name:string}>();
  const row=await database().prepare('SELECT payload,revision FROM workspaces WHERE owner_id=?').bind(workspaceId).first<{payload:string,revision:number}>();
  if(!row&&workspaceId!==user.userId)return json({error:'المساحة غير متاحة أو لا تملك صلاحية الوصول'},403);
  const state=row?JSON.parse(row.payload):initialState();
  let access;try{access=resolveAccess(state,user,branch?.owner_id||workspaceId)}catch(e:any){return json({error:e.message},403)}
  return json({state:visibleState(state,access),revision:row?.revision??0,access:{...access,workspaceId,category:branch?.category,branchName:branch?.name}});
 }catch(e){console.error('workspace read failed',e);return json({error:'تعذر تحميل البيانات. حاول مرة أخرى.'},503)}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'يلزم تسجيل الدخول'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'مصدر الطلب غير مسموح'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'نوع الطلب غير صالح'},415);
 const text=await request.text();if(text.length>20000)return json({error:'الطلب أكبر من المسموح'},413);
 let body:any;try{body=JSON.parse(text)}catch{return json({error:'بيانات غير صالحة'},400)}
 if(!body||typeof body!=='object'||!Number.isInteger(body.revision)||body.revision<0)return json({error:'إصدار البيانات غير صالح'},400);
 const workspaceId=scope(request,user.userId);
 if(workspaceId.length>200)return json({error:'مساحة غير صالحة'},400);
 try{
  const db=database();
  if(workspaceId===user.userId)await db.prepare('INSERT OR IGNORE INTO workspaces (owner_id,payload,revision,updated_at) VALUES (?,?,0,?)').bind(workspaceId,JSON.stringify(initialState()),new Date().toISOString()).run();
  const row=await db.prepare('SELECT payload,revision FROM workspaces WHERE owner_id=?').bind(workspaceId).first<{payload:string,revision:number}>();
  if(!row)return json({error:'المساحة غير متاحة أو لا تملك صلاحية الوصول'},403);
  const branch=await db.prepare('SELECT owner_id,category,name FROM business_branches WHERE id=?').bind(workspaceId).first<{owner_id:string,category:string,name:string}>();
  const previous=JSON.parse(row.payload);
  let access;try{access=resolveAccess(previous,user,branch?.owner_id||workspaceId);assertPermission(access,body.action)}catch(e:any){return json({error:e.message},403)}
  if(row.revision!==body.revision)return json({error:'تغيرت البيانات في نافذة أخرى. تم تحديثها؛ أعد المحاولة. مدخلاتك محفوظة.'},409);
  if(body.action?.type==='saveUser'&&body.action.data?.email?.trim().toLowerCase()===user.email.toLowerCase())return json({error:'حساب مسؤول المساحة مستقل ولا يمكن تغيير دوره من هذا النموذج'},400);
  let state:any;try{state=applyAction(previous,body.action)}catch(e:any){return json({error:e.issues?.[0]?.message||e.message||'تحقق من البيانات'},400)}
  const result=await db.prepare('UPDATE workspaces SET payload=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?').bind(JSON.stringify(state),new Date().toISOString(),workspaceId,body.revision).run();
  if(result.meta.changes!==1)return json({error:'سبق حفظ تعديل آخر. حدّث البيانات ثم أعد المحاولة.'},409);
  return json({state:visibleState(state,access),revision:body.revision+1,access:{...access,workspaceId,category:branch?.category,branchName:branch?.name}});
 }catch(e){console.error('workspace write failed',e);return json({error:'تعذر الحفظ الآن. مدخلاتك محفوظة؛ حاول مرة أخرى.'},503)}
}

