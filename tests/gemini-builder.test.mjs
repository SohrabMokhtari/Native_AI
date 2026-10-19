import test from 'node:test';
import assert from 'node:assert/strict';
import {buildComposable,composableConfig,createConstructionSession,BuildError} from '../ai/composable-agent.mjs';
import {createAdapter,adapterConfig,normalizeUsage,completionUsageBound,sendAdapterRequest} from '../ai/construction-adapters.mjs';
import {contextIndex,inspectStructure} from '../ai/construction-context.mjs';
import {EFFICIENT_TOOLS} from '../ai/composable-spec.mjs';
import {handleComposable} from '../ai/composable-gateway.mjs';
import {handleRequest as legacy} from '../worker.mjs';
import {buildComposable as baseline} from '../scripts/baseline-agent.mjs';
import {dashboardExample,quizExample} from '../docs/v3/examples.mjs';
import {compatible,snapshotFor,createMachine} from '../docs/v3/kernel.mjs';
import {composableHTML} from '../docs/v3/export.mjs';
const env=(provider='gemini')=>({AI_PROVIDER:'groq',AI_MODEL:'openai/gpt-oss-120b',V3_AI_PROVIDER:provider,GROQ_API_KEY:'fixture-groq-only',GEMINI_API_KEY:'fixture-google-only',PUBLIC_AI_ENABLED:'true',COMPOSABLE_AI_ENABLED:'true',TURNSTILE_SITE_KEY:'public-site',TURNSTILE_SECRET:'fixture-turnstile-only',GENERATION_LIMITER:{limit:async()=>({success:true})},GLOBAL_LIMITER:{limit:async()=>({success:true})}});
const call=(provider,name,args,extra={})=>provider==='gemini'?{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name,args,id:'fc-1'},thoughtSignature:'opaque-test-signature'}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:5,cachedContentTokenCount:10,totalTokenCount:125},...extra}
  :{choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'fc-1',type:'function',function:{name,arguments:JSON.stringify(args)}}]}}],usage:{prompt_tokens:100,completion_tokens:25,total_tokens:125,completion_tokens_details:{reasoning_tokens:5}},...extra};
