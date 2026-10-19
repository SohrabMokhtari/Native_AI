import {validateProgram,compatible,applyEdits} from '../docs/v3/kernel.mjs';
import {inspectProgram,preflight} from '../docs/v3/checks.mjs';
import {EFFICIENT_INSTRUCTIONS,EFFICIENT_TOOLS} from './composable-spec.mjs';
import {BuildError,text,bytes} from './build-io.mjs';
import {adapterConfig,createAdapter,sendAdapterRequest,normalizeUsage,completionUsageBound} from './construction-adapters.mjs';
import {contextIndex,inspectStructure,compactChecks} from './construction-context.mjs';
export {BuildError,boundedJSON} from './build-io.mjs';
export function composableConfig(env){
  const config=adapterConfig(env),calls=Number(env.V3_MAX_CALLS??3);
  if(!config||!Number.isInteger(calls)||calls<2||calls>3)return null;
  return {provider:config.provider,model:config.model,maxCalls:calls,maxCompletionTokens:8192,deadlineMs:55000};
}
const assertKeys=(v,keys,path='$.arguments')=>{
  const object=v&&typeof v==='object'&&!Array.isArray(v),missing=keys.filter(k=>!object||!Object.hasOwn(v,k)),unknown=object?Object.keys(v).filter(k=>!keys.includes(k)):[];
  if(object&&!missing.length&&!unknown.length)return;
  const e=new Error(`Unknown or missing tool argument at ${path}.${missing.length?` Required: ${missing.join(', ')}.`:''}${unknown.length?' Remove unexpected properties.':''}`);
  e.code='INVALID_TOOL_ARGUMENTS';e.details={path,missingFields:missing,unknownFieldCount:unknown.length,requiredFields:keys,allowedFields:keys};throw e;
};
const budgetExceeded=(limit,message)=>{const e=new BuildError('AI_BUDGET_EXCEEDED',message,422);e.limit=limit;return e;};
/** Only modifies an in-memory draft; the browser must explicitly approve application. */
export function createConstructionSession(current,revision=0) {
  let draft=current?validateProgram(current):null,changed=false,report=null,localRevision=revision,location=[];
  return {
    inspect:()=>draft?inspectProgram(draft):{empty:true},
    draft:()=>draft?structuredClone(draft):null,
    revision:()=>localRevision,
    status:()=>({hasDraft:!!draft,revision:localRevision,nextPayload:draft?'edits':'program',checksPassed:report?.passed??null}),
    diagnostics:()=>({targets:location,checks:report?compactChecks(report):null}),
    perform(name,args){
      if(name==='inspect_structure'){assertKeys(args,['targets']);return {revision:localRevision,...inspectStructure(draft,args.targets)};}
      if(name==='submit_app'){
        assertKeys(args,['payload','message','revision']);
        if(args.revision!==localRevision)throw new Error('Stale draft revision. Inspect or use the latest returned revision.');
        if(!text(args.message,600))throw new Error('A brief result message is required.');
        this.perform('edit_app',{payload:args.payload});
        return this.perform('finish_build',{message:args.message});
      }
      if(name==='inspect_app'){assertKeys(args,[]);return {summary:this.inspect(),draftState:this.status()};}
      if(name==='test_app'){assertKeys(args,[]);if(!draft)throw new Error('No draft exists.');report=preflight(draft);return report;}
      if(name==='unsupported'){assertKeys(args,['message']);if(!text(args.message,600))throw new Error('Explain the unsupported capability.');return {finished:true,status:'unsupported',message:args.message,app:null};}
      if(name==='edit_app'){
        assertKeys(args,['payload']);if(!text(args.payload,170000))throw new Error('Invalid edit payload.');const value=JSON.parse(args.payload);let next;
        location=Array.isArray(value?.edits)?value.edits.slice(0,8).map(e=>({section:typeof e?.section==='string'?e.section.slice(0,24):'unknown',id:typeof e?.id==='string'?e.id.slice(0,48):''})):[{section:'program',id:''}];
        if(!draft){assertKeys(value,['program'],'$.payload');next=validateProgram(value.program);next.id=`app-${globalThis.crypto.randomUUID()}`;}
        else {assertKeys(value,['edits'],'$.payload');next=applyEdits(draft,value.edits,localRevision,localRevision);}
        if(current)compatible(current,next,null);
        changed=changed||JSON.stringify(next)!==JSON.stringify(draft);draft=next;localRevision++;report=preflight(draft);
        return {revision:localRevision,checks:report,summary:inspectProgram(draft),note:'Draft only. Nothing has been applied to user data.'};
      }
      if(name==='finish_build'){
        assertKeys(args,['message']);if(!text(args.message,600))throw new Error('A brief result message is required.');
        if(!draft||!changed)throw new Error('No changed draft to finish.');report??=preflight(draft);if(!report.passed)throw new Error('Draft checks failed. Repair before finishing.');
        if(report.tests.total===0)throw new Error('Complete submissions require at least one supplied behavior test. Add meaningful fictional assertions before finishing.');
        return {finished:true,status:'ready',message:args.message,app:structuredClone(draft),checks:report,baseRevision:revision};
      }
      throw new Error('Unsupported construction tool.');
    }
  };
}

