// Server-only repositories. Authorization stays in the API routes.
export function d1Store(db) {
  return {
    getBranch: id => db.prepare('SELECT id,owner_id,category,name FROM business_branches WHERE id=?').bind(id).first(),
    getWorkspace: id => db.prepare('SELECT payload,revision FROM workspaces WHERE owner_id=?').bind(id).first(),
    async listBranches(owner) {
      return (await db.prepare("SELECT b.id,b.category,COALESCE(json_extract(w.payload,'$.settings.name'),b.name) AS name,b.city,b.listed FROM business_branches b JOIN workspaces w ON w.owner_id=b.id WHERE b.owner_id=? ORDER BY b.created_at DESC").bind(owner).all()).results;
    },
    ensureWorkspace: (id, payload) => db.prepare('INSERT OR IGNORE INTO workspaces (owner_id,payload,revision,updated_at) VALUES (?,?,0,?)').bind(id,payload,new Date().toISOString()).run(),
    createBranch: (b,payload) => db.batch([
      db.prepare('INSERT INTO business_branches(id,owner_id,category,name,city,listed,created_at) VALUES(?,?,?,?,?,0,?)').bind(b.id,b.owner_id,b.category,b.name,b.city,new Date().toISOString()),
      db.prepare('INSERT INTO workspaces(owner_id,payload,revision,updated_at) VALUES(?,?,0,?)').bind(b.id,payload,new Date().toISOString())
    ]),
    async setVisibility(id,owner,listed,revision) {
      const r=await db.prepare('UPDATE business_branches SET listed=? WHERE id=? AND owner_id=? AND EXISTS (SELECT 1 FROM workspaces WHERE owner_id=? AND revision=?)').bind(listed?1:0,id,owner,id,revision).run();
      return r.meta.changes===1;
    },
    async saveWorkspace(id,payload,revision,requireListed=false) {
      const sql='UPDATE workspaces SET payload=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?';
      const args=[payload,new Date().toISOString(),id,revision];
      if(requireListed)args.push(id);
      const r=await db.prepare(sql+(requireListed?' AND EXISTS (SELECT 1 FROM business_branches WHERE id=? AND listed=1)':'')).bind(...args).run();
      return r.meta.changes===1;
    },
    async catalog(category) {
      return (await db.prepare('SELECT b.id,b.name,b.category,b.city,w.payload FROM business_branches b JOIN workspaces w ON w.owner_id=b.id WHERE b.category=? AND b.listed=1 ORDER BY b.created_at DESC').bind(category).all()).results;
    },
    listedBranch: id => db.prepare('SELECT b.id,b.name,b.category,b.city,w.payload,w.revision FROM business_branches b JOIN workspaces w ON w.owner_id=b.id WHERE b.id=? AND b.listed=1').bind(id).first(),
    async customerBranches(key) {
      return (await db.prepare("SELECT b.id,b.name,b.category,b.city,w.payload FROM business_branches b JOIN workspaces w ON w.owner_id=b.id WHERE EXISTS (SELECT 1 FROM json_each(w.payload,'$.bookings') j WHERE json_extract(j.value,'$.customerId')=?)").bind(key).all()).results;
    }
  };
}

export function supabaseStore(url,key,fetcher=fetch) {
  const base=new URL(url);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')
    throw new Error('SUPABASE_URL must be an HTTPS project origin');
  if(!key?.startsWith('sb_secret_'))throw new Error('SUPABASE_SECRET_KEY must be a server secret key');
  async function call(operation,args) {
    // No automatic retries for writes: a timeout can follow a committed transaction.
    let response;
    try {
      response=await fetcher(new URL('/rest/v1/rpc/salon_store',base),{
        method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
        body:JSON.stringify({p_operation:operation,p_args:args}),
        signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'
      });
    } catch { throw new Error('تعذر الاتصال بقاعدة البيانات. حدّث البيانات قبل إعادة المحاولة.'); }
    if(!response.ok)throw new Error('تعذر تنفيذ العملية في قاعدة البيانات. تحقق من إعداد الاتصال.');
    return response.json();
  }
  return {
    getBranch: id=>call('get_branch',{id}),
    getWorkspace: id=>call('get_workspace',{id}),
    listBranches: owner=>call('list_branches',{owner}),
    ensureWorkspace: (id,payload)=>call('ensure_workspace',{id,payload:JSON.parse(payload)}),
    createBranch: (branch,payload)=>call('create_branch',{...branch,payload:JSON.parse(payload)}),
    setVisibility: (id,owner,listed,revision)=>call('set_visibility',{id,owner,listed,revision}),
    saveWorkspace: (id,payload,revision,requireListed=false)=>call('save_workspace',{id,payload:JSON.parse(payload),revision,require_listed:requireListed}),
    catalog: category=>call('catalog',{category}),
    listedBranch: id=>call('listed_branch',{id}),
    customerBranches: key=>call('customer_branches',{key})
  };
}

export function configuredStore(config) {
  const provider=config.DB_PROVIDER||(config.SUPABASE_URL||config.SUPABASE_SECRET_KEY?'supabase':'d1');
  if(provider==='supabase') {
    if(!config.SUPABASE_URL||!config.SUPABASE_SECRET_KEY)throw new Error('Supabase configuration is incomplete');
    return supabaseStore(config.SUPABASE_URL,config.SUPABASE_SECRET_KEY);
  }
  if(provider!=='d1'||!config.DB)throw new Error('Database provider unavailable');
  return d1Store(config.DB);
}
