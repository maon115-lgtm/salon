import Salon from '../workspace';
import {requireChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Dashboard({searchParams}:{searchParams:Promise<{workspace?:string}>}){const {workspace}=await searchParams;await requireChatGPTUser(workspace?'/dashboard?workspace='+encodeURIComponent(workspace):'/dashboard');return <Salon/>}
