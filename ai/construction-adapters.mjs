import {BuildError,text,boundedJSON,bytes} from './build-io.mjs';
const count=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const invalid=()=>new BuildError('AI_INVALID_RESPONSE','Malformed provider response. No changes applied.');
const incomplete=()=>new BuildError('AI_INCOMPLETE_RESPONSE','Expected exactly one complete local tool call. Try a smaller request. No changes applied.');
const refused=()=>new BuildError('AI_REFUSED','The provider declined this request.',422);

/** Private configuration: never serialize this object to clients. No implicit fallback. */
export function adapterConfig(env){
  const provider=env.V3_AI_PROVIDER??env.AI_PROVIDER;
  const model=env.V3_AI_MODEL??(provider==='gemini'?'gemini-3.8-flash':env.AI_MODEL??'openai/gpt-oss-120b');
  if(provider==='groq'&&['openai/gpt-oss-120b','openai/gpt-oss-20b'].includes(model)&&text(env.GROQ_API_KEY,1024))return {provider,model,apiKey:env.GROQ_API_KEY,endpoint:'https://api.groq.com/openai/v1/chat/completions'};
  if(provider==='gemini'&&model==='gemini-3.8-flash'&&text(env.GEMINI_API_KEY,1024))return {provider,model,apiKey:env.GEMINI_API_KEY,endpoint:`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`};
  return null;
}
export function normalizeUsage(provider,data){
  const u=provider==='gemini'?data?.usageMetadata:data?.usage;
  return provider==='gemini'?{inputTokens:count(u?.promptTokenCount),outputTokens:count(u?.candidatesTokenCount),thinkingTokens:count(u?.thoughtsTokenCount),cachedTokens:count(u?.cachedContentTokenCount),totalTokens:count(u?.totalTokenCount),outputIncludesThinking:false}
    :{inputTokens:count(u?.prompt_tokens),outputTokens:count(u?.completion_tokens),thinkingTokens:count(u?.completion_tokens_details?.reasoning_tokens),cachedTokens:count(u?.prompt_tokens_details?.cached_tokens),totalTokens:count(u?.total_tokens),outputIncludesThinking:true};
}
/** A conservative completion bound; preserve unknown components as null in reported usage.
 * Gemini total includes prompt + tool-use prompt + thoughts + candidates. Removing only
 * prompt tokens therefore still bounds completion when the thinking breakdown is absent.
 */