/** Provider-independent construction. Per-build closure only; never receives saved records. */
export async function buildComposable({prompt,current=null,revision=0,conversation=[]},env,fetcher=fetch,options={}){
  const config=composableConfig(env);if(!config)throw new BuildError('AI_NOT_CONFIGURED','Selected v3 provider/model/secret is not configured. No fallback.',503);
  if(!text(prompt,3000)||!Number.isSafeInteger(revision)||revision<0)throw new BuildError('INVALID_REQUEST','Invalid build request.',400);
  if(!Array.isArray(conversation)||conversation.length>8||conversation.some(m=>!m||Object.keys(m).length!==2||!['user','assistant'].includes(m.role)||!text(m.content,1500)))throw new BuildError('INVALID_REQUEST','Invalid conversation history.',400);
  if(current!==null)current=validateProgram(current);
  const session=createConstructionSession(current,revision),adapter=createAdapter(adapterConfig(env),{instructions:EFFICIENT_INSTRUCTIONS,input:{request:prompt,current:contextIndex(current,revision),conversation,revision},tools:EFFICIENT_TOOLS});
  const start=Date.now(),trace=[],turns=[];let remaining=config.maxCompletionTokens,inputBytes=0,calls=0,repairs=0;
  const usage=()=>({provider:config.provider,model:config.model,calls,maxCalls:config.maxCalls,elapsedMs:Date.now()-start,repairs,inputBytes,completionBudget:config.maxCompletionTokens,remainingCompletionBudget:Math.max(0,remaining),turns:structuredClone(turns)});
  try{
    for(let turn=0;turn<config.maxCalls;turn++){
      const left=config.deadlineMs-(Date.now()-start);if(left<=0)throw new BuildError('AI_TIMEOUT','Construction time budget exhausted. No draft applied.',504);
      if(remaining<512)throw budgetExceeded('completion','Insufficient completion capacity for another construction step. No draft applied.');
      if(options.signal?.aborted)throw new BuildError('AI_TIMEOUT','Construction cancelled. No draft applied.',504);
      const allocation=Math.min(4096,remaining),request=adapter.request(allocation),size=bytes(request.init.body);
      if(inputBytes+size>220000)throw budgetExceeded('inputBytes','Construction input budget exhausted. Try a smaller change.');
      inputBytes+=size;calls++;remaining-=allocation;
      const metric={inputBytes:size,allocatedCompletionTokens:allocation,reported:null,estimatedOutputTokens:null,chargedCompletionTokens:allocation,completionChargeBasis:'reserved-allocation'};turns.push(metric);
      const deadline=AbortSignal.timeout(Math.min(30000,left));const signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
      const data=await sendAdapterRequest(request,fetcher,signal,d=>{metric.reported=normalizeUsage(config.provider,d);});
      const parsed=adapter.parse(data);metric.estimatedOutputTokens=parsed.estimatedOutputTokens;
      const bound=completionUsageBound(parsed.usage);
      // Refund only from complete counts or a conservative total-minus-input bound.
      // Missing thinking details stay unknown; missing usable counts spend the allocation.
      metric.completionChargeBasis=bound.tokens===null?'reserved-allocation':bound.basis;
      metric.chargedCompletionTokens=bound.tokens===null?allocation:Math.max(bound.tokens,parsed.estimatedOutputTokens);remaining+=allocation-metric.chargedCompletionTokens;
      if(remaining<0)throw budgetExceeded('completion','Completion budget exceeded. No draft applied.');
      const call=parsed.call,known=EFFICIENT_TOOLS.some(t=>t.function.name===call.name);let result;
      try{
        if(!known)throw new Error('Unsupported construction tool. Use only declared tools.');
        if(call.argumentError)throw new Error('Tool arguments are not JSON.');
        result=session.perform(call.name,call.args);
        trace.push({tool:call.name,ok:true,tests:result.checks?.tests?.total??result.tests?.total??null});
      }catch(e){
        repairs++;const details=['INVALID_PROGRAM_SCHEMA','INVALID_TOOL_ARGUMENTS'].includes(e.code)?structuredClone(e.details):undefined;
        result={error:{code:'INVALID_CONSTRUCTION',message:(e instanceof SyntaxError?'Tool payload is not JSON.':e.message).slice(0,500),operation:known?call.name:'unknown',...(details?{details}:{})},revision:session.revision(),draftState:session.status(),diagnostics:session.diagnostics(),guidance:session.status().hasDraft?'Repair with ID-based edits at this revision, then submit_app. Use supplied field diagnostics; no extra inspection is needed for a missing property.':'No validated draft exists. Resubmit the complete corrected {program:...} using submit_app at this revision. Do not send {edits:...} or inspect_app to repair an empty draft.'};
        trace.push({tool:known?call.name:'unknown',ok:false,error:result.error,revision:session.revision(),draftState:result.draftState,...(result.diagnostics.checks?.passed===false?{draftChecks:structuredClone(result.diagnostics.checks)}:{})});
      }
      if(result.finished){const {finished,...final}=result;return {...final,usage:usage(),trace};}
      // Exact inspection is explicitly requested. Automatic feedback never echoes an unchanged app.
      const feedback=result.checks?{revision:result.revision,checks:compactChecks(result.checks)}:result;
      adapter.continue({...feedback,budget:{remainingCalls:config.maxCalls-calls,remainingCompletionTokens:Math.max(0,remaining)},draftState:session.status()});
    }
    throw budgetExceeded('calls',`Construction call limit (${config.maxCalls}) reached without a complete tested submission. No changes applied.`);
  }catch(e){if(e instanceof BuildError){e.usage=usage();e.trace=structuredClone(trace);throw e;}throw new BuildError('BUILD_UNAVAILABLE','Construction failed. No changes applied.',503);}
}
