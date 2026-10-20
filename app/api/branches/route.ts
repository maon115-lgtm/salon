import {z} from 'zod';
import {database} from '@/db/database';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {branchState} from '@/lib/categories.mjs';
export const dynamic='force-dynamic';
const json=(x:unknown,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{const u=await getChatGPTUser();if(!u)return json({error:'يلزم تسجيل الدخول'},401);const result=await database().listBranches(u.userId);const legacy=await database().getWorkspace(u.userId);return json({branches:result,legacy:!!legacy})}catch{return json({error:'تعذر تحميل الفروع'},503)}}
export async function POST(req:Request){try{const u=await getChatGPTUser();if(!u)return json({error:'يلزم تسجيل الدخول'},401);if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return json({error:'مصدر غير مسموح'},403);if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير صالح'},415);const raw=await req.text();if(raw.length>5000)return json({error:'الطلب كبير جدًا'},413);const b=JSON.parse(raw);const db=database();
 if(b.type==='visibility'){
 const id=z.string().max(80).parse(b.id),listed=z.boolean().parse(b.listed);
 const branch=await db.getBranch(id);if(!branch||branch.owner_id!==u.userId)return json({error:'الفرع غير متاح لهذا الحساب'},403);
 const row=await db.getWorkspace(id);if(!row)return json({error:'بيانات الفرع غير متاحة'},404);
 const state=JSON.parse(row.payload);if(listed&&(!state.staff.some((s:any)=>s.active)||!state.services.some((s:any)=>s.active&&s.price>0)))return json({error:'أضف عضو فريق نشطًا وخدمة مفعلة بسعر محدد قبل إظهار الفرع للعملاء.'},400);
 const result=await db.setVisibility(id,u.userId,listed,row.revision);if(!result)return json({error:'تغيرت بيانات الفرع. حدّث الصفحة وأعد المحاولة.'},409);return json({ok:true});
 }
 const x=z.object({category:z.enum(['women','spa','men']),name:z.string().trim().min(2).max(80),city:z.string().trim().min(2).max(60)}).parse(b);const id=crypto.randomUUID();
 await db.createBranch({id,owner_id:u.userId,...x},JSON.stringify(branchState(x.category,x.name)));
 return json({id},201);
 }catch(e:any){return json({error:e.issues?.[0]?.message||'تعذر حفظ الفرع. تحقق من البيانات وأعد المحاولة.'},400)}}
