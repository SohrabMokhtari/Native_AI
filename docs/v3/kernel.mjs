/** Native AI/3: a bounded, data-only program interpreter. Shared by tests, agent and browser. */
export function createKernel() {
  const FORMAT = 'native-ai/3';
  function uuid(){
    if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();
    const b=new Uint8Array(16);globalThis.crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
    const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  const LIMITS = Object.freeze({ programBytes: 160000, snapshotBytes: 2000000, nodes: 240, expressions: 3200, depth: 24, steps: 30000, rows: 1000 });
  const own = (o, k) => o !== null && typeof o === 'object' && Object.hasOwn(o, k);
  const fail = (s) => { throw new Error(s); };
  const need = (v, s) => { if (!v) fail(s); };
  const copy = (v) => structuredClone(v);
  const id = (v) => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,47}$/.test(v) && !['constructor', 'prototype'].includes(v);
  const plain = (v) => v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  const str = (v, max = 120, empty = false) => typeof v === 'string' && v.length <= max && (empty || v.trim().length > 0);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function json(v, depth = 0, seen = new Set()) {
    need(depth <= 32, 'JSON nesting limit exceeded.');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') { need(Number.isFinite(v) && Math.abs(v) <= 1e15, 'Invalid numeric value.'); return; }
    if (typeof v === 'string') { need(v.length <= 12000, 'Text value too long.'); return; }
    need(Array.isArray(v) || plain(v), 'Only plain JSON values are supported.');
    need(!seen.has(v), 'Cyclic values are not supported.'); seen.add(v);
    need(Object.keys(v).length <= 1200, 'JSON collection too large.');
    for (const k of Object.keys(v)) {
      need(!['__proto__', 'constructor', 'prototype'].includes(k), 'Unsafe property.');
      json(v[k], depth + 1, seen);
    }
    seen.delete(v);
  }
  const propertyName=k=>/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(k)&&!/^(AIza|gsk_|sk-)/.test(k)?k:'[redacted property]';
  function keys(v, allowed, required = allowed, path = null) {
    if(path===null){
      need(plain(v), 'Expected an object.');
      need(Object.keys(v).every(k => allowed.includes(k)) && required.every(k => own(v, k)), 'Unknown or missing property.');return;
    }
    const object=plain(v),missing=required.filter(k=>!own(v,k)),unknown=object?Object.keys(v).filter(k=>!allowed.includes(k)):[];
    if(object&&!missing.length&&!unknown.length)return;
    const details={path,expectedType:'object',missingFields:missing,unknownFields:unknown.slice(0,8).map(propertyName),unknownFieldCount:unknown.length,requiredFields:required,allowedFields:allowed};
    const e=new Error(`${object?'Unknown or missing property':'Expected an object'} at ${path}.${missing.length?` Missing: ${missing.join(', ')}.`:''}${unknown.length?` Unexpected: ${details.unknownFields.join(', ')}${unknown.length>8?' (more omitted)':''}.`:''}`);
    e.code='INVALID_PROGRAM_SCHEMA';e.details=details;throw e;
  }
  const types = ['number', 'text', 'boolean', 'list', 'object', 'any'];
  function typed(v, type) {
    json(v);
    need(type === 'any' || (type === 'number' && typeof v === 'number') || (type === 'text' && typeof v === 'string') || (type === 'boolean' && typeof v === 'boolean') || (type === 'list' && Array.isArray(v)) || (type === 'object' && plain(v)), 'Value does not match declared type.');
    return v;
  }
  const ARITY = {
    state: [1,1], row: [1,1], event: [1,1], arg: [1,1], rows: [1,1], today: [0,0],
    item: [0,0], list: [0,16], object: [2,16], merge: [2,2], append: [2,2], get: [2,2], add: [2,2], sub: [2,2], mul: [2,2], div: [2,2], min: [2,2], max: [2,2],
    eq: [2,2], neq: [2,2], lt: [2,2], lte: [2,2], gt: [2,2], gte: [2,2], and: [2,8], or: [2,8], not: [1,1],
    if: [3,3], coalesce: [2,2], concat: [1,12], count: [1,1], sum: [1,1], round: [1,1],
    filter: [2,2], map: [2,2], contains: [2,2], call: [1,9]
  };
  const NODE_TYPES = ['stack','row','grid','card','heading','text','badge','button','input','select','toggle','stat','progress','collection','repeat','divider'];
  function validateProgram(p) {
    json(p); need(new TextEncoder().encode(JSON.stringify(p)).length <= LIMITS.programBytes, 'Program too large.');
    // Per-validation paths: no shared diagnostic/session state and no reflected values.
    const paths=new WeakMap();
    function locate(v,path){if(!v||typeof v!=='object')return;if(paths.has(v))return;paths.set(v,path);for(const k of Object.keys(v))locate(v[k],Array.isArray(v)?`${path}[${k}]`:`${path}.${propertyName(k)}`);}
    locate(p,'$');
    const programKeys=(v,allowed,required=allowed,fallback='$')=>keys(v,allowed,required,paths.get(v)??fallback);
    programKeys(p, ['format','id','name','description','design','collections','state','functions','actions','pages','tests']);
    need(p.format === FORMAT && id(p.id), 'Invalid program format or ID.');
    need(str(p.name,80) && str(p.description,500,true), 'Invalid program name or description.');
    programKeys(p.design, ['mode','accent','density','font','radius','navigation','width'],undefined,'$.design');
    need(['light','dark'].includes(p.design.mode) && /^#[0-9a-fA-F]{6}$/.test(p.design.accent), 'Invalid color design.');
    need(['compact','comfortable'].includes(p.design.density) && ['system','serif','mono'].includes(p.design.font), 'Invalid typography or density.');
    need(Number.isInteger(p.design.radius) && p.design.radius >= 0 && p.design.radius <= 24 && ['top','sidebar'].includes(p.design.navigation) && Number.isInteger(p.design.width) && p.design.width >= 640 && p.design.width <= 1600, 'Invalid layout design.');
    function indexed(a, limit, name, min = 0) {
      need(Array.isArray(a) && a.length >= min && a.length <= limit, `Invalid ${name} count.`);
      need(a.every(v => plain(v) && id(v.id)) && new Set(a.map(v => v.id)).size === a.length, `Invalid or duplicate ${name} IDs.`);
      return new Map(a.map(v => [v.id, v]));
    }
    const cs = indexed(p.collections,8,'collection'), ss = indexed(p.state,32,'state'), fs = indexed(p.functions,24,'function'), as = indexed(p.actions,40,'action'), ps = indexed(p.pages,12,'page',1);
    for (const c of cs.values()) {
      programKeys(c,['id','name','fields']); need(str(c.name,60), 'Invalid collection name.'); indexed(c.fields,24,'field',1);
      for (const f of c.fields) {
        programKeys(f,['id','label','type','required','options']);
        need(str(f.label,60) && ['text','longtext','number','date','select','boolean'].includes(f.type) && typeof f.required === 'boolean', 'Invalid field.');
        need(Array.isArray(f.options) && f.options.length <= 16 && new Set(f.options).size === f.options.length && f.options.every(o => str(o,60)), 'Invalid choices.');
        need(f.type === 'select' ? f.options.length > 0 : f.options.length === 0, 'Only select fields have choices.');
      }
    }
    for (const s of ss.values()) { programKeys(s,['id','type','initial']); need(types.includes(s.type) && s.type !== 'any', 'Invalid state type.'); typed(s.initial,s.type); }
    let expressions = 0, nodes = 0;
    function expr(x, depth = 0, args = null) {
      need(depth <= LIMITS.depth && ++expressions <= LIMITS.expressions, 'Expression complexity limit exceeded.');
      if (x === null || ['boolean','number','string'].includes(typeof x)) return;
      if (plain(x)) { programKeys(x,['lit']); json(x.lit); return; }
      need(Array.isArray(x) && own(ARITY,x[0]), 'Unknown expression operation.');
      const [op,...xs] = x, [lo,hi] = ARITY[op]; need(xs.length >= lo && xs.length <= hi,'Wrong expression arity.');
      if (['state','rows','call'].includes(op)) need((op === 'state' ? ss : op === 'rows' ? cs : fs).has(xs[0]), 'Expression references a missing object.');
      if (['state','rows','row','event','arg','call'].includes(op)) {
        need(str(xs[0],48) && !['__proto__','prototype','constructor'].includes(xs[0]),'Unsafe expression reference.');
        if (op === 'arg') need(args && args.includes(xs[0]), 'Unknown function parameter.');
        if (op === 'call') need(xs.length - 1 === fs.get(xs[0]).params.length, 'Function argument count mismatch.');
        xs.slice(1).forEach(v => expr(v,depth+1,args));
      } else xs.forEach(v => expr(v,depth+1,args));
    }
    for (const f of fs.values()) {
      programKeys(f,['id','params','returns','body']); indexed(f.params,8,'parameter');
      need(f.params.every(v => { programKeys(v,['id','type']); return types.includes(v.type); }) && types.includes(f.returns), 'Invalid function signature.');
      expr(f.body,0,f.params.map(v => v.id));
    }
    function steps(a, depth = 0) {
      need(depth <= 12 && Array.isArray(a) && a.length <= 40, 'Action complexity limit exceeded.');
      for (const s of a) {
        need(plain(s), 'Invalid action step.');
        if (s.op === 'set') { programKeys(s,['op','state','value']); need(ss.has(s.state),'Missing state.'); expr(s.value); }
        else if (s.op === 'if') { programKeys(s,['op','when','then','else']); expr(s.when); steps(s.then,depth+1); steps(s.else,depth+1); }
        else if (s.op === 'each') { programKeys(s,['op','items','do']); expr(s.items); steps(s.do,depth+1); }
        else if (s.op === 'call') { programKeys(s,['op','action']); need(as.has(s.action),'Missing action.'); }
        else if (s.op === 'navigate') { programKeys(s,['op','page']); need(ps.has(s.page),'Missing page.'); }
        else if (['create','update','delete'].includes(s.op)) {
          const ks = ['op','collection',...(s.op !== 'create' ? ['id'] : []),...(s.op !== 'delete' ? ['values'] : [])]; programKeys(s,ks);
          need(cs.has(s.collection),'Missing action collection.'); if (s.op !== 'create') expr(s.id);
          if (s.op !== 'delete') { need(plain(s.values),'Invalid record values.'); for (const k of Object.keys(s.values)) { need(cs.get(s.collection).fields.some(f=>f.id===k),'Unknown action field.'); expr(s.values[k]); } }
        } else fail('Unknown action operation.');
      }
    }
    for (const a of as.values()) { programKeys(a,['id','steps']); steps(a.steps); }
    const nodeIds = new Set();
    function node(n, depth = 0, path = '$') {
      need(depth <= 16 && ++nodes <= LIMITS.nodes,'UI complexity limit exceeded.');
      programKeys(n,['id','type','children','text','value','visible','disabled','action','style','options','collection','layout','groupField','titleField','fields','filter','highlight','items','max','label'],['id','type'],path);
      need(id(n.id) && !nodeIds.has(n.id) && NODE_TYPES.includes(n.type),'Invalid or duplicate UI node.'); nodeIds.add(n.id);
      if (own(n,'style')) {
        programKeys(n.style,['gap','padding','columns','size','align','justify','tone','weight'],[],`${paths.get(n)??path}.style`);
        for (const k of ['gap','padding']) if(own(n.style,k)) need(Number.isInteger(n.style[k]) && n.style[k]>=0 && n.style[k]<=64,'Invalid spacing.');
        if(own(n.style,'columns'))need(Number.isInteger(n.style.columns)&&n.style.columns>=1&&n.style.columns<=6,'Invalid grid.');
        if(own(n.style,'size'))need(Number.isInteger(n.style.size)&&n.style.size>=12&&n.style.size<=64,'Invalid font size.');
        if(own(n.style,'weight'))need([400,500,600,700,800].includes(n.style.weight),'Invalid weight.');
        if(own(n.style,'align'))need(['start','center','end','stretch'].includes(n.style.align),'Invalid alignment.');
        if(own(n.style,'justify'))need(['start','center','end','space-between'].includes(n.style.justify),'Invalid distribution.');
        if(own(n.style,'tone'))need(['normal','muted','accent','danger','success'].includes(n.style.tone),'Invalid tone.');
      }
      for (const k of ['text','value','visible','disabled','options','filter','highlight','items','max','label']) if (own(n,k)) expr(n[k]);
      if (own(n,'action')) need(as.has(n.action),'UI references a missing action.');
      if (['button','input','select','toggle'].includes(n.type)) need(own(n,'action'),'Interactive control needs an action.');
      if (['input','select','toggle'].includes(n.type)) need(own(n,'label'),'Input needs an accessible label.');
      if(n.type==='repeat')need(own(n,'items'),'Repeat needs items.');
      if(n.type==='collection') {
        const c = cs.get(n.collection); need(c && ['cards','table','board'].includes(n.layout),'Invalid collection component.');
        need(c.fields.some(f=>f.id===n.titleField),'Invalid title field.');
        if(n.layout==='board')need(c.fields.some(f=>f.id===n.groupField&&f.type==='select'),'Board needs a select field.');
        if(own(n,'fields'))need(Array.isArray(n.fields)&&n.fields.every(k=>c.fields.some(f=>f.id===k)),'Invalid visible fields.');
      }
      if(own(n,'children')){need(Array.isArray(n.children)&&n.children.length<=60,'Invalid children.');n.children.forEach((c,i)=>node(c,depth+1,`${paths.get(n)??path}.children[${i}]`));}
    }
    for(const page of ps.values()){programKeys(page,['id','title','root']);need(str(page.title,60),'Invalid page title.');node(page.root,0,`${paths.get(page)}.root`);}
    // Reject recursive call graphs before execution; bounded iteration remains available.
    function acyclic(map, refs) {
      const done = new Set(), active = new Set();
      function visit(k) { if(done.has(k))return;need(!active.has(k),'Recursive calls are not supported.');active.add(k);for(const r of refs(map.get(k)))visit(r);active.delete(k);done.add(k); }
      [...map.keys()].forEach(visit);
    }
    function frefs(x,out=[]) { if(Array.isArray(x)){if(x[0]==='call')out.push(x[1]);x.slice(1).forEach(v=>frefs(v,out));}return out; }
    function arefs(a,out=[]) { for(const s of a){if(s.op==='call')out.push(s.action);if(s.op==='if'){arefs(s.then,out);arefs(s.else,out);}if(s.op==='each')arefs(s.do,out);}return out; }
    acyclic(fs,f=>frefs(f.body));acyclic(as,a=>arefs(a.steps));
    need(Array.isArray(p.tests)&&p.tests.length<=16,'Too many tests.');
    for(const t of p.tests){programKeys(t,['name','state','data','actions','expect']);need(str(t.name,80)&&plain(t.state)&&plain(t.data)&&Array.isArray(t.actions)&&t.actions.length<=12&&Array.isArray(t.expect)&&t.expect.length>0&&t.expect.length<=12,'Invalid test.');for(const k of Object.keys(t.state))need(ss.has(k),'Unknown test state.');for(const k of Object.keys(t.data))need(cs.has(k),'Unknown test collection.');for(const a of t.actions){programKeys(a,['id','event']);need(as.has(a.id)&&plain(a.event),'Invalid test action.');}for(const e of t.expect){programKeys(e,['value','equals']);expr(e.value);json(e.equals);}}
    return copy(p);
  }
  function rowValues(c, values) {
    need(plain(values) && Object.keys(values).every(k=>c.fields.some(f=>f.id===k)), 'Unknown record field.');
    const out={};
    for(const f of c.fields){const v=own(values,f.id)?values[f.id]:f.type==='boolean'?false:'';const empty=v===''||v===null;
      need(!f.required||(!empty&&(!(typeof v==='string')||v.trim())), 'A required record field is empty.');
      if(empty&&f.type!=='boolean'){out[f.id]='';continue;}
      if(f.type==='boolean')need(typeof v==='boolean','Expected a boolean.');
      else if(f.type==='number')need(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e15,'Expected a finite number.');
      else {need(str(v,f.type==='longtext'?8000:500,!f.required),'Invalid record text.');if(f.type==='select')need(f.options.includes(v),'Invalid record choice.');if(f.type==='date')need(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid date.');}
      out[f.id]=v;
    }
    return out;
  }
  function snapshotFor(p, old = null) {
    if(old){json(old);keys(old,['state','data','page']);need(plain(old.state)&&plain(old.data),'Invalid snapshot.');need(Object.keys(old.state).every(k=>p.state.some(s=>s.id===k))&&Object.keys(old.data).every(k=>p.collections.some(c=>c.id===k)),'Snapshot contains removed data.');}
    const out={state:{},data:{},page:old?.page??p.pages[0].id};
    need(p.pages.some(v=>v.id===out.page),'Unknown active page.');
    for(const s of p.state)out.state[s.id]=copy(typed(own(old?.state,s.id)?old.state[s.id]:s.initial,s.type));
    for(const c of p.collections){const rows=old?.data[c.id]??[];need(Array.isArray(rows)&&rows.length<=LIMITS.rows,'Record limit exceeded.');const seen=new Set();out.data[c.id]=rows.map(r=>{keys(r,['id','values']);need(str(r.id,100)&&!seen.has(r.id),'Invalid record ID.');seen.add(r.id);return {id:r.id,values:rowValues(c,r.values)};});}
    need(JSON.stringify(out).length<=LIMITS.snapshotBytes,'Saved data too large.');return out;
  }
  function compatible(old, next, snapshot) {
    const p=validateProgram(next);if(!old)return snapshotFor(p,snapshot);
    need(old.id===p.id,'An edit cannot change the app ID.');
    for(const c of old.collections){const n=p.collections.find(x=>x.id===c.id);need(n,'Cannot remove an existing collection.');for(const f of c.fields){const nf=n.fields.find(x=>x.id===f.id);need(nf&&nf.type===f.type&&f.options.every(o=>nf.options.includes(o)),'Cannot remove or retype an existing field or choice.');}}
    for(const s of old.state)need(p.state.some(n=>n.id===s.id&&n.type===s.type),'Cannot remove or retype existing state.');
    const normalized = snapshot ? {...snapshot,page:p.pages.some(v=>v.id===snapshot.page)?snapshot.page:p.pages[0].id}:null;
    return snapshotFor(p,normalized);
  }
  function createMachine(program, saved = null, options = {}) {
    const p=validateProgram(program);let snapshot=snapshotFor(p,saved);
    const cs=new Map(p.collections.map(c=>[c.id,c])),fs=new Map(p.functions.map(f=>[f.id,f])),as=new Map(p.actions.map(a=>[a.id,a]));
    function budget(){let remaining=LIMITS.steps;return (cost=1)=>need((remaining-=cost)>=0,'Execution budget exhausted.');}
    const num=v=>{need(typeof v==='number'&&Number.isFinite(v),'Arithmetic requires numbers.');return v;};
    const bool=v=>{need(typeof v==='boolean','Condition requires a boolean.');return v;};
    const list=v=>{need(Array.isArray(v)&&v.length<=LIMITS.rows,'Expected a bounded list.');return v;};
    const prop=(o,k)=>{need((plain(o)||Array.isArray(o))&&(typeof k==='string'||Number.isInteger(k))&&!['__proto__','constructor','prototype'].includes(k),'Invalid property access.');need(own(o,k),'Property not found.');return o[k];};
    function evaluate(x, s, ctx, tick, depth=0){
      tick();need(depth<=LIMITS.depth,'Execution depth exhausted.');
      if(x===null||['string','number','boolean'].includes(typeof x))return x;
      if(plain(x)&&own(x,'lit')){tick(Math.max(1,Math.ceil(JSON.stringify(x.lit).length/32)));return copy(x.lit);}
      const [op,...a]=x,ev=v=>evaluate(v,s,ctx,tick,depth+1);
      if(op==='state')return prop(s.state,a[0]);
      if(op==='row')return prop(ctx.row??{},a[0]);
      if(op==='event')return prop(ctx.event??{},a[0]);
      if(op==='arg')return prop(ctx.args??{},a[0]);
      if(op==='rows'){tick(s.data[a[0]].length*Math.max(1,cs.get(a[0]).fields.length));return s.data[a[0]].map(r=>({...r.values,_id:r.id}));}
      if(op==='item')return ctx.row??null;
      if(op==='today')return (options.today??new Date().toISOString().slice(0,10));
      if(op==='if')return bool(ev(a[0]))?ev(a[1]):ev(a[2]);
      if(op==='and')return a.every(v=>bool(ev(v)));
      if(op==='or')return a.some(v=>bool(ev(v)));
      if(op==='coalesce'){const v=ev(a[0]);return v===null||v===''?ev(a[1]):v;}
      if(op==='filter'||op==='map')return list(ev(a[0]))[op](row=>{const v=evaluate(a[1],s,{...ctx,row},tick,depth+1);return op==='filter'?bool(v):v;});
      if(op==='call'){const f=fs.get(a[0]);need(f,'Missing function.');const args={};f.params.forEach((param,i)=>args[param.id]=typed(ev(a[i+1]),param.type));return typed(evaluate(f.body,s,{...ctx,args},tick,depth+1),f.returns);}
      const v=a.map(ev);let result;
      switch(op){
        case 'list':return v;
        case 'append':{tick(list(v[0]).length);const out=[...v[0],v[1]];need(out.length<=LIMITS.rows,'List limit exceeded.');json(out);return out;}
        case 'merge':need(plain(v[0])&&plain(v[1]),'Merge requires objects.');result={...v[0],...v[1]};break;
        case 'object':{need(v.length%2===0,'Object requires key/value pairs.');result={};for(let i=0;i<v.length;i+=2){need(typeof v[i]==='string'&&!['__proto__','constructor','prototype'].includes(v[i]),'Invalid object key.');result[v[i]]=v[i+1];}break;}
        case 'get':return prop(v[0],v[1]);
        case 'eq':return equal(v[0],v[1]);case 'neq':return !equal(v[0],v[1]);
        case 'lt':case 'lte':case 'gt':case 'gte':need(typeof v[0]===typeof v[1]&&['string','number'].includes(typeof v[0]),'Comparison type mismatch.');return op==='lt'?v[0]<v[1]:op==='lte'?v[0]<=v[1]:op==='gt'?v[0]>v[1]:v[0]>=v[1];
        case 'not':return !bool(v[0]);
        case 'add':result=num(v[0])+num(v[1]);break;case 'sub':result=num(v[0])-num(v[1]);break;case 'mul':result=num(v[0])*num(v[1]);break;
        case 'div':need(num(v[1])!==0,'Division by zero.');result=num(v[0])/v[1];break;
        case 'min':result=Math.min(num(v[0]),num(v[1]));break;case 'max':result=Math.max(num(v[0]),num(v[1]));break;
        case 'round':result=Math.round(num(v[0]));break;
        case 'count':return list(v[0]).length;case 'sum':result=list(v[0]).reduce((s,n)=>s+num(n),0);break;
        case 'concat':need(v.every(z=>z===null||['string','number','boolean'].includes(typeof z)),'Cannot concatenate objects.');result=v.join('');break;
        case 'contains':need(Array.isArray(v[0])||typeof v[0]==='string','Expected text or a list.');return v[0].includes(v[1]);
        default:fail('Unknown expression.');
      }
      json(result);return result;
    }
    const validateExpr=x=>{json(x);}; // Program expressions have already been structurally validated.
    function execute(steps,s,ctx,tick,depth=0){need(depth<=16,'Action depth exhausted.');
      for(const a of steps){tick();const ev=x=>evaluate(x,s,ctx,tick);
        if(a.op==='set'){const def=p.state.find(v=>v.id===a.state);s.state[a.state]=copy(typed(ev(a.value),def.type));}
        else if(a.op==='if')execute(bool(ev(a.when))?a.then:a.else,s,ctx,tick,depth+1);
        else if(a.op==='each')for(const row of list(ev(a.items)))execute(a.do,s,{...ctx,row},tick,depth+1);
        else if(a.op==='call')execute(as.get(a.action).steps,s,ctx,tick,depth+1);
        else if(a.op==='navigate')s.page=a.page;
        else {const rows=s.data[a.collection],c=cs.get(a.collection),rid=a.op==='create'?null:ev(a.id),row=rows.find(r=>r.id===rid);if(a.op!=='create')need(row,'Record not found.');
          if(a.op==='delete')s.data[a.collection]=rows.filter(r=>r.id!==rid);
          else {const values={};for(const k of Object.keys(a.values))values[k]=ev(a.values[k]);if(a.op==='create'){need(rows.length<LIMITS.rows,'Record limit exceeded.');rows.push({id:uuid(),values:rowValues(c,values)});}else row.values=rowValues(c,{...row.values,...values});}
        }
      }
    }
    function persist(next){const checked=snapshotFor(p,next);options.onCommit?.(copy(checked));snapshot=checked;return copy(snapshot);}
    return {
      program:p,
      snapshot:()=>copy(snapshot),
      evaluate:(x,ctx={})=>{validateExpr(x);return copy(evaluate(x,snapshot,ctx,budget()));},
      scope:(ctx={})=>{const tick=budget();return x=>copy(evaluate(x,snapshot,ctx,tick));},
      renderEvaluator:()=>{const tick=budget();return (x,ctx={})=>copy(evaluate(x,snapshot,ctx,tick));},
      dispatch:(action,event={},row=null)=>{need(as.has(action),'Unknown action.');json(event);json(row);const next=copy(snapshot);execute(as.get(action).steps,next,{event,row},budget());return persist(next);},
      navigate:page=>{need(p.pages.some(v=>v.id===page),'Unknown page.');return persist({...snapshot,page});},
      putRecord:(collection,values,rid=null)=>{const c=cs.get(collection);need(c,'Unknown collection.');const next=copy(snapshot),rows=next.data[collection],checked=rowValues(c,values);if(rid){const r=rows.find(r=>r.id===rid);need(r,'Record not found.');r.values=checked;}else{need(rows.length<LIMITS.rows,'Record limit exceeded.');rows.push({id:uuid(),values:checked});}return persist(next);},
      deleteRecord:(collection,rid)=>{need(cs.has(collection),'Unknown collection.');const next=copy(snapshot);need(next.data[collection].some(r=>r.id===rid),'Record not found.');next.data[collection]=next.data[collection].filter(r=>r.id!==rid);return persist(next);}
    };
  }
  function runTests(program) {
    const p=validateProgram(program),results=[];
    for(const [index,t] of p.tests.entries()){
      let phase='setup',path=`$.tests[${index}]`;
      try{
        const s=snapshotFor(p);Object.assign(s.state,copy(t.state));Object.assign(s.data,copy(t.data));const m=createMachine(p,s,{today:'2026-10-16'});
        for(const [i,a] of t.actions.entries()){phase='action';path=`$.tests[${index}].actions[${i}]`;m.dispatch(a.id,a.event);}
        for(const [i,e] of t.expect.entries()){
          phase='assertion';path=`$.tests[${index}].expect[${i}]`;
          if(!equal(m.evaluate(e.value),e.equals)){const error=new Error('Expected value did not match.');error.code='ASSERTION_FAILED';throw error;}
        }
        results.push({name:t.name,passed:true});
      }catch(e){results.push({name:t.name,passed:false,error:String(e?.message??'Execution failed.').slice(0,300),code:e?.code==='ASSERTION_FAILED'?'ASSERTION_FAILED':'EXECUTION_FAILED',phase,path});}
    }
    return {passed:results.every(r=>r.passed),total:results.length,results};
  }
  /** Stable-ID edits; root replacement is intentionally not available for existing programs. */
  function applyEdits(current, edits, expectedRevision, actualRevision) {
    need(Number.isSafeInteger(expectedRevision)&&expectedRevision===actualRevision,'Stale design revision.');
    need(Array.isArray(edits)&&edits.length>0&&edits.length<=40,'Invalid edit batch.');const next=copy(current);
    for(const e of edits){keys(e,['section','id','value']);need(['meta','design','collections','state','functions','actions','pages','tests'].includes(e.section),'Unknown edit section.');
      if(e.section==='meta'){need(e.id===''&&plain(e.value),'Invalid metadata edit.');keys(e.value,['name','description'],[]);Object.assign(next,e.value);}
      else if(e.section==='design'){need(e.id===''&&plain(e.value),'Invalid design edit.');Object.assign(next.design,e.value);}
      else if(e.section==='tests'){need(e.id===''&&Array.isArray(e.value),'Invalid tests edit.');next.tests=copy(e.value);}
      else {need(id(e.id)&&plain(e.value)&&e.value.id===e.id,'Edit ID mismatch.');const i=next[e.section].findIndex(v=>v.id===e.id);if(i<0)next[e.section].push(copy(e.value));else next[e.section][i]=copy(e.value);}
    }
    validateProgram(next);compatible(current,next,null);return next;
  }
  return {FORMAT,uuid,LIMITS,NODE_TYPES,ARITY,validateProgram,snapshotFor,compatible,createMachine,runTests,applyEdits};
}
export const kernel = createKernel();
export const {validateProgram,createMachine,snapshotFor,compatible,runTests,applyEdits} = kernel;
