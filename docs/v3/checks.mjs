import {validateProgram,createMachine,snapshotFor,runTests} from './kernel.mjs';
/** Text-only preflight. This is not a screenshot reviewer or a proof of user-intent correctness. */
export function inspectProgram(program) {
  const p=validateProgram(program);
  return {name:p.name,pages:p.pages.map(v=>({id:v.id,title:v.title})),collections:p.collections.map(c=>({id:c.id,fields:c.fields.map(f=>({id:f.id,type:f.type}))})),state:p.state.map(s=>({id:s.id,type:s.type})),actions:p.actions.map(a=>a.id),functions:p.functions.map(f=>f.id),design:p.design};
}
export function preflight(program) {
  const p=validateProgram(program),issues=[];const tests=runTests(p);let evaluated=0;
  const snapshots=[{name:'initial state',snapshot:snapshotFor(p)}];
  for(const t of p.tests){try{const s=snapshotFor(p);Object.assign(s.state,structuredClone(t.state));Object.assign(s.data,structuredClone(t.data));const machine=createMachine(p,s,{today:'2026-10-16'});for(const a of t.actions)machine.dispatch(a.id,a.event);snapshots.push({name:t.name,snapshot:machine.snapshot()});}catch{/* Already represented by the test report. */}}
  for(const {name,snapshot} of snapshots){const machine=createMachine(p,snapshot,{today:'2026-10-16'}),read=machine.renderEvaluator();let nodes=0;
    const check=(n,ctx={})=>{try{if(++nodes>2500)throw new Error('Render budget exceeded.');const val=(k,d)=>Object.hasOwn(n,k)?read(n[k],ctx):d;
      if(Object.hasOwn(n,'visible')){const v=val('visible');if(typeof v!=='boolean')throw new Error('Visibility must be boolean.');if(!v)return;}
      for(const k of ['text','value','label','max'])if(Object.hasOwn(n,k)){val(k);evaluated++;}
      if(Object.hasOwn(n,'disabled')&&typeof val('disabled')!=='boolean')throw new Error('Disabled must be boolean.');
      if(n.type==='select'){const o=val('options');if(!Array.isArray(o)||o.length>100||!o.every(v=>typeof v==='string'))throw new Error('Invalid select options.');}
      if(n.type==='progress'){const v=val('value',0),m=val('max',100);if(typeof v!=='number'||typeof m!=='number'||m<=0)throw new Error('Invalid progress values.');}
      if(n.type==='collection'){for(const r of snapshot.data[n.collection]){const row={...r.values,_id:r.id};for(const k of ['filter','highlight'])if(Object.hasOwn(n,k)&&typeof read(n[k],{...ctx,row})!=='boolean')throw new Error('Collection rule must be boolean.');}}
      if(n.type==='repeat'){const rows=val('items');if(!Array.isArray(rows)||rows.length>1000)throw new Error('Invalid repeated items.');for(const row of rows)for(const child of n.children??[])check(child,{...ctx,row});}
      else for(const child of n.children??[])check(child,ctx);
      }catch(e){e.node??=n.id;throw e;}
    };
    for(const page of p.pages){try{check(page.root);}catch(e){issues.push({scenario:name,page:page.id,node:e.node,error:e.message});}}
  }
  return {passed:tests.passed&&issues.length===0,tests,evaluated,issues,warnings:tests.total===0?['No behavior tests supplied; functional correctness is unverified.']:[],method:'Structural validation, deterministic interpreter tests, and expression preflight. No visual or live-provider verification.'};
}
