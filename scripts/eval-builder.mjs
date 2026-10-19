import {pathToFileURL} from 'node:url';
import {buildComposable} from '../ai/composable-agent.mjs';
import {buildComposable as baseline} from './baseline-agent.mjs';
import {normalizeUsage} from '../ai/construction-adapters.mjs';
import {boundedJSON,bytes,BuildError,withAbort} from '../ai/build-io.mjs';
import {CASES,accept} from './eval-cases.mjs';
import {compatible} from '../docs/v3/kernel.mjs';
export const CONFIGURATIONS=['baseline-groq','optimized-groq','optimized-gemini'];
export function parseArgs(args){
  const out={live:false,config:'all',case:'all',maxCalls:null,maxTokens:null};
  for(const arg of args){if(arg==='--live')out.live=true;else if(arg.startsWith('--config='))out.config=arg.slice(9);else if(arg.startsWith('--case='))out.case=arg.slice(7);else if(arg.startsWith('--max-calls='))out.maxCalls=Number(arg.slice(12));else if(arg.startsWith('--max-tokens='))out.maxTokens=Number(arg.slice(13));else throw new Error('Unknown evaluation argument.');}
  if(out.config!=='all'&&!CONFIGURATIONS.includes(out.config))throw new Error('Unknown configuration.');if(out.case!=='all'&&!CASES.some(c=>c.id===out.case))throw new Error('Unknown case.');
  if(out.live&&(!Number.isInteger(out.maxCalls)||out.maxCalls<1||out.maxCalls>72||!Number.isInteger(out.maxTokens)||out.maxTokens<4096||out.maxTokens>294912))throw new Error('Live runs require --max-calls=1..72 and --max-tokens=4096..294912. Tokens bound reserved output including thinking; input bytes are separately bounded per build.');return out;
}
export async function evaluate(options,env={},fetcher=fetch,onProgress=()=>{}){
  const configs=options.config==='all'?CONFIGURATIONS:[options.config],cases=options.case==='all'?CASES:CASES.filter(c=>c.id===options.case);
  if(!options.live)return {mode:'dry',liveResults:'NOT RUN',configurations:configs,cases:cases.map(c=>({id:c.id,heldOut:!!c.heldOut,prompt:c.prompt})),limits:{callsPerBuild:3,completionTokensPerBuild:8192,inputBytesPerBuild:220000,deadlineMs:55000},note:'No inference, no canned results. Live mode requires explicit call/output-token reservation budgets and private keys.'};
  // Validate every selected credential before spending any quota.
  for(const name of configs)if(!(name.endsWith('gemini')?env.GEMINI_API_KEY:env.GROQ_API_KEY)?.trim())throw new Error('Missing private credential for selected evaluation. No requests sent.');
  const results=[];let calls=0,reservedTokens=0,stop=null;
  outer:for(const name of configs)for(const c of cases){
    if(calls>=options.maxCalls||reservedTokens+4096>options.maxTokens){stop='EVAL_BUDGET_EXHAUSTED';break outer;}
    const provider=name.endsWith('gemini')?'gemini':'groq',settings={AI_PROVIDER:'groq',AI_MODEL:'openai/gpt-oss-120b',GROQ_API_KEY:env.GROQ_API_KEY,GEMINI_API_KEY:env.GEMINI_API_KEY,V3_AI_PROVIDER:provider,V3_AI_MODEL:provider==='gemini'?'gemini-3.8-flash':'openai/gpt-oss-120b',V3_MAX_CALLS:'3'};
    const start=c.start(),before=structuredClone(start),metrics=[],started=Date.now();let result,error=null,budgetLimit=null,validation=null,failedUsage=null,failedTrace=[];
    const progress=(event,extra={})=>onProgress({event,configuration:name,case:c.id,elapsedMs:Date.now()-started,...extra});
    progress('case-start');
    const measuredFetch=async(url,init)=>{
      const body=JSON.parse(init.body),allocation=body.max_completion_tokens??body.generationConfig.maxOutputTokens;
      if(calls>=options.maxCalls||reservedTokens+allocation>options.maxTokens){stop='EVAL_BUDGET_EXHAUSTED';throw new BuildError(stop,'Evaluation reservation budget exhausted.',422);}
      calls++;reservedTokens+=allocation;const metric={inputBytes:bytes(init.body),reservedOutputTokens:allocation,reported:null,status:null};metrics.push(metric);
      progress('request-start',{call:metrics.length});
      const response=await withAbort(()=>fetcher(url,init),init.signal);metric.status=response.status;
      progress('response-headers',{call:metrics.length,status:response.status});
      if(!response.ok)return response;
      // Buffer ONCE with the same byte bound. Do not tee/clone into an unbounded queue.
      const data=await boundedJSON(response,262144,init.signal);metric.reported=normalizeUsage(provider,data);progress('response-complete',{call:metrics.length});return Response.json(data);
    };
    try{result=await (name==='baseline-groq'?baseline:buildComposable)({prompt:c.prompt,current:start.current,revision:start.revision,conversation:[]},settings,measuredFetch);validation=accept(c,result,start);}catch(e){failedUsage=e.usage;failedTrace=e.trace??[];budgetLimit=e.limit??null;error=e instanceof BuildError?e.code:e?.code?.startsWith('AI_')?e.code:'ACCEPTANCE_FAILED';}
    const unchanged=JSON.stringify(start)===JSON.stringify(before);let preserved=unchanged;
    if(start.current&&result?.status==='ready'){try{const next=compatible(start.current,result.app,start.snapshot);preserved=JSON.stringify(next.data)===JSON.stringify(start.snapshot.data)&&Object.entries(start.snapshot.state).every(([k,v])=>JSON.stringify(next.state[k])===JSON.stringify(v));}catch{preserved=false;}}
    results.push({configuration:name,case:c.id,success:!error,error,budgetLimit,calls:metrics.length,inputBytes:metrics.reduce((s,m)=>s+m.inputBytes,0),elapsedMs:Date.now()-started,repairs:result?.usage?.repairs??failedUsage?.repairs??result?.trace?.filter(t=>!t.ok).length??null,dataPreserved:preserved,inputUnchanged:unchanged,exported:validation?.exported??false,metrics,buildUsage:result?.usage??failedUsage??null,trace:result?.trace??failedTrace});
    progress('case-complete',{success:!error});
    if(error==='AI_QUOTA_EXCEEDED'){stop=error;break outer;}
    if(stop)break outer;
  }
  const summaries=configs.map(configuration=>{const rows=results.filter(r=>r.configuration===configuration),successes=rows.filter(r=>r.success).length;const all=rows.flatMap(r=>r.metrics);
    const tokens={};for(const k of ['inputTokens','outputTokens','thinkingTokens','cachedTokens','totalTokens']){const known=all.filter(m=>m.reported?.[k]!==null&&m.reported?.[k]!==undefined);tokens[k]={reportedSum:known.reduce((n,m)=>n+m.reported[k],0),unknownCalls:all.length-known.length};}
    return {configuration,attempts:rows.length,successes,failures:rows.length-successes,calls:all.length,callsPerSuccess:successes?all.length/successes:null,inputBytes:rows.reduce((n,r)=>n+r.inputBytes,0),elapsedMs:rows.reduce((n,r)=>n+r.elapsedMs,0),repairs:rows.reduce((n,r)=>n+(r.repairs??0),0),unknownRepairAttempts:rows.filter(r=>r.repairs===null).length,quotaErrors:rows.filter(r=>r.error==='AI_QUOTA_EXCEEDED').length,dataPreserved:rows.length?rows.every(r=>r.dataPreserved):null,tokens,outputIncludesThinking:configuration!=='optimized-gemini'};});
  return {mode:'live',stop,calls,reservedOutputTokens:reservedTokens,results,summaries,note:'Failed attempts included. Cached counts are subsets of input; Groq thinking is a subset of completion; Gemini thinking is separate. Unknown counts are not zero. Direct provider evaluation is not deployed end-to-end verification.'};
}
/** Keep stdout machine-readable; live status and heartbeat go only to stderr. */
export async function runCLI(args,env=process.env,fetcher=fetch,io={out:line=>console.log(line),err:line=>console.error(line)}){
  let heartbeat;
  try{
    const options=parseArgs(args),started=Date.now();let stage='Starting evaluation.';
    if(options.live){
      io.err(`[eval] Live ${options.config}/${options.case}; max ${options.maxCalls} calls and ${options.maxTokens} reserved output tokens.`);
      io.err('[eval] Each request has a 30s timeout; each build has a 55s deadline. This command prints a report; it does not open or save an app.');
      heartbeat=setInterval(()=>io.err(`[eval] ${Math.floor((Date.now()-started)/1000)}s elapsed. ${stage}`),5000);
    }
    const report=await evaluate(options,env,fetcher,event=>{
      const label=`${event.configuration}/${event.case}`;
      if(event.event==='case-start')stage=`Starting ${label}.`;
      else if(event.event==='request-start')stage=`${label}: call ${event.call}; waiting for response headers.`;
      else if(event.event==='response-headers')stage=`${label}: call ${event.call}; HTTP ${event.status}${event.status>=200&&event.status<300?'; reading response body.':'.'}`;
      else if(event.event==='response-complete')stage=`${label}: call ${event.call}; response received, checking construction.`;
      else if(event.event==='case-complete')stage=`${label}: ${event.success?'passed':'failed'}; preparing report.`;
      io.err(`[eval] ${stage}`);
    });
    io.out(JSON.stringify(report,null,2));return report.results?.some(r=>!r.success)?1:0;
  }catch(e){io.err(e.message);return 1;}finally{clearInterval(heartbeat);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await runCLI(process.argv.slice(2));