export function completionUsageBound(usage){
  const input=count(usage.inputTokens),total=count(usage.totalTokens),output=count(usage.outputTokens),thinking=count(usage.thinkingTokens);
  const known=usage.outputIncludesThinking?output:(output!==null&&thinking!==null&&Number.isSafeInteger(output+thinking)?output+thinking:null);
  const difference=input!==null&&total!==null&&total>=input?total-input:null;
  // Inconsistent totals cannot justify a refund of reserved output capacity.
  if(usage.outputIncludesThinking&&output!==null&&thinking!==null&&thinking>output)return {tokens:null,basis:'unknown-or-inconsistent'};
  if(input!==null&&total!==null&&(difference===null||difference<(known??Math.max(output??0,thinking??0))))return {tokens:null,basis:'unknown-or-inconsistent'};
  if(known!==null)return {tokens:known,basis:usage.outputIncludesThinking?'reported-completion':'reported-output-plus-thinking'};
  if(difference!==null)return {tokens:difference,basis:'reported-total-minus-input-upper-bound'};
  return {tokens:null,basis:'unknown-or-inconsistent'};
}
/** One adapter instance per build. Opaque Gemini content never leaves this closure. */
export function createAdapter(config,{instructions,input,tools}){
  const gemini=config.provider==='gemini';
  const history=gemini?[{role:'user',parts:[{text:JSON.stringify(input)}]}]:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(input)}];
  let pending=null;
  return {
    request(maxTokens){
      const payload=gemini?{systemInstruction:{parts:[{text:instructions}]},contents:history,tools:[{functionDeclarations:tools.map(t=>({name:t.function.name,description:t.function.description,parametersJsonSchema:t.function.parameters}))}],toolConfig:{functionCallingConfig:{mode:'ANY',allowedFunctionNames:tools.map(t=>t.function.name)}},generationConfig:{maxOutputTokens:maxTokens,thinkingConfig:{thinkingLevel:'LOW',includeThoughts:false}},store:false}
        :{model:config.model,messages:history,tools,tool_choice:'auto',parallel_tool_calls:false,reasoning_effort:'low',max_completion_tokens:maxTokens,stream:false};
      return {url:config.endpoint,init:{method:'POST',redirect:'manual',headers:gemini?{'x-goog-api-key':config.apiKey,'Content-Type':'application/json'}:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload)}};
    },
    parse(data){
      let call;
      if(gemini){
        if(data?.promptFeedback?.blockReason)throw refused();
        if(!Array.isArray(data?.candidates)||data.candidates.length!==1)throw invalid();
        const c=data.candidates[0];if(['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII'].includes(c.finishReason))throw refused();
        if(c.finishReason!=='STOP')throw incomplete();
        const content=c.content;if(content?.role!=='model'||!Array.isArray(content.parts)||content.parts.length>64)throw invalid();
        const calls=content.parts.filter(p=>p?.functionCall);
        if(calls.length!==1)throw incomplete();
        // Reject non-text/non-call output, including built-in tools; preserve ALL original parts/signatures.
        if(content.parts.some(p=>!p||Object.keys(p).some(k=>!['text','thought','thoughtSignature','partMetadata','functionCall'].includes(k))))throw invalid();
        const f=calls[0].functionCall;
        if(!text(f.name,60)||!f.args||typeof f.args!=='object'||Array.isArray(f.args)||bytes(f.args)>180000||(f.id!==undefined&&!text(f.id,100)))throw invalid();
        pending={content:structuredClone(content),id:f.id,name:f.name};call={name:f.name,args:structuredClone(f.args)};
      }else{
        if(!Array.isArray(data?.choices)||data.choices.length!==1)throw invalid();
        const c=data.choices[0],m=c.message;if(m?.refusal||c.finish_reason==='content_filter')throw refused();
        if(c.finish_reason!=='tool_calls'||!Array.isArray(m?.tool_calls)||m.tool_calls.length!==1)throw incomplete();
        const f=m.tool_calls[0];if(f.type!=='function'||!text(f.id,100)||!text(f.function?.name,60)||!text(f.function?.arguments,180000))throw invalid();
        pending={id:f.id,name:f.function.name,content:{role:'assistant',content:null,tool_calls:[{id:f.id,type:'function',function:{name:f.function.name,arguments:f.function.arguments}}]}};
        // Invalid JSON is repairable local tool feedback, never a transport retry.
        try{call={name:f.function.name,args:JSON.parse(f.function.arguments)};}catch{call={name:f.function.name,argumentError:true};}
      }
      return {call,usage:normalizeUsage(config.provider,data),estimatedOutputTokens:Math.ceil(bytes(call)/3)};
    },
    continue(result){
      if(!pending)throw invalid();
      history.push(pending.content);
      if(gemini)history.push({role:'user',parts:[{functionResponse:{name:pending.name,...(pending.id?{id:pending.id}:{}),response:result}}]});
      else history.push({role:'tool',tool_call_id:pending.id,content:JSON.stringify(result)});
      pending=null;
    }
  };
}
/** Fixed hosts, manual redirects, bounded bytes, caller-owned signal/deadline, no retries. */
export async function sendAdapterRequest(request,fetcher,signal,onData){
  try{
    const r=await fetcher(request.url,{...request.init,signal});
    if(!r.ok){try{await r.body?.cancel();}catch{}
      if(r.status>=300&&r.status<400)throw new BuildError('AI_REDIRECT_REJECTED','Provider redirect rejected. Credentials were not forwarded.');
      if(r.status===429){const raw=r.headers?.get('Retry-After');const retry=raw&&/^\d+$/.test(raw)?Math.min(86400,Math.max(1,Number(raw))):60;throw new BuildError('AI_QUOTA_EXCEEDED','Provider quota is busy or exhausted. No automatic retry.',429,retry);}
      if([401,403].includes(r.status))throw new BuildError('AI_CREDENTIALS_REJECTED','Provider credentials or model access require operator attention.',503);
      if(r.status===404)throw new BuildError('AI_MODEL_UNAVAILABLE','Selected model or endpoint is unavailable. Check project access.',503);
      if(r.status===400)throw new BuildError('AI_REQUEST_REJECTED','Provider rejected the request contract. Operator attention required.');
      throw new BuildError('AI_PROVIDER_ERROR','Provider could not complete this construction request.');
    }
    const data=await boundedJSON(r,262144);onData?.(data);return data;
  }catch(e){
    if(e instanceof BuildError)throw e;
    if(['TimeoutError','AbortError'].includes(e?.name))throw new BuildError('AI_TIMEOUT','Provider request timed out or was cancelled. No changes applied.',504);
    if(e instanceof SyntaxError)throw invalid();
    throw new BuildError('AI_UNAVAILABLE','Provider connection did not complete. No changes applied.',503);
  }
}
