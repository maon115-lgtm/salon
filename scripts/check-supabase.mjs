import {supabaseStore} from '../db/store.mjs';

// Read-only check. No customer records, keys, or response bodies are printed.
try {
  const {SUPABASE_URL,SUPABASE_SECRET_KEY}=process.env;
  if(!SUPABASE_URL||!SUPABASE_SECRET_KEY)
    throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in the ignored .dev.vars file or server environment.');
  const store=supabaseStore(SUPABASE_URL,SUPABASE_SECRET_KEY);
  const row=await store.getWorkspace('connection-check-'+crypto.randomUUID());
  if(row!==null)throw new Error('Unexpected database response.');
  console.log('PASS: Supabase HTTPS connection, server authentication, salon_store RPC and workspace table read.');
  console.log('This read-only check does not verify writes, concurrent bookings or website deployment.');
} catch(error) {
  console.error('Supabase verification failed:',error.message);
  process.exitCode=1;
}
