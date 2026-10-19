/** Local runtime acceptance ONLY. Never referenced by production wrangler.jsonc. */
import {buildComposable,BuildError} from '../ai/composable-agent.mjs';
import {handleRequest} from '../worker-v3.mjs';
import {quizExample} from '../docs/v3/examples.mjs';
const check=(value,message)=>{if(!value)throw new Error(message);};
export default {async fetch(){
  const checks=[];
  try{
    for(const provider of ['groq','gemini']){
      const env={AI_PROVIDER:'groq',AI_MODEL:'openai/gpt-oss-120b',V3_AI_PROVIDER:provider,GROQ_API_KEY:'runtime-fixture-groq',GEMINI_API_KEY:'runtime-fixture-google',PUBLIC_AI_ENABLED:'true',COMPOSABLE_AI_ENABLED:'true',TURNSTILE_SITE_KEY:'public-fixture',TURNSTILE_SECRET:'fixture',GENERATION_LIMITER:{limit:async()=>({success:true})},GLOBAL_LIMITER:{limit:async()=>({success:true})}};
      const response=(name,args)=>provider==='gemini'?{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name,args,id:'fc-runtime'},thoughtSignature:'opaque-runtime-fixture'}]}}]}:{choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'fc-runtime',type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]};
      let calls=0;
      const r=await buildComposable({prompt:'Runtime fixture'},env,async(url,init)=>{
        check(init.redirect==='manual','manual redirect');check(init.signal instanceof AbortSignal,'signal');calls++;
        if(calls===2&&provider==='gemini'){const body=JSON.parse(init.body);check(body.contents[1].parts[0].thoughtSignature==='opaque-runtime-fixture','signature');check(body.contents[2].parts[0].functionResponse.id==='fc-runtime','association');}
        return Response.json(calls===1?response('inspect_app',{}):response('submit_app',{payload:JSON.stringify({program:quizExample()}),message:'Complete fixture.',revision:0}));
      });
      check(r.status==='ready'&&r.usage.calls===2,'construction');checks.push(provider+': construction, continuation, signal, structuredClone and bounds');
      const config=await (await handleRequest(new Request('https://runtime.example/api/v3/config'),env)).json();check(config.provider===provider&&!JSON.stringify(config).includes('runtime-fixture'),'public config');
      const old=await (await handleRequest(new Request('https://runtime.example/api/config'),env)).json();check(old.provider==='groq','legacy isolation');checks.push(provider+': v3 routing and legacy isolation');
      const incoming=new Request('https://runtime.example/api/v3/generate',{method:'POST',headers:{Origin:'https://runtime.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({prompt:'Full gateway fixture',current:null,revision:0,token:'proof'})});
      const generated=await handleRequest(incoming,env,async(url,init)=>{check(init.signal instanceof AbortSignal,'gateway signal');return Response.json(url.includes('siteverify')?{success:true,hostname:'runtime.example',action:'generate'}:response('submit_app',{payload:JSON.stringify({program:quizExample()}),message:'Complete.',revision:0}));});
      check(generated.status===200&&(await generated.json()).status==='ready','full gateway');checks.push(provider+': full Turnstile/generation route with request signal');
      if(provider==='gemini'){
        let repairs=0;
        const fixed=await buildComposable({prompt:'Missing thinking breakdown fixture'},env,async()=>{
          repairs++;const r=repairs===1?response('submit_app',{payload:'{',message:'Invalid fixture.',revision:0}):repairs===2?response('inspect_app',{}):response('submit_app',{payload:JSON.stringify({program:quizExample()}),message:'Repaired fixture.',revision:0});
          r.usageMetadata={promptTokenCount:2058,candidatesTokenCount:2312,totalTokenCount:4370};return Response.json(r);
        });
        check(fixed.status==='ready'&&fixed.usage.calls===3&&fixed.usage.repairs===1,'three-call repair');check(fixed.usage.turns[0].reported.thinkingTokens===null&&fixed.usage.turns[0].chargedCompletionTokens===2312,'conservative charge');check(fixed.trace[0].error.message==='Tool payload is not JSON.','sanitized repair trace');checks.push('gemini: missing thinking breakdown permits bounded third-call repair and local diagnostics');
      }
      let schemaCalls=0;const invalid=quizExample();delete invalid.tests[0].data;
      const repaired=await buildComposable({prompt:'Strict schema repair fixture'},env,async(url,init)=>{
        schemaCalls++;
        if(schemaCalls===2){const body=JSON.parse(init.body),feedback=provider==='gemini'?body.contents.at(-1).parts[0].functionResponse.response:JSON.parse(body.messages.at(-1).content);check(feedback.error.details.path==='$.tests[0]','schema path');check(feedback.error.details.missingFields[0]==='data','missing key');check(feedback.draftState.hasDraft===false&&feedback.draftState.nextPayload==='program','rejected draft state');check(feedback.budget.remainingCalls===2,'repair capacity');}
        return Response.json(response('submit_app',{payload:JSON.stringify({program:schemaCalls===1?invalid:quizExample()}),message:'Synthetic schema repair.',revision:0}));
      });
      check(repaired.status==='ready'&&repaired.usage.repairs===1&&schemaCalls===2,'schema repaired');checks.push(provider+': exact schema path, draft state, call budget and complete resubmission');
      let failedCalls=0;const failing=quizExample();failing.tests[0].expect[0].equals=999;
      try{
        await buildComposable({prompt:'Failed check followed by unavailable provider'},env,async()=>{
          failedCalls++;return failedCalls===1?Response.json(response('submit_app',{payload:JSON.stringify({program:failing}),message:'Synthetic failing check.',revision:0})):new Response(null,{status:503});
        });
        throw new Error('accepted failed check');
      }catch(e){
        check(e instanceof BuildError&&e.code==='AI_PROVIDER_ERROR'&&failedCalls===2,'503 without retry');
        check(e.trace[0].revision===1&&e.trace[0].draftState.hasDraft===true,'private draft retained');
        check(e.trace[0].draftChecks.tests.failures[0].path==='$.tests[0].expect[0]'&&e.trace[0].draftChecks.tests.failures[0].code==='ASSERTION_FAILED','failed check evidence');
        check(!JSON.stringify(e.trace).includes('runtime-fixture'),'private metadata absent');
      }
      checks.push(provider+': failed behavior evidence survives provider 503 without retry');
      for(const status of [302,400,401,403,404,429,500]){let n=0;try{await buildComposable({prompt:'Failure fixture'},env,async()=>{n++;return new Response(null,{status});});throw new Error('accepted failure');}catch(e){check(e instanceof BuildError&&n===1,'no retry');check(!e.message.includes('runtime-fixture'),'sanitized');}checks.push(provider+': HTTP '+status);}
    }
    return Response.json({passed:true,runtime:'actual workerd; synthetic inference only',checks});
  }catch(e){return Response.json({passed:false,error:e.message,checks},{status:500});}
}};
