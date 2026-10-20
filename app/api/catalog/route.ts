import {database} from '@/db/database';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {categoryById} from '@/lib/categories.mjs';
import {clientKey,publicBranch,availableSlots,customerReservation} from '@/lib/catalog.mjs';
export const dynamic='force-dynamic';
const json=(x:unknown,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{const p=new URL(req.url).searchParams,db=database();
 if(p.get('mine')==='1'){const u=await getChatGPTUser();if(!u)return json({error:'سجل الدخول لعرض حجوزاتك'},401);const key=await clientKey(u.userId);const rows=await db.customerBranches(key);return json({bookings:rows.flatMap((r:any)=>JSON.parse(r.payload).bookings.filter((b:any)=>b.customerId===key).map((b:any)=>({id:b.id,branch:JSON.parse(r.payload).settings?.name||r.name,category:r.category,city:r.city,date:b.date,time:b.time,service:b.serviceName,price:b.price,status:b.status})))})}
 if(p.has('branch')){const r=await db.listedBranch(p.get('branch'));if(!r)return json({error:'الفرع غير متاح للحجز'},404);const slots=availableSlots(JSON.parse(r.payload),p.get('service'),p.get('date'));return json({slots,revision:r.revision})}
 const category=p.get('category');if(!categoryById(category))return json({error:'اختر فئة صحيحة'},400);const rows=await db.catalog(category);return json({branches:rows.map(publicBranch)});
 }catch{return json({error:'تعذر تحميل النتائج. تحقق من التاريخ وأعد المحاولة.'},400)}}
export async function POST(req:Request){try{const u=await getChatGPTUser();if(!u)return json({error:'يلزم تسجيل الدخول لتأكيد الحجز'},401);if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return json({error:'مصدر غير مسموح'},403);if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير صالح'},415);const text=await req.text();if(text.length>5000)return json({error:'الطلب كبير جدًا'},413);const b=JSON.parse(text);if(!b||typeof b.branch!=='string'||!Number.isInteger(b.revision))return json({error:'طلب غير صالح'},400);const db=database();const row=await db.listedBranch(b.branch);if(!row)return json({error:'الفرع غير متاح للحجز'},404);if(row.revision!==b.revision)return json({error:'تغيرت المواعيد المتاحة. حدّث الأوقات واختر مجددًا.'},409);
 const {state,id}=customerReservation(JSON.parse(row.payload),b,await clientKey(u.userId));const r=await db.saveWorkspace(b.branch,JSON.stringify(state),b.revision,true);if(!r)return json({error:'حُجز الوقت أو أوقف الفرع استقبال الحجوزات. حدّث الأوقات.'},409);return json({id},201);
 }catch(e:any){return json({error:e.issues?.[0]?.message||e.message||'تعذر تأكيد الحجز'},400)}}
