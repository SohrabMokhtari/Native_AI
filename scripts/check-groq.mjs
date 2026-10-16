/** Maintainer-only acceptance probe. Ordinary app builders never need this script. */
import {generateApp,ProviderError,GROQ_MODEL} from '../ai/provider.mjs';
import {starter,compatible,validateData} from '../docs/core.mjs';

const args=process.argv.slice(2);
const caseName=args.find(a=>a.startsWith('--case='))?.slice(7)||'create';
if(args.some(a=>a!=='--live'&&!/^--case=(create|edit|unsupported)$/.test(a))){
  console.error('Usage: node scripts/check-groq.mjs [--live] [--case=create|edit|unsupported]');process.exitCode=1;
}else if(!args.includes('--live')){
  console.log(`No API request was made. Add --live to run ONE fictional ${caseName} acceptance probe using GROQ_API_KEY from the environment. Uses provider quota; no retries. Not a browser or deployment test.`);
}else if(!process.env.GROQ_API_KEY?.trim()){
  console.error('Missing GROQ_API_KEY. Set it in your private environment or use --env-file=.dev.vars. Never put a key in a command argument, GitHub source, or browser.');process.exitCode=1;
}else{
  const current=caseName==='edit'?starter('tasks','acceptance-task-app'):null;
  const prompts={create:'Build a simple local task board named My Tasks. Include a Task text field and a Status select field with To do, In progress, Done. Use a board view grouped by Status.',edit:'Keep the existing task app and all fields. Change its theme to teal.',unsupported:'Build a system with real password-authenticated accounts and a shared cloud database synchronized between users. These are required, not a demo.'};
  const started=performance.now();
  try{
    const result=await generateApp({prompt:prompts[caseName],current},{AI_PROVIDER:'groq',AI_MODEL:GROQ_MODEL,GROQ_API_KEY:process.env.GROQ_API_KEY});
    let passed=result.status===(caseName==='unsupported'?'unsupported':'ready');
    if(passed&&caseName==='create'){
      passed=result.app.views.some(v=>v.layout==='board'&&result.app.collections.find(c=>c.id===v.collection)?.fields.some(f=>f.id===v.groupField&&['To do','In progress','Done'].every(o=>f.options.includes(o))));
    }
    if(passed&&caseName==='edit'){
      const data={items:[{id:'fixture',values:{title:'Preserve fictional record',notes:'',status:'To do',due:''}}]};
      compatible(current,result.app,data);
      passed=result.app.theme==='teal'&&validateData(result.app,data).items[0].values.title==='Preserve fictional record';
    }
    console.log(JSON.stringify({case:caseName,provider:'groq',model:GROQ_MODEL,status:result.status,acceptance:passed?'PASS':'FAIL',elapsedMs:Math.round(performance.now()-started),note:'One live model probe; no browser, Turnstile, or deployment verification.'},null,2));
    if(!passed)process.exitCode=1;
  }catch(error){
    console.error(error instanceof ProviderError?`${error.code}: ${error.message}`:'Acceptance check failed. No app was saved.');process.exitCode=1;
  }
}
