import Landing from './landing';
import {redirect} from 'next/navigation';
export default async function Home({searchParams}:{searchParams:Promise<{workspace?:string}>}){const {workspace}=await searchParams;if(workspace)redirect('/dashboard?workspace='+encodeURIComponent(workspace));return <Landing/>}
