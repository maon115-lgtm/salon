import {z} from 'zod';
import {assertSlot,clock,toMinutes,dayNow,minuteNow,applyAction} from './domain.mjs';
export const validDate=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(d=>{const x=new Date(d+'T12:00:00Z');return !isNaN(x)&&x.toISOString().slice(0,10)===d},'تاريخ غير صالح');
export async function clientKey(userId){const a=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(userId));return 'client-'+Array.from(new Uint8Array(a),n=>n.toString(16).padStart(2,'0')).join('');}
export function publicBranch(row){const s=JSON.parse(row.payload);return {id:row.id,category:row.category,name:s.settings?.name||row.name,city:row.city,services:s.services.filter(x=>x.active&&x.price>0).map(({id,name,duration,price})=>({id,name,duration,price}))};}
export function availableSlots(state,serviceId,date,now=new Date()){
 validDate.parse(date);if(date<dayNow(now))return [];const service=state.services.find(s=>s.id===serviceId&&s.active&&s.price>0);if(!service)return [];
 const slots=[];for(const staff of state.staff.filter(s=>s.active)){
  const start=Math.max(toMinutes(staff.start),toMinutes(state.settings.open));const end=Math.min(toMinutes(staff.end),toMinutes(state.settings.close));
  for(let t=Math.ceil(start/15)*15;t+service.duration+service.buffer<=end;t+=15){if(date===dayNow(now)&&t<=minuteNow(now))continue;try{assertSlot(state,{staffId:staff.id,customerId:'public-preview',date,time:clock(t),duration:service.duration,buffer:service.buffer});slots.push({staffId:staff.id,staffName:staff.name,time:clock(t)})}catch{}}
 }return slots;
}
export function customerReservation(state,input,customerId,now=new Date()){
 const x=z.object({serviceId:z.string().min(1).max(80),staffId:z.string().min(1).max(80),date:validDate,time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),name:z.string().trim().min(2).max(80),phone:z.string().trim().regex(/^(05\d{8}|\+9665\d{8})$/,'أدخل رقم جوال سعودي صحيحًا')}).parse(input);
 if(!availableSlots(state,x.serviceId,x.date,now).some(s=>s.time===x.time&&s.staffId===x.staffId))throw Error('الموعد لم يعد متاحًا. اختر وقتًا آخر.');
 const previous=state.customers.find(c=>c.id===customerId);let next=applyAction(state,{type:'saveCustomer',data:{id:customerId,name:x.name,phone:x.phone,notes:previous?.notes||''}},now);
 // IDs and customer linkage are server-owned. Never trust an incoming booking ID.
 const id=crypto.randomUUID();next=applyAction(next,{type:'saveBooking',data:{id,customerId,staffId:x.staffId,serviceId:x.serviceId,date:x.date,time:x.time,notes:''}},now);return {state:next,id};
}