const submit=(provider,p=dashboardExample(),revision=0)=>call(provider,'submit_app',{payload:JSON.stringify({program:p}),message:'Complete tested draft.',revision});
const mock=responses=>{const requests=[];return {requests,fetcher:async(url,init)=>{requests.push({url,init,body:JSON.parse(init.body)});const r=responses.shift();if(r instanceof Error)throw r;return r instanceof Response?r:Response.json(r);}};};
const code=c=>e=>e instanceof BuildError&&e.code===c;
test('v3 overrides preserve Groq defaults and legacy provider/model independently',async()=>{
  const e=env();delete e.V3_AI_PROVIDER;assert.equal(composableConfig(e).provider,'groq');assert.equal(composableConfig(e).model,'openai/gpt-oss-120b');
  e.V3_AI_PROVIDER='gemini';assert.equal(composableConfig(e).model,'gemini-3.8-flash');
  e.V3_AI_MODEL='openai/gpt-oss-120b';assert.equal(composableConfig(e),null);delete e.V3_AI_MODEL;
  const c=await (await legacy(new Request('https://unit.example/api/config'),e)).json();assert.equal(c.provider,'groq');assert.equal(c.model,'openai/gpt-oss-120b');
  delete e.GEMINI_API_KEY;assert.equal(composableConfig(e),null);
  const r=await handleComposable(new Request('https://unit.example/api/v3/config'),e);assert.equal((await r.json()).code,'AI_NOT_CONFIGURED');
});
for(const overrides of [{V3_AI_PROVIDER:'unknown'},{V3_AI_MODEL:'gemini-paid-invented'},{V3_AI_MODEL:''},{V3_AI_PROVIDER:''},{GEMINI_API_KEY:''}])test('invalid opt-in selection fails closed '+JSON.stringify(overrides),()=>assert.equal(composableConfig({...env(),...overrides}),null));
test('config response uses exact public allowlist for selected provider',async()=>{
  const c=await (await handleComposable(new Request('https://unit.example/api/v3/config'),env())).json();
  assert.deepEqual(Object.keys(c).sort(),['mode','siteKey','provider','model','maxCalls','maxCompletionTokens','deadlineMs'].sort());assert.equal(c.provider,'gemini');assert.equal(c.model,'gemini-3.8-flash');assert.doesNotMatch(JSON.stringify(c),/fixture|apiKey|endpoint|signature/);
});
for(const provider of ['groq','gemini']){
  test(provider+': complete submission finishes in one call; exports same runtime',async()=>{
    const m=mock([submit(provider)]),r=await buildComposable({prompt:'Build tasks'},env(provider),m.fetcher);
    assert.equal(r.status,'ready');assert.equal(r.checks.passed,true);assert.equal(r.usage.calls,1);assert.equal(r.usage.turns[0].reported.inputTokens,100);assert.ok(r.usage.elapsedMs>=0);
    const html=composableHTML(r.app);assert.match(html,/createKernel/);assert.doesNotMatch(html,/fixture-google|fixture-groq|opaque-test|api\/v3\/generate/);
    assert.equal(m.requests[0].init.redirect,'manual');assert.equal(m.requests[0].init.signal.aborted,false);
  });
  test(provider+': repair a malformed program with useful local feedback, not transport retries',async()=>{
    const invalid=dashboardExample();invalid.design.accent='bad';const m=mock([submit(provider,invalid),submit(provider)]);
    const r=await buildComposable({prompt:'Build'},env(provider),m.fetcher);assert.equal(r.usage.repairs,1);assert.equal(r.usage.calls,2);assert.deepEqual(r.trace.map(t=>t.ok),[false,true]);assert.match(m.requests[1].init.body,/Invalid color/);
  });
  test(provider+': failed behavior tests cannot finalize; repair uses updated revision',async()=>{
    const p=dashboardExample();p.tests[0].expect[0].equals=999;
    const fix={edits:[{section:'tests',id:'',value:dashboardExample().tests}]};
    const m=mock([submit(provider,p),call(provider,'submit_app',{payload:JSON.stringify(fix),message:'Repaired.',revision:1})]);
    const r=await buildComposable({prompt:'Build'},env(provider),m.fetcher);assert.equal(r.checks.passed,true);assert.equal(r.usage.calls,2);assert.match(m.requests[1].init.body,/checks failed/);
  });
  test(provider+': incremental inspection and edit preserve records, state, revision and input isolation',async()=>{
    const current=quizExample(),snapshot=snapshotFor(current);snapshot.state.score=2;snapshot.state.index=1;
    const before=structuredClone({current,snapshot});const m=mock([call(provider,'inspect_structure',{targets:[{section:'nodes',id:'question-text'}]}),call(provider,'submit_app',{payload:JSON.stringify({edits:[{section:'design',id:'',value:{mode:'dark',density:'compact'}}]}),message:'Dark compact draft.',revision:9})]);
    const r=await buildComposable({prompt:'Dark compact',current,revision:9},env(provider),m.fetcher);
    assert.deepEqual({current,snapshot},before);assert.equal(r.baseRevision,9);assert.deepEqual(compatible(current,r.app,snapshot),snapshot);assert.equal(r.app.design.mode,'dark');
    assert.doesNotMatch(m.requests[0].init.body,/Which planet|Red Planet/);assert.match(m.requests[1].init.body,/Which planet/);assert.doesNotMatch(JSON.stringify(r),/opaque-test/);
  });
  test(provider+': unsupported is explicit and does not produce an app',async()=>{
    const m=mock([call(provider,'unsupported',{message:'Shared authentication requires an unsupported backend.'})]);const r=await buildComposable({prompt:'Shared logins'},env(provider),m.fetcher);assert.equal(r.status,'unsupported');assert.equal(r.app,null);assert.equal(m.requests.length,1);
  });
  test(provider+': unknown tool and invalid args can repair within existing call cap',async()=>{
    const m=mock([call(provider,'fetch',{url:'https://invalid.example'}),call(provider,'submit_app',{payload:'{}'}),submit(provider)]);const r=await buildComposable({prompt:'Build'},env(provider),m.fetcher);assert.equal(r.usage.repairs,2);assert.equal(r.usage.calls,3);assert.equal(r.trace[0].tool,'unknown');
  });
  test(provider+': missing usage charges full allocations and bounds requests',async()=>{
    const a=call(provider,'inspect_app',{});delete a.usage;delete a.usageMetadata;
    const m=mock([a,a,submit(provider)]);await assert.rejects(buildComposable({prompt:'Build'},env(provider),m.fetcher),e=>{assert.equal(e.usage.calls,2);assert.equal(e.usage.remainingCompletionBudget,0);return code('AI_BUDGET_EXCEEDED')(e);});assert.equal(m.requests.length,2);
  });
  for(const status of [301,302,303,304,307,308,400,401,403,404,429,500,503])test(provider+': HTTP '+status+' sanitized with no retry/fallback',async()=>{
    const m=mock([new Response(null,{status,headers:{'Retry-After':'120',Location:'https://private.invalid'}})]);
    const expected=status<400?'AI_REDIRECT_REJECTED':status===400?'AI_REQUEST_REJECTED':[401,403].includes(status)?'AI_CREDENTIALS_REJECTED':status===404?'AI_MODEL_UNAVAILABLE':status===429?'AI_QUOTA_EXCEEDED':'AI_PROVIDER_ERROR';
    await assert.rejects(buildComposable({prompt:'Build'},env(provider),m.fetcher),e=>{assert.equal(e.usage.calls,1);assert.doesNotMatch(e.message,/fixture|private/);if(status===429)assert.equal(e.retryAfter,120);return code(expected)(e);});assert.equal(m.requests.length,1);
  });
  for(const name of ['TimeoutError','AbortError'])test(provider+': '+name+' cancels without retry',async()=>{const m=mock([new DOMException('fixture-private',name)]);await assert.rejects(buildComposable({prompt:'Build'},env(provider),m.fetcher),code('AI_TIMEOUT'));assert.equal(m.requests.length,1);});
  test(provider+': explicit cancellation before inference makes zero requests',async()=>{const c=new AbortController();c.abort();const m=mock([]);await assert.rejects(buildComposable({prompt:'Build'},env(provider),m.fetcher,{signal:c.signal}),code('AI_TIMEOUT'));assert.equal(m.requests.length,0);});
  test(provider+': oversized response rejected',async()=>{const m=mock([new Response(JSON.stringify({text:'x'.repeat(270000)}))]);await assert.rejects(buildComposable({prompt:'Build'},env(provider),m.fetcher),code('AI_RESPONSE_TOO_LARGE'));assert.equal(m.requests.length,1);});
  test(provider+': invalid JSON response rejected',async()=>{const m=mock([new Response('{')]);await assert.rejects(buildComposable({prompt:'Build'},env(provider),m.fetcher),code('AI_INVALID_RESPONSE'));});
  test(provider+': network errors contain no raw exception or credential',async()=>{const m=mock([new Error('fixture-google-only')]);await assert.rejects(buildComposable({prompt:'Build'},env(provider),m.fetcher),e=>code('AI_UNAVAILABLE')(e)&&!e.message.includes('fixture'));});
}
test('Gemini native request contract and opaque continuation preserve exact content and function ID',async()=>{
  const first=call('gemini','inspect_app',{});first.candidates[0].content.parts.unshift({text:'',thought:true,thoughtSignature:'second-opaque-signature'});
  const m=mock([first,submit('gemini')]);const r=await buildComposable({prompt:'Build'},env(),m.fetcher),a=m.requests[0],b=m.requests[1].body;
  assert.equal(a.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');assert.equal(a.init.headers['x-goog-api-key'],'fixture-google-only');assert.ok(!a.url.includes('fixture'));assert.ok(!a.body.messages);assert.equal(a.body.store,false);
  assert.deepEqual(a.body.generationConfig,{maxOutputTokens:4096,thinkingConfig:{thinkingLevel:'LOW',includeThoughts:false}});assert.equal(a.body.toolConfig.functionCallingConfig.mode,'ANY');assert.ok(a.body.tools[0].functionDeclarations.every(t=>t.parametersJsonSchema&&!t.type));
  assert.deepEqual(b.contents[1],first.candidates[0].content);assert.equal(b.contents[2].parts[0].functionResponse.id,'fc-1');assert.equal(b.contents[2].parts[0].functionResponse.name,'inspect_app');assert.doesNotMatch(JSON.stringify(r),/signature|opaque/);
});
for(const [label,data,expected] of [
  ['empty',{},'AI_INVALID_RESPONSE'],['no candidates',{candidates:[]},'AI_INVALID_RESPONSE'],['refusal',{promptFeedback:{blockReason:'SAFETY'}},'AI_REFUSED'],
  ['truncated',{candidates:[{finishReason:'MAX_TOKENS'}]},'AI_INCOMPLETE_RESPONSE'],['filtered',{candidates:[{finishReason:'SAFETY'}]},'AI_REFUSED'],
  ['prose',{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:'Done'}]}}]},'AI_INCOMPLETE_RESPONSE'],
  ['malformed args',{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name:'submit_app',args:'bad'}}]}}]},'AI_INVALID_RESPONSE']
])test('Gemini '+label+' is explicit',async()=>{const m=mock([data]);await assert.rejects(buildComposable({prompt:'Build'},env(),m.fetcher),code(expected));assert.equal(m.requests.length,1);});
test('Gemini multi-call response rejected atomically before any tool executes',async()=>{const a=submit('gemini');a.candidates[0].content.parts.push({functionCall:{name:'unsupported',args:{message:'no'}}});const m=mock([a]);await assert.rejects(buildComposable({prompt:'Build'},env(),m.fetcher),code('AI_INCOMPLETE_RESPONSE'));assert.equal(m.requests.length,1);});
test('opaque continuation stays bounded by aggregate input bytes without dropping signatures',async()=>{
  const a=call('gemini','inspect_app',{});a.candidates[0].content.parts[0].thoughtSignature='s'.repeat(120000);const m=mock([a,a,submit('gemini')]);
  await assert.rejects(buildComposable({prompt:'Build'},env(),m.fetcher),e=>{assert.equal(e.usage.calls,2);assert.ok(e.usage.inputBytes<=220000);assert.doesNotMatch(JSON.stringify(e.usage),/ssssssss/);return code('AI_BUDGET_EXCEEDED')(e);});assert.equal(m.requests.length,2);
});
test('Groq malformed tool JSON receives bounded repair feedback',async()=>{
  const a=call('groq','submit_app',{});a.choices[0].message.tool_calls[0].function.arguments='{';const m=mock([a,submit('groq')]);const r=await buildComposable({prompt:'Build'},env('groq'),m.fetcher);assert.equal(r.usage.repairs,1);assert.match(m.requests[1].init.body,/arguments are not JSON/);
});
test('cleanup rejection preserves provider error classification',async()=>{
  await assert.rejects(buildComposable({prompt:'Build'},env(),async()=>({ok:false,status:429,headers:new Headers(),body:{cancel:async()=>{throw new Error('private-cleanup');}}})),e=>code('AI_QUOTA_EXCEEDED')(e)&&!e.message.includes('private'));
});
test('Gemini gateway verifies challenge, respects request cancellation signal and publishes only draft',async()=>{
  const e=env(),sent=[];const request=new Request('https://unit.example/api/v3/generate',{method:'POST',headers:{Origin:'https://unit.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({prompt:'Build',current:null,revision:0,token:'proof'})});
  const r=await handleComposable(request,e,async(url,init)=>{sent.push({url,init});return Response.json(url.includes('siteverify')?{success:true,hostname:'unit.example',action:'generate'}:submit('gemini'));});
  assert.equal(r.status,200);const result=await r.json();assert.equal(result.status,'ready');assert.equal(sent.length,2);assert.ok(sent[0].url.includes('siteverify'));assert.ok(sent[1].url.includes('googleapis.com'));assert.doesNotMatch(JSON.stringify(result),/fixture-google|opaque-test/);
});
test('Gemini usage adds thinking once; Groq reasoning is a subset, cached tokens subset of input',()=>{
  const g=normalizeUsage('gemini',call('gemini','inspect_app',{})),q=normalizeUsage('groq',call('groq','inspect_app',{}));assert.equal(g.outputTokens+g.thinkingTokens,25);assert.equal(q.outputTokens,25);assert.equal(q.outputIncludesThinking,true);assert.equal(g.inputTokens,100);assert.equal(g.cachedTokens,10);
});
test('owner-reported Gemini usage provides a completion bound without inventing thinking counts',()=>{
  for(const [input,output,total] of [[2058,2312,4370],[4454,10,4464]]){
    const u=normalizeUsage('gemini',{usageMetadata:{promptTokenCount:input,candidatesTokenCount:output,totalTokenCount:total}});
    assert.equal(u.thinkingTokens,null);assert.equal(u.cachedTokens,null);
    assert.deepEqual(completionUsageBound(u),{tokens:output,basis:'reported-total-minus-input-upper-bound'});
  }
});
test('a missing thinking breakdown preserves room for the third repair call',async()=>{
  const invalid=dashboardExample();invalid.design.accent='invalid';
  const first=submit('gemini',invalid);first.usageMetadata={promptTokenCount:2058,candidatesTokenCount:2312,totalTokenCount:4370};
  const second=call('gemini','inspect_app',{});second.usageMetadata={promptTokenCount:4454,candidatesTokenCount:10,totalTokenCount:4464};
  const third=submit('gemini');third.usageMetadata={promptTokenCount:5000,candidatesTokenCount:2312,totalTokenCount:7312};
  const m=mock([first,second,third]),r=await buildComposable({prompt:'Build'},env(),m.fetcher);
  assert.equal(r.status,'ready');assert.equal(r.usage.calls,3);assert.equal(r.usage.repairs,1);assert.equal(r.usage.completionBudget,8192);
  assert.equal(r.usage.turns[0].chargedCompletionTokens,2312);assert.ok(r.usage.remainingCompletionBudget>0);
  assert.ok(r.usage.turns.every(t=>t.reported.thinkingTokens===null&&t.completionChargeBasis==='reported-total-minus-input-upper-bound'));
  assert.match(r.trace[0].error.message,/Invalid color/);assert.doesNotMatch(JSON.stringify(r.trace),/fixture-google|opaque-test|payload|thoughtSignature/);
});
test('total-minus-input keeps unreported thinking and tool-use tokens in the charged bound',()=>{
  const u=normalizeUsage('gemini',{usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,cachedContentTokenCount:80,toolUsePromptTokenCount:7,totalTokenCount:157}});
  assert.equal(completionUsageBound(u).tokens,57);assert.equal(u.thinkingTokens,null);assert.equal(u.inputTokens,100);
});
test('Groq reasoning remains a subset and contradictory usage cannot reduce reservations',()=>{
  const valid=normalizeUsage('groq',{usage:{prompt_tokens:100,completion_tokens:25,total_tokens:125,completion_tokens_details:{reasoning_tokens:5}}});assert.equal(completionUsageBound(valid).tokens,25);
  valid.thinkingTokens=30;assert.equal(completionUsageBound(valid).tokens,null);
});
for(const metadata of [
  {promptTokenCount:100,candidatesTokenCount:20},
  {promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:99},
  {promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:110},
  {promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:10,totalTokenCount:125},
  {promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:'120'},
  {promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:Infinity}
])test('unusable or inconsistent totals cannot reduce reserved capacity '+JSON.stringify(metadata),()=>{
  assert.equal(completionUsageBound(normalizeUsage('gemini',{usageMetadata:metadata})).tokens,null);
});
test('budget-exhausted errors retain sanitized construction failures, never provider arguments',async()=>{
  const invalid=dashboardExample();invalid.design.accent='bad';const m=mock([submit('gemini',invalid),call('gemini','inspect_app',{}),call('gemini','inspect_app',{})]);
  await assert.rejects(buildComposable({prompt:'Build'},env(),m.fetcher),e=>{assert.equal(e.code,'AI_BUDGET_EXCEEDED');assert.equal(e.trace.length,3);assert.equal(e.trace[0].tool,'submit_app');assert.match(e.trace[0].error.message,/Invalid color/);assert.doesNotMatch(JSON.stringify(e.trace),/fixture-google|opaque-test|thoughtSignature|payload/);return true;});
});
test('inspection returns transitive dependencies without interpreting literal data as references',()=>{
  const p=quizExample();p.state[0].initial[0].collection='literal-not-a-reference';
  const r=inspectStructure(p,[{section:'nodes',id:'question-text'}]),keys=r.items.map(x=>x.section+'/'+x.id);
  assert.ok(keys.includes('functions/question'));assert.ok(keys.includes('state/questions'));assert.equal(r.items.find(x=>x.section==='state').value.initial[0].collection,'literal-not-a-reference');
  assert.throws(()=>inspectStructure(p,[{section:'nodes',id:'missing'}]),/not found/);
});
test('inspection overflow rejects whole response instead of silently truncating semantics',()=>{
  const p=quizExample();p.state[0].initial=Array.from({length:6},()=>({prompt:'x'.repeat(6000)}));assert.throws(()=>inspectStructure(p,[{section:'state',id:'questions'}]),/nothing was truncated/);
});
test('stale and destructive submissions preserve authoritative input and state',()=>{
  const current=dashboardExample(),s=createConstructionSession(current,4),before=structuredClone(current);
  assert.throws(()=>s.perform('submit_app',{payload:'{}',message:'Done',revision:3}),/Stale/);
  const c=structuredClone(current.collections[0]);c.fields.shift();assert.throws(()=>s.perform('submit_app',{payload:JSON.stringify({edits:[{section:'collections',id:c.id,value:c}]}),message:'Done',revision:4}));assert.deepEqual(s.draft(),before);assert.deepEqual(current,before);assert.equal(s.revision(),4);
});
test('parsing and expression checks alone cannot finalize an untested submission',()=>{
  const p=dashboardExample();p.tests=[];const s=createConstructionSession(null);
  assert.throws(()=>s.perform('submit_app',{payload:JSON.stringify({program:p}),message:'Complete',revision:0}),/at least one supplied behavior test/);
  assert.throws(()=>s.perform('finish_build',{message:'Complete'}),/at least one supplied behavior test/);
});
test('sessions isolate credentials and continuation across concurrent users',async()=>{
  const a=mock([call('gemini','inspect_app',{}),submit('gemini')]),b=mock([submit('gemini')]);const ea=env(),eb={...env(),GEMINI_API_KEY:'fixture-user-b'};
  await Promise.all([buildComposable({prompt:'User A'},ea,a.fetcher),buildComposable({prompt:'User B'},eb,b.fetcher)]);
  assert.equal(a.requests[1].init.headers['x-goog-api-key'],'fixture-google-only');assert.equal(b.requests[0].init.headers['x-goog-api-key'],'fixture-user-b');assert.doesNotMatch(b.requests[0].init.body,/User A|opaque-test/);assert.doesNotMatch(a.requests[0].init.body,/fixture-user-b|fixture-google/);
});
test('same mocked edit uses fewer calls and input bytes than frozen Groq baseline',async()=>{
  const current=quizExample(),edits={edits:[{section:'design',id:'',value:{mode:'dark',density:'compact'}}]};
  const old=mock([call('groq','edit_app',{payload:JSON.stringify(edits)}),call('groq','finish_build',{message:'Done'})]);const optimized=mock([call('groq','submit_app',{payload:JSON.stringify(edits),message:'Done',revision:0})]);
  const a=await baseline({prompt:'Dark compact',current},env('groq'),old.fetcher),b=await buildComposable({prompt:'Dark compact',current},env('groq'),optimized.fetcher);
  assert.deepEqual(a.app,b.app);assert.equal(a.usage.calls,2);assert.equal(b.usage.calls,1);assert.ok(b.usage.inputBytes<a.usage.inputBytes);assert.ok(JSON.stringify(contextIndex(current,0)).length<JSON.stringify(current).length);
});
for(const provider of ['groq','gemini'])test(provider+': schema diagnostics guide full resubmission immediately after rejected creation',async()=>{
 const invalid=dashboardExample();delete invalid.collections[0].fields[0].options;
 const responses=[submit(provider,invalid),submit(provider)],requests=[];
 const r=await buildComposable({prompt:'Build a task board'},env(provider),async(url,init)=>{
   const body=JSON.parse(init.body);requests.push(body);
   if(requests.length===2){const feedback=provider==='gemini'?body.contents.at(-1).parts[0].functionResponse.response:JSON.parse(body.messages.at(-1).content);
     assert.equal(feedback.error.details.path,'$.collections[0].fields[0]');assert.deepEqual(feedback.error.details.missingFields,['options']);assert.equal(feedback.draftState.hasDraft,false);assert.equal(feedback.draftState.nextPayload,'program');assert.equal(feedback.budget.remainingCalls,2);assert.match(feedback.guidance,/complete corrected/);assert.match(feedback.guidance,/Do not send/);
   }
   return Response.json(responses.shift());
 });
 assert.equal(r.status,'ready');assert.equal(r.usage.calls,2);assert.equal(r.usage.repairs,1);assert.equal(r.trace[0].error.details.path,'$.collections[0].fields[0]');
});
test('edits after rejected creation report the required program envelope and preserve empty state',()=>{
 const s=createConstructionSession(null),invalid=dashboardExample();delete invalid.tests;
 assert.throws(()=>s.perform('submit_app',{payload:JSON.stringify({program:invalid}),message:'Done',revision:0}));
 assert.equal(s.draft(),null);assert.deepEqual(s.status(),{hasDraft:false,revision:0,nextPayload:'program',checksPassed:null});
 assert.throws(()=>s.perform('edit_app',{payload:JSON.stringify({edits:[{section:'design',id:'',value:{mode:'dark'}}]})}),e=>{assert.equal(e.code,'INVALID_TOOL_ARGUMENTS');assert.equal(e.details.path,'$.payload');assert.deepEqual(e.details.missingFields,['program']);return true;});assert.equal(s.draft(),null);
});
test('structurally valid failed checks retain a private draft for ID-based repair',()=>{
 const s=createConstructionSession(null),p=dashboardExample();p.tests[0].expect[0].equals=999;
 assert.throws(()=>s.perform('submit_app',{payload:JSON.stringify({program:p}),message:'Done',revision:0}),/checks failed/);
 assert.deepEqual(s.status(),{hasDraft:true,revision:1,nextPayload:'edits',checksPassed:false});
 const r=s.perform('submit_app',{payload:JSON.stringify({edits:[{section:'tests',id:'',value:dashboardExample().tests}]}),message:'Repaired',revision:1});assert.equal(r.status,'ready');
});
test('submit/inspect/edit failures report a call limit and actionable property paths',async()=>{
 const invalid=dashboardExample();delete invalid.collections[0].fields[0].options;
 const partial=dashboardExample();delete partial.collections;
 const m=mock([submit('gemini',invalid),call('gemini','inspect_app',{}),call('gemini','edit_app',{payload:JSON.stringify({program:partial})})]);
 await assert.rejects(buildComposable({prompt:'Build'},env(),m.fetcher),e=>{assert.equal(e.code,'AI_BUDGET_EXCEEDED');assert.equal(e.limit,'calls');assert.equal(e.usage.calls,3);assert.ok(e.usage.remainingCompletionBudget>0);assert.equal(e.trace[0].error.details.path,'$.collections[0].fields[0]');assert.deepEqual(e.trace[2].error.details.missingFields,['collections']);return true;});
});
for(const provider of ['groq','gemini'])test(provider+': failed behavior diagnostics survive a subsequent provider 503 without retry',async()=>{
 const p=dashboardExample();p.tests[0].expect[0].equals='private-expected-marker';const before=structuredClone(p),m=mock([submit(provider,p),new Response(null,{status:503})]);
 await assert.rejects(buildComposable({prompt:'Build'},env(provider),m.fetcher),e=>{
   assert.equal(e.code,'AI_PROVIDER_ERROR');assert.equal(e.usage.calls,2);assert.equal(e.trace.length,1);
   const failed=e.trace[0];assert.equal(failed.draftState.hasDraft,true);assert.equal(failed.draftState.revision,1);assert.equal(failed.draftChecks.passed,false);
   const check=failed.draftChecks.tests.failures[0];assert.equal(check.code,'ASSERTION_FAILED');assert.equal(check.phase,'assertion');assert.equal(check.path,'$.tests[0].expect[0]');assert.match(check.error,/Expected value did not match/);
   assert.doesNotMatch(JSON.stringify(e.trace),/private-expected-marker|opaque-test|fixture-google|fixture-groq/);return true;
 });assert.equal(m.requests.length,2);assert.deepEqual(p,before);
});
test('render preflight diagnostics survive a failed repair connection with no private program data',async()=>{
 const p=dashboardExample();p.pages[0].root.children.push({id:'broken-total',type:'stat',label:'Private design label not for trace',value:['div',1,0]});
 const m=mock([submit('gemini',p),new Error('private transport details')]);
 await assert.rejects(buildComposable({prompt:'Build'},env(),m.fetcher),e=>{assert.equal(e.code,'AI_UNAVAILABLE');assert.equal(e.trace[0].draftChecks.issues[0].node,'broken-total');assert.match(e.trace[0].draftChecks.issues[0].error,/Division by zero/);assert.doesNotMatch(JSON.stringify(e.trace),/private transport details|Private design label|opaque-test/);return true;});
});
for(const provider of ['groq','gemini'])for(const stage of ['headers','body'])test(provider+': abort ends stalled '+stage+' even when transport ignores cancellation',{timeout:1000},async()=>{
 const controller=new AbortController(),before=dashboardExample();let calls=0,cancelled=0,body;
 const pending=buildComposable({prompt:'Stall fixture',current:before},env(provider),async()=>{
   calls++;if(stage==='headers')return new Promise(()=>{});
   body=new ReadableStream({cancel(){cancelled++;return new Promise(()=>{});}});return new Response(body);
 },{signal:controller.signal});
 const timer=setTimeout(()=>controller.abort(new DOMException('private fixture timeout','TimeoutError')),10);
 try{await assert.rejects(pending,e=>{assert.equal(e.code,'AI_TIMEOUT');assert.equal(e.usage.calls,1);assert.deepEqual(e.trace,[]);assert.doesNotMatch(e.message,/private fixture/);return true;});}
 finally{clearTimeout(timer);}
 assert.equal(calls,1);assert.deepEqual(before,dashboardExample());
 if(stage==='body'){assert.equal(cancelled,1);assert.equal(body.locked,false);}
});
for(const provider of ['groq','gemini'])for(const stage of ['HTTP error','oversized body'])test(provider+': stalled cleanup cannot delay '+stage,{timeout:1000},async()=>{
 let calls=0,cancelled=0;
 const fetcher=async()=>{calls++;return stage==='HTTP error'?{ok:false,status:503,body:{cancel(){cancelled++;return new Promise(()=>{});}}}:new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(270000));},cancel(){cancelled++;return new Promise(()=>{});}}));};
 await assert.rejects(buildComposable({prompt:'Cleanup fixture'},env(provider),fetcher),code(stage==='HTTP error'?'AI_PROVIDER_ERROR':'AI_RESPONSE_TOO_LARGE'));
 assert.equal(calls,1);assert.equal(cancelled,1);
});
test('an already cancelled transport sends zero requests even with a private abort reason',async()=>{
 const controller=new AbortController();controller.abort('private cancellation reason');let calls=0;
 await assert.rejects(sendAdapterRequest({url:'https://fixture.invalid',init:{}},()=>{calls++;},controller.signal),e=>code('AI_TIMEOUT')(e)&&!e.message.includes('private'));
 assert.equal(calls,0);
});
