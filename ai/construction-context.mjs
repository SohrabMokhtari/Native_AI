import {bytes} from './build-io.mjs';
const sections=['collections','state','functions','actions','pages'];
export function contextIndex(p,revision){
  if(!p)return {empty:true,revision};
  const nodes=[];const walk=(n,page)=>{nodes.push({id:n.id,type:n.type,page,...(n.collection?{collection:n.collection}:{}),...(n.action?{action:n.action}:{})});for(const c of n.children??[])walk(c,page);};
  p.pages.forEach(page=>walk(page.root,page.id));
  return {revision,id:p.id,name:p.name,description:p.description,design:p.design,
    collections:p.collections.map(c=>({id:c.id,name:c.name,fields:c.fields.map(f=>({id:f.id,type:f.type}))})),
    state:p.state.map(s=>({id:s.id,type:s.type})),functions:p.functions.map(f=>({id:f.id,params:f.params,returns:f.returns})),
    actions:p.actions.map(a=>({id:a.id})),pages:p.pages.map(v=>({id:v.id,title:v.title,root:v.root.id})),nodes,tests:p.tests.map(t=>t.name),
    note:'Index only. Retrieve full items/dependencies with inspect_structure before replacing unseen structure.'};
}
/** Closure is conservative: all literal references are included, with no partial/truncated items. */
export function inspectStructure(p,targets){
  if(!p)throw new Error('No draft exists.');
  if(!Array.isArray(targets)||targets.length<1||targets.length>8)throw new Error('Select 1..8 structure targets.');
  const found=new Map(),nodes=new Map();const walk=n=>{nodes.set(n.id,n);for(const c of n.children??[])walk(c);};p.pages.forEach(v=>walk(v.root));
  function add(section,id){
    const key=`${section}/${id}`;if(found.has(key))return;
    let value;if(['meta','design','tests'].includes(section)){if(id!=='')throw new Error('Use an empty ID for meta/design/tests.');value=section==='meta'?{id:p.id,name:p.name,description:p.description}:p[section];}
    else if(section==='nodes')value=nodes.get(id);else if(sections.includes(section))value=p[section].find(x=>x.id===id);
    if(value===undefined)throw new Error('Structure target not found. Check section/id in the index.');
    found.set(key,{section,id,value});
    if(section==='functions')expression(value.body);
    if(section==='actions')steps(value.steps);
    if(section==='pages')node(value.root);
    if(section==='nodes')node(value);
    if(section==='tests')for(const t of value){for(const k of Object.keys(t.state))add('state',k);for(const k of Object.keys(t.data))add('collections',k);for(const a of t.actions)add('actions',a.id);for(const e of t.expect)expression(e.value);}
  }
  function expression(x){
    if(!Array.isArray(x))return; // Literal objects/arrays have no references.
    const refs={state:'state',rows:'collections',call:'functions'};
    if(refs[x[0]])add(refs[x[0]],x[1]);for(const v of x.slice(1))expression(v);
  }
  function steps(items){for(const s of items){
    if(s.collection)add('collections',s.collection);if(s.op==='set')add('state',s.state);if(s.op==='call')add('actions',s.action);if(s.op==='navigate')add('pages',s.page);
    for(const k of ['value','when','items','id'])if(Object.hasOwn(s,k))expression(s[k]);for(const e of Object.values(s.values??{}))expression(e);
    if(s.then)steps(s.then);if(s.else)steps(s.else);if(s.do)steps(s.do);
  }}
  function node(n){
    if(n.collection)add('collections',n.collection);if(n.action)add('actions',n.action);
    for(const k of ['text','value','visible','disabled','options','filter','highlight','items','max','label'])if(Object.hasOwn(n,k))expression(n[k]);
    for(const c of n.children??[])node(c);
  }
  for(const t of targets){if(!t||Object.keys(t).length!==2||typeof t.section!=='string'||typeof t.id!=='string')throw new Error('Invalid structure target.');add(t.section,t.id);}
  const result={items:[...found.values()]};
  if(bytes(result)>24000)throw new Error('Inspection exceeds 24000 bytes. Request narrower node/function/action IDs; nothing was truncated.');
  return result;
}
export function compactChecks(report){return {passed:report.passed,tests:{total:report.tests.total,passed:report.tests.passed,failures:report.tests.results.filter(t=>!t.passed).map(t=>({name:t.name,error:t.error})).slice(0,6)},issues:report.issues.slice(0,6),warnings:report.warnings};}
