// The authenticated identity comes from the Sites gateway, never from request JSON.
export function resolveAccess(state, identity, workspaceId) {
  if (identity.userId === workspaceId) return {role:'admin',name:identity.displayName,email:identity.email};
  const member=(state.users||[]).find(u=>u.email.toLowerCase()===identity.email.trim().toLowerCase());
  if (!member || member.status!=='active') throw new Error('ليس لديك وصول نشط إلى هذه المساحة. تواصل مع المسؤول.');
  if(member.role==='customer'&&!state.customers.some(c=>c.id===member.customerId))throw new Error('ملف العميل المرتبط غير متاح.');
  return {role:member.role,name:member.name,email:member.email,customerId:member.customerId};
}
export function assertPermission(access, action) {
  if(access.role==='customer') throw new Error('حساب العميل يتيح عرض الحجوزات الخاصة به فقط.');
  if(['saveUser','userStatus','clearDemo'].includes(action?.type)&&access.role!=='admin')throw new Error('إدارة المستخدمين متاحة لمسؤول المساحة فقط.');
}
export function visibleState(state, access){
  if(access.role==='admin')return {...state,users:state.users||[]};
  if(access.role==='owner')return {...state,users:[]};
  const bookings=state.bookings.filter(b=>b.customerId===access.customerId).map(({notes,...b})=>({...b,notes:''}));
  return {demo:state.demo,settings:state.settings,users:[],audit:[],customers:state.customers.filter(c=>c.id===access.customerId).map(c=>({...c,notes:''})),bookings,services:[],staff:state.staff.filter(e=>bookings.some(b=>b.staffId===e.id)).map(e=>({...e,role:'',start:'',end:''}))};
}
