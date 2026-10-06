import Explore from '../explore-client';
import {getChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{category?:string;branch?:string}>}){const p=await searchParams,u=await getChatGPTUser();return <Explore signedIn={!!u} initialCategory={p.category||'women'} initialBranch={p.branch||''}/>}
