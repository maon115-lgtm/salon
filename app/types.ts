export type Customer={id:string;name:string;phone:string;notes:string};
export type Staff={id:string;name:string;role:string;start:string;end:string;active:boolean};
export type Service={id:string;name:string;duration:number;buffer:number;price:number;active:boolean};
export type Booking={id:string;customerId:string;staffId:string;serviceId:string;date:string;time:string;duration:number;buffer:number;price:number;serviceName:string;status:string;notes:string;arrival?:string;started?:string;finished?:string};
export type State={demo:boolean;settings:{name:string;open:string;close:string};customers:Customer[];staff:Staff[];services:Service[];bookings:Booking[];audit:{at:string;label:string}[]};
