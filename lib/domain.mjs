import { z } from 'zod';
export const dayNow=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const minuteNow=(now=new Date())=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);return toMinutes(p)};
export const toMinutes=t=>Number(t.split(':')[0])*60+Number(t.split(':')[1]);
export const clock=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
export const statusLabels={booked:'مؤكد',arrived:'وصلت',inservice:'قيد الخدمة',completed:'مكتمل',cancelled:'ملغي',noshow:'لم تحضر'};
const id=z.string().min(1).max(80);
const name=z.string().trim().min(2,'الاسم قصير جدًا').max(80);
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'الوقت غير صالح');
const date=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(x=>{const d=new Date(x+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===x},'التاريخ غير صالح');
const customer=z.object({id,name,phone:z.string().trim().max(20).refine(x=>!x||/^(05\d{8}|\+9665\d{8})$/.test(x),'رقم الجوال يبدأ بـ05 أو +9665'),notes:z.string().max(500).default('')});
const staff=z.object({id,name,role:z.string().trim().max(60),start:time,end:time,active:z.boolean()}).refine(s=>toMinutes(s.start)<toMinutes(s.end),'نهاية العمل يجب أن تكون بعد البداية');
const service=z.object({id,name,duration:z.number().int().min(5).max(480),buffer:z.number().int().min(0).max(120),price:z.number().int().min(0).max(10000000),active:z.boolean()});
const booking=z.object({id,customerId:id,staffId:id,serviceId:id,date,time,notes:z.string().max(500).default('')});
const settings=z.object({name,open:time,close:time}).refine(s=>toMinutes(s.open)<toMinutes(s.close),'ساعات عمل الفرع غير صحيحة');
export function initialState(d=dayNow()){
 return {demo:true,settings:{name:'صالون مواعيد',open:'09:00',close:'21:00'},customers:[{id:'c1',name:'ليان · تجريبية',phone:'',notes:''},{id:'c2',name:'هند · تجريبية',phone:'',notes:''},{id:'c3',name:'ريم · تجريبية',phone:'',notes:''},{id:'c4',name:'سارة · تجريبية',phone:'',notes:''}],staff:[{id:'e1',name:'نورة',role:'تصفيف الشعر',start:'09:00',end:'21:00',active:true},{id:'e2',name:'سارة',role:'العناية',start:'09:00',end:'21:00',active:true},{id:'e3',name:'ريم',role:'الأظافر',start:'09:00',end:'21:00',active:true}],services:[{id:'s1',name:'قص وتصفيف',duration:45,buffer:15,price:15000,active:true},{id:'s2',name:'عناية بالشعر',duration:60,buffer:15,price:22000,active:true},{id:'s3',name:'مانيكير',duration:30,buffer:10,price:9000,active:true}],bookings:[{id:'b1',customerId:'c1',staffId:'e1',serviceId:'s1',date:d,time:'10:00',duration:45,buffer:15,price:15000,serviceName:'قص وتصفيف',status:'completed',arrival:d+'T09:55:00+03:00',started:d+'T10:05:00+03:00',finished:d+'T10:48:00+03:00',notes:''},{id:'b2',customerId:'c2',staffId:'e2',serviceId:'s2',date:d,time:'11:00',duration:60,buffer:15,price:22000,serviceName:'عناية بالشعر',status:'booked',notes:''},{id:'b3',customerId:'c3',staffId:'e3',serviceId:'s3',date:d,time:'13:00',duration:30,buffer:10,price:9000,serviceName:'مانيكير',status:'booked',notes:''},{id:'b4',customerId:'c4',staffId:'e1',serviceId:'s2',date:d,time:'15:00',duration:60,buffer:15,price:22000,serviceName:'عناية بالشعر',status:'booked',notes:''}],audit:[]};
}
function fail(message){throw new Error(message)}
export function assertSlot(state,b,ignoreId){
 const e=state.staff.find(x=>x.id===b.staffId);
 if(!e||!e.active)fail('الموظفة غير متاحة');
 const start=toMinutes(b.time),end=start+b.duration+b.buffer;
 if(start<Math.max(toMinutes(e.start),toMinutes(state.settings.open))||end>Math.min(toMinutes(e.end),toMinutes(state.settings.close)))fail('الموعد مع الفاصل خارج ساعات العمل');
 for(const other of state.bookings){
  if(other.id===ignoreId||other.date!==b.date||['cancelled','noshow'].includes(other.status))continue;
  const a=toMinutes(other.time),z=a+other.duration+(other.staffId===b.staffId?other.buffer:0);
  const candidateEnd=start+b.duration+(other.staffId===b.staffId?b.buffer:0);
  if((other.staffId===b.staffId||other.customerId===b.customerId)&&start<z&&candidateEnd>a)fail(other.staffId===b.staffId?'يوجد تعارض مع حجز الموظفة، بما فيه الفاصل بين الخدمات':'العميلة لديها موعد متداخل');
 }
}
export function applyAction(original,action,now=new Date()){
 const state=structuredClone(original);
 if(!action||typeof action!=='object')fail('طلب غير صالح');
 let label='';
 if(action.type==='saveCustomer'){
  const x=customer.parse(action.data);const normalized=p=>p.replace(/^\+966/,'0');
  if(x.phone&&state.customers.some(c=>c.id!==x.id&&normalized(c.phone)===normalized(x.phone)))fail('رقم الجوال مسجل لعميلة أخرى');
  upsert(state.customers,x,2000);label='حفظ بيانات عميلة';
 }else if(action.type==='saveStaff'){
  const x=staff.parse(action.data);
  if(!x.active&&state.bookings.some(b=>b.staffId===x.id&&['booked','arrived','inservice'].includes(b.status)))fail('انقلي أو ألغِي الحجوزات المفتوحة قبل إيقاف الموظفة');
  upsert(state.staff,x,50);
  for(const b of state.bookings.filter(b=>b.staffId===x.id&&b.date>=dayNow(now)&&['booked','arrived','inservice'].includes(b.status)))assertSlot(state,b,b.id);
  label='حفظ بيانات موظفة';
 }else if(action.type==='saveService'){
  const x=service.parse(action.data);upsert(state.services,x,200);label='حفظ خدمة';
 }else if(action.type==='saveBooking'){
  const x=booking.parse(action.data);const old=state.bookings.find(b=>b.id===x.id);
  if(old&&!['booked','arrived'].includes(old.status))fail('لا يمكن تعديل حجز بدأ أو انتهى؛ أنشئي حجزًا جديدًا');
  if(!state.customers.some(c=>c.id===x.customerId))fail('اختاري عميلة مسجلة');
  const s=state.services.find(s=>s.id===x.serviceId);
  if(!s||!s.active)fail('الخدمة غير متاحة');
  if(x.date<dayNow(now))fail('لا يمكن إنشاء أو نقل حجز إلى يوم سابق');
  const keep=old&&old.serviceId===x.serviceId;
  const b={...old,...x,duration:keep?old.duration:s.duration,buffer:keep?old.buffer:s.buffer,price:keep?old.price:s.price,serviceName:keep?old.serviceName:s.name,status:old?.status??'booked'};
  assertSlot(state,b,b.id);upsert(state.bookings,b,10000);label=old?'تعديل حجز':'حجز جديد';
 }else if(action.type==='status'){
  const b=state.bookings.find(b=>b.id===action.id);if(!b)fail('الحجز غير موجود');
  const transitions={booked:['arrived','cancelled','noshow'],arrived:['inservice','cancelled'],inservice:['completed'],completed:[],cancelled:[],noshow:[]};
  if(!transitions[b.status].includes(action.status))fail('انتقال حالة غير مسموح');
  if(!['cancelled'].includes(action.status)&&b.date!==dayNow(now))fail('تسجيل الحضور والتنفيذ متاح في يوم الحجز فقط');
  if(action.status==='noshow'&&minuteNow(now)<toMinutes(b.time))fail('لم يحن وقت الموعد بعد');
  if(action.status==='inservice'&&state.bookings.some(o=>o.id!==b.id&&o.staffId===b.staffId&&o.status==='inservice'))fail('الموظفة تنفذ خدمة أخرى الآن');
  b.status=action.status;const k={arrived:'arrival',inservice:'started',completed:'finished'}[action.status];if(k)b[k]=now.toISOString();
  label='تغيير حالة حجز إلى '+statusLabels[action.status];
 }else if(action.type==='settings'){
  state.settings=settings.parse(action.data);
  for(const b of state.bookings.filter(b=>b.date>=dayNow(now)&&['booked','arrived','inservice'].includes(b.status)))assertSlot(state,b,b.id);
  label='تحديث إعدادات الفرع';
 }else if(action.type==='deleteCustomer'){
  if(state.bookings.some(b=>b.customerId===action.id))fail('للعميلة حجوزات مرتبطة؛ لا يمكن حذفها للحفاظ على السجل');
  state.customers=state.customers.filter(c=>c.id!==action.id);label='حذف عميلة';
 }else if(action.type==='clearDemo'){
  if(!state.demo)fail('تم بدء العمل الفعلي بالفعل');
  return {demo:false,settings:{name:'صالوني',open:'09:00',close:'21:00'},customers:[],staff:[],services:[],bookings:[],audit:[{at:now.toISOString(),label:'بدء مساحة عمل فارغة'}]};
 }else fail('عملية غير معروفة');
 state.audit=[{at:now.toISOString(),label},...state.audit].slice(0,100);
 return state;
}
function upsert(list,x,limit){const i=list.findIndex(y=>y.id===x.id);if(i>=0)list[i]=x;else {if(list.length>=limit)fail('تم بلوغ سعة هذه النسخة');list.push(x)}}
export function stats(bookings){
 const started=bookings.filter(b=>b.started);const delays=started.map(b=>Math.max(0,Math.round((new Date(b.started)-new Date(b.date+'T'+b.time+':00+03:00'))/60000)));
 return {count:bookings.filter(b=>!['cancelled','noshow'].includes(b.status)).length,completed:bookings.filter(b=>b.status==='completed').length,active:bookings.filter(b=>b.status==='inservice').length,value:bookings.filter(b=>b.status==='completed').reduce((n,b)=>n+b.price,0),delay:delays.length?Math.round(delays.reduce((n,x)=>n+x,0)/delays.length):null,samples:delays.length,late:delays.filter(x=>x>15).length};
}
