export const categories=[
 {id:'women',name:'الصالونات النسائية',short:'صالون نسائي',title:'جمال يبدأ بتجربة مرتبة.',description:'الشعر والتجميل والعناية بالأظافر',color:'#8b5f72',services:[['قص وتصفيف',45],['صبغة شعر',120],['تصفيف للمناسبات',60],['مانيكير وباديكير',60]]},
 {id:'spa',name:'Spa',short:'Spa والعناية',title:'وقت للراحة، ومساحة للعناية.',description:'الاسترخاء والعناية بالجسم والبشرة',color:'#477c70',services:[['جلسة استرخاء',60],['عناية بالبشرة',45],['عناية بالجسم',60],['حمام مغربي',60]]},
 {id:'men',name:'صالونات الحلاقة الرجالية',short:'حلاقة رجالية',title:'تفاصيل دقيقة. ومواعيد واضحة.',description:'قص الشعر وتهذيب اللحية والعناية',color:'#526e8b',services:[['قص شعر',30],['تهذيب اللحية',20],['قص شعر ولحية',45],['عناية بالشعر',40]]}
];
export const categoryById=id=>categories.find(c=>c.id===id);
export function branchState(category,name){const c=categoryById(category);if(!c)throw Error('الفئة غير صالحة');return {demo:false,category,settings:{name,open:'09:00',close:'21:00'},users:[],customers:[],staff:[],bookings:[],audit:[],services:c.services.map(([name,duration],i)=>({id:'template-'+category+'-'+i,name,duration,buffer:10,price:0,active:false}))};}
