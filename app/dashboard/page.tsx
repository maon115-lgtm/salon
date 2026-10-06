import Salon from '../workspace';
import {requireChatGPTUser} from '../chatgpt-auth';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Dashboard({searchParams}:{searchParams:Promise<{workspace?:string;legacy?:string}>}){const {workspace,legacy}=await searchParams;if(!workspace&&!legacy)redirect('/partners');await requireChatGPTUser(workspace?'/dashboard?workspace='+encodeURIComponent(workspace):'/dashboard?legacy=1');return <Salon/>}
