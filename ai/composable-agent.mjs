import {validateProgram,compatible,applyEdits} from '../docs/v3/kernel.mjs';
import {inspectProgram,preflight} from '../docs/v3/checks.mjs';
import {INSTRUCTIONS_V3,CONSTRUCTION_TOOLS} from './composable-spec.mjs';
export class BuildError extends Error {
  constructor(code,message,status=502,retryAfter=null){super(message);this.code=code;this.status=status;this.retryAfter=retryAfter;}
}
const text=(x,n)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
export function composableConfig(env) {
  const model=env.AI_MODEL??'openai/gpt-oss-120b',calls=Number(env.V3_MAX_CALLS??3);
  if(env.AI_PROVIDER!=='groq'||!text(env.GROQ_API_KEY,1024)||!['openai/gpt-oss-120b','openai/gpt-oss-20b'].includes(model)||!Number.isInteger(calls)||calls<2||calls>3)return null;
  return {model,maxCalls:calls,maxCompletionTokens:8192,deadlineMs:55000};
}
export async function boundedJSON(response,limit=200000) {
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing response body.');let size=0;const parts=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel().catch(()=>{});throw new Error('Body limit exceeded.');}parts.push(value);}const bytes=new Uint8Array(size);let i=0;for(const part of parts){bytes.set(part,i);i+=part.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}finally{reader.releaseLock();}
}
const assertKeys=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k)))throw new Error('Unknown or missing tool argument.');};
/** Only modifies an in-memory draft; the browser must explicitly approve application. */
export function createConstructionSession(current,revision=0) {
  let draft=current?validateProgram(current):null,changed=false,report=null,localRevision=revision;
  return {
    inspect:()=>draft?inspectProgram(draft):{empty:true},
    draft:()=>draft?structuredClone(draft):null,
    perform(name,args){
      if(name==='inspect_app'){assertKeys(args,[]);return {summary:this.inspect()};}
      if(name==='test_app'){assertKeys(args,[]);if(!draft)throw new Error('No draft exists.');report=preflight(draft);return report;}
      if(name==='unsupported'){assertKeys(args,['message']);if(!text(args.message,600))throw new Error('Explain the unsupported capability.');return {finished:true,status:'unsupported',message:args.message,app:null};}
      if(name==='edit_app'){
        assertKeys(args,['payload']);if(!text(args.payload,170000))throw new Error('Invalid edit payload.');const value=JSON.parse(args.payload);let next;
        if(!draft){assertKeys(value,['program']);next=validateProgram(value.program);next.id=`app-${globalThis.crypto.randomUUID()}`;}
        else {assertKeys(value,['edits']);next=applyEdits(draft,value.edits,localRevision,localRevision);}
        if(current)compatible(current,next,null);
        changed=changed||JSON.stringify(next)!==JSON.stringify(draft);draft=next;localRevision++;report=preflight(draft);
        return {revision:localRevision,checks:report,summary:inspectProgram(draft),note:'Draft only. Nothing has been applied to user data.'};
      }
      if(name==='finish_build'){
        assertKeys(args,['message']);if(!text(args.message,600))throw new Error('A brief result message is required.');
        if(!draft||!changed)throw new Error('No changed draft to finish.');report=preflight(draft);if(!report.passed)throw new Error('Draft checks failed. Repair before finishing.');
        return {finished:true,status:'ready',message:args.message,app:structuredClone(draft),checks:report,baseRevision:revision};
      }
      throw new Error('Unsupported construction tool.');
    }
  };
}
export async function buildComposable({prompt,current=null,revision=0,conversation=[]},env,fetcher=fetch) {
  const config=composableConfig(env);if(!config)throw new BuildError('AI_NOT_CONFIGURED','The composable builder is not configured.',503);
  if(!text(prompt,3000)||!Number.isSafeInteger(revision)||revision<0)throw new BuildError('INVALID_REQUEST','Invalid build request.',400);
  if(!Array.isArray(conversation)||conversation.length>8||conversation.some(m=>!m||Object.keys(m).length!==2||!['user','assistant'].includes(m.role)||!text(m.content,1500)))throw new BuildError('INVALID_REQUEST','Invalid conversation history.',400);
  if(current!==null)validateProgram(current);
  const session=createConstructionSession(current,revision),messages=[{role:'system',content:INSTRUCTIONS_V3},{role:'user',content:JSON.stringify({request:prompt,current,conversation,revision})}];
  const start=Date.now(),trace=[];let remaining=config.maxCompletionTokens,inputBytes=0;
  for(let turn=0;turn<config.maxCalls;turn++){
    const left=config.deadlineMs-(Date.now()-start);if(left<=0)throw new BuildError('AI_TIMEOUT','The construction time budget was exhausted. No draft was applied.',504);
    if(remaining<512)break;
    const payload={model:config.model,messages,tools:CONSTRUCTION_TOOLS,tool_choice:'auto',parallel_tool_calls:false,reasoning_effort:'low',max_completion_tokens:Math.min(4096,remaining),stream:false};
    const body=JSON.stringify(payload);inputBytes+=new TextEncoder().encode(body).length;if(inputBytes>220000)throw new BuildError('AI_BUDGET_EXCEEDED','The construction input budget was exhausted. Try a smaller change.',422);
    let response,data;
    try{
      response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${env.GROQ_API_KEY}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(Math.min(30000,left))});
      if(!response.ok){await response.body?.cancel().catch(()=>{});
        if(response.status===429)throw new BuildError('AI_QUOTA_EXCEEDED','Groq quota is busy or exhausted. No changes applied; no automatic retry.',429,60);
        if([401,403].includes(response.status))throw new BuildError('AI_CREDENTIALS_REJECTED','Provider credentials or model access require operator attention.',503);
        if(response.status>=300&&response.status<400)throw new BuildError('AI_REDIRECT_REJECTED','Provider redirect rejected. Credentials were not forwarded.');
        throw new BuildError('AI_PROVIDER_ERROR','The provider could not complete this construction request.');}
      data=await boundedJSON(response,262144);
    }catch(e){if(e instanceof BuildError)throw e;throw new BuildError(['TimeoutError','AbortError'].includes(e?.name)?'AI_TIMEOUT':'AI_UNAVAILABLE','The provider connection did not complete. No draft applied.',503);}
    const used=data?.usage?.completion_tokens;remaining-=Number.isSafeInteger(used)&&used>=0?Math.max(used,Math.ceil(JSON.stringify(data.choices??[]).length/3)):payload.max_completion_tokens;
    if(!Array.isArray(data?.choices)||data.choices.length!==1)throw new BuildError('AI_INVALID_RESPONSE','Invalid provider response. No changes applied.');
    const choice=data.choices[0],msg=choice.message;
    if(msg?.refusal||choice.finish_reason==='content_filter')throw new BuildError('AI_REFUSED','The model declined the request.',422);
    if(choice.finish_reason!=='tool_calls'||!Array.isArray(msg?.tool_calls)||msg.tool_calls.length!==1)throw new BuildError('AI_INCOMPLETE_RESPONSE','The model did not finish a valid construction step. No changes applied.');
    const call=msg.tool_calls[0];if(call.type!=='function'||!text(call.id,100)||!text(call.function?.name,60)||!text(call.function?.arguments,180000))throw new BuildError('AI_INVALID_RESPONSE','Malformed construction tool call.');
    // Drop provider reasoning and arbitrary metadata. Only the declared local tool is executable.
    messages.push({role:'assistant',content:null,tool_calls:[{id:call.id,type:'function',function:{name:call.function.name,arguments:call.function.arguments}}]});
    let result;
    try{result=session.perform(call.function.name,JSON.parse(call.function.arguments));trace.push({tool:call.function.name,ok:true,tests:result.checks?.tests?.total??result.tests?.total??null});}
    catch(e){result={error:e instanceof SyntaxError?'Tool payload is not JSON.':e.message};trace.push({tool:CONSTRUCTION_TOOLS.some(t=>t.function.name===call.function.name)?call.function.name:'unknown',ok:false});}
    if(result.finished){const {finished,...final}=result;return {...final,usage:{calls:turn+1,completionBudget:config.maxCompletionTokens,remainingCompletionBudget:Math.max(0,remaining),inputBytes},trace};}
    messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
  }
  throw new BuildError('AI_BUDGET_EXCEEDED','The model used its construction-turn budget without finishing a tested draft. No changes applied.',422);
}
