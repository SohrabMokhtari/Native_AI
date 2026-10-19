import test from 'node:test';
import assert from 'node:assert/strict';
import {createKernel,validateProgram,createMachine,snapshotFor,compatible,applyEdits,runTests} from '../docs/v3/kernel.mjs';
import {dashboardExample,quizExample} from '../docs/v3/examples.mjs';
import {preflight} from '../docs/v3/checks.mjs';
import {composableHTML} from '../docs/v3/export.mjs';
import {migrateLegacy} from '../docs/v3/migrate.mjs';
import {starter} from '../docs/core.mjs';
const clone=structuredClone;
const task=(id,title,status='To do',due='')=>({id,values:{title,status,due,notes:''}});
const expr=(x)=>createMachine(dashboardExample()).evaluate(x);
for(const [name,factory] of [['dashboard',dashboardExample],['quiz',quizExample]]){
 test(`v3 ${name}: validates and passes authored fixture tests`,()=>{assert.ok(validateProgram(factory()));assert.ok(runTests(factory()).passed);assert.ok(preflight(factory()).passed);});
 test(`v3 ${name}: export is self-contained and contains no credentials or AI endpoint`,()=>{const html=composableHTML(factory());assert.match(html,/connect-src 'none'/);assert.ok(!/GROQ_API_KEY|api\.groq\.com|<script[^>]+src=|\bimport\s*\{/.test(html));assert.ok(html.includes('function createKernel()'));});
}
test('v3 factory works without module-level dependencies',()=>{const K=createKernel();assert.ok(K.createMachine(quizExample()));});
for(const [name,change] of [
 ['unknown source',p=>p.code='alert(1)'],['raw CSS',p=>p.pages[0].root.style.css='background:url(x)'],['arbitrary color',p=>p.design.accent='url(https://example.com)'],
 ['unknown UI',p=>p.pages[0].root.type='script'],['unknown action',p=>p.actions.push({id:'evil',steps:[{op:'fetch',url:'https://example.com'}]})],
 ['state reference',p=>p.pages[0].root.children[0].text=['state','missing']],['missing action',p=>p.pages[0].root.children.push({id:'bad',type:'button',text:'Click',action:'missing'})],
 ['missing function',p=>p.pages[0].root.children[0].text=['call','missing']],['bad arity',p=>p.pages[0].root.children[0].text=['add',1]],['raw expression object',p=>p.pages[0].root.children[0].text={js:'alert(1)'}],
 ['duplicate node',p=>p.pages[0].root.children.push(clone(p.pages[0].root.children[0]))],['unknown style',p=>p.pages[0].root.style={position:'fixed'}],
 ['type mismatch',p=>p.state.push({id:'counter',type:'number',initial:'zero'})],['unsafe property',p=>p.state.push({id:'stuff',type:'object',initial:JSON.parse('{"__proto__":{}}')})],
 ['recursive function',p=>p.functions.push({id:'loop',params:[],returns:'any',body:['call','loop']})],['recursive action',p=>p.actions.push({id:'loop',steps:[{op:'call',action:'loop'}]})],
 ['bad board grouping',p=>p.pages[0].root.children.at(-1).groupField='title'],['no label',p=>p.pages[0].root.children.push({id:'bad-input',type:'input',action:'none'})],
 ['removed schema key',p=>delete p.tests],['infinite',p=>p.state.push({id:'infinite',type:'number',initial:Infinity})]
])test(`v3 rejects ${name}`,()=>{const p=dashboardExample();change(p);assert.throws(()=>validateProgram(p));});
for(const [name,x,value]of [
 ['arithmetic',['mul',['add',2,3],4],20],['lazy if',['if',false,['div',1,0],7],7],['lazy and',['and',false,['eq',['div',1,0],1]],false],['lazy or',['or',true,['eq',['div',1,0],1]],true],
 ['map and sum',['sum',['map',{lit:[{n:2},{n:3}]},['row','n']]],5],['empty list',['count',{lit:[]}],0],['text concat',['concat','Done: ',3],'Done: 3'],['get',['get',{lit:{n:4}},'n'],4]
])test(`v3 evaluates ${name}`,()=>assert.deepEqual(expr(x),value));
for(const x of [['div',1,0],['add','2',3],['and',1,true],['get',{lit:{}},'missing'],['get',{lit:{}},'__proto__'],['lt','3',2]])test('v3 rejects runtime type/access error '+JSON.stringify(x),()=>assert.throws(()=>expr(x)));
test('v3 supports bounded iteration and function reuse',()=>{const p=quizExample();p.state.push({id:'total',type:'number',initial:0});p.actions.push({id:'accumulate',steps:[{op:'each',items:{lit:[{n:2},{n:4},{n:6}]},do:[{op:'set',state:'total',value:['add',['state','total'],['row','n']]}]}]});const m=createMachine(p);m.dispatch('accumulate');assert.equal(m.evaluate(['state','total']),12);});
test('v3 execution budget stops combinatorial work and rolls state back',()=>{const p=quizExample();const xs={lit:Array(50).fill({n:1})};p.actions.push({id:'large',steps:[{op:'each',items:xs,do:[{op:'each',items:xs,do:[{op:'each',items:xs,do:[{op:'set',state:'score',value:['add',['state','score'],1]}]}]}]}]});const m=createMachine(p),before=m.snapshot();assert.throws(()=>m.dispatch('large'),/budget/);assert.deepEqual(m.snapshot(),before);});
test('v3 failed step rolls back earlier successful steps',()=>{const p=quizExample();p.actions.push({id:'bad',steps:[{op:'set',state:'score',value:99},{op:'set',state:'index',value:['div',1,0]}]});const m=createMachine(p);assert.throws(()=>m.dispatch('bad'));assert.equal(m.evaluate(['state','score']),0);});
test('v3 storage commit failure rolls machine state back',()=>{const m=createMachine(quizExample(),null,{onCommit:()=>{throw new Error('Storage full');}});assert.throws(()=>m.dispatch('choose',{value:'Mars'}));assert.equal(m.evaluate(['state','choice']),'');});
test('v3 snapshots cannot mutate machine state by reference',()=>{const m=createMachine(quizExample());m.snapshot().state.score=50;assert.equal(m.evaluate(['state','score']),0);});
test('v3 data can create, update and delete without source generation',()=>{const m=createMachine(dashboardExample());m.putRecord('tasks',{title:'Test',status:'To do'});let s=m.snapshot();const id=s.data.tasks[0].id;m.putRecord('tasks',{title:'Test',status:'Done'},id);assert.equal(m.evaluate(['call','completion']),100);m.deleteRecord('tasks',id);assert.equal(m.snapshot().data.tasks.length,0);});
test('v3 rejects malformed records without overwriting',()=>{const m=createMachine(dashboardExample());assert.throws(()=>m.putRecord('tasks',{title:'Test',status:'Invented'}));assert.equal(m.snapshot().data.tasks.length,0);});
test('v3 complete quiz correct and incorrect branches, next, scoring, restart',()=>{const m=createMachine(quizExample());for(const answer of ['Mars','36','Red']){m.dispatch('choose',{value:answer});m.dispatch('answer');m.dispatch('answer');m.dispatch('next');}assert.equal(m.evaluate(['state','score']),2);assert.equal(m.evaluate(['call','finished']),true);m.dispatch('next');assert.equal(m.evaluate(['state','index']),3);m.dispatch('restart');assert.equal(m.evaluate(['state','score']),0);});
test('v3 snapshots preserve quiz progress on re-instantiation',()=>{const p=quizExample(),m=createMachine(p);m.dispatch('choose',{value:'Mars'});m.dispatch('answer');const restored=createMachine(p,JSON.parse(JSON.stringify(m.snapshot())));assert.equal(restored.evaluate(['state','score']),1);assert.equal(restored.evaluate(['state','answered']),true);});
test('v3 completion and overdue expectations use independent test fixtures',()=>{const p=dashboardExample(),s=snapshotFor(p);s.data.tasks=[task('a','Past','To do','2026-01-01'),task('b','Completed','Done','2026-01-01'),task('c','Future','In progress','2027-01-01')];const m=createMachine(p,s,{today:'2026-10-16'});assert.equal(m.evaluate(['call','completion']),33);const rule=p.pages[0].root.children.at(-1).highlight;assert.deepEqual(s.data.tasks.map(r=>m.evaluate(rule,{row:r.values})),[true,false,false]);});
test('v3 migrated task data preserves identity and values',()=>{const old=starter('tasks','old-app'),data={items:[{id:'saved',values:{title:'Keep me',notes:'',status:'In progress',due:''}}]};const original=clone({old,data});const next=migrateLegacy(old,data);assert.equal(next.app.id,old.id);assert.deepEqual(next.snapshot.data,data);assert.deepEqual({old,data},original);assert.ok(preflight(next.app).passed);});
test('v3 design-only patch preserves records and running state',()=>{const old=quizExample(),m=createMachine(old);m.dispatch('choose',{value:'Mars'});m.dispatch('answer');const next=applyEdits(old,[{section:'design',id:'',value:{mode:'dark',navigation:'sidebar'}},{section:'meta',id:'',value:{name:'Updated quiz'}}],4,4);assert.equal(compatible(old,next,m.snapshot()).state.score,1);assert.equal(old.design.mode,'light');});
test('v3 stale patch rejected before edits',()=>assert.throws(()=>applyEdits(quizExample(),[{section:'design',id:'',value:{mode:'dark'}}],1,2),/Stale/));
for(const [name,change]of [['state',p=>p.state.pop()],['type',p=>p.state.find(s=>s.id==='score').type='text'],['ID',p=>p.id='different']])test(`v3 protects ${name} in migrations`,()=>{const old=quizExample(),next=clone(old);change(next);assert.throws(()=>compatible(old,next,snapshotFor(old)));});
test('v3 populated-field retyping blocked',()=>{const old=dashboardExample(),next=clone(old);next.collections[0].fields[0].type='longtext';assert.throws(()=>compatible(old,next,snapshotFor(old)));});
test('v3 new required field blocked with populated data',()=>{const old=dashboardExample(),s=snapshotFor(old);s.data.tasks=[task('a','Saved')];const next=clone(old);next.collections[0].fields.push({id:'new',label:'New',type:'text',required:true,options:[]});assert.throws(()=>compatible(old,next,s));});
test('v3 invalid edit batch is atomic',()=>{const old=dashboardExample(),copy=clone(old);assert.throws(()=>applyEdits(old,[{section:'meta',id:'',value:{name:'Oops'}},{section:'design',id:'',value:{mode:'unsupported'}}],0,0));assert.deepEqual(old,copy);});
test('v3 preflight reports hidden expression errors only when reachable',()=>{const p=quizExample(),n={id:'bad-node',type:'text',text:['div',1,0],visible:false};p.pages[0].root.children.push(n);assert.equal(preflight(p).passed,true);n.visible=true;assert.equal(preflight(p).passed,false);});
test('v3 no tests is an explicit warning, not a claimed functional pass',()=>{const p=dashboardExample();p.tests=[];const r=preflight(p);assert.equal(r.tests.total,0);assert.equal(r.warnings.length,1);});
test('v3 failing supplied assertion blocks readiness',()=>{const p=quizExample();p.tests[0].expect[0].equals=42;assert.equal(preflight(p).passed,false);});
test('v3 export escapes model HTML and script terminators',()=>{const p=dashboardExample();p.name='</script><script>alert(1)</script>';p.pages[0].root.children[0].text='<img src=x onerror=alert(1)>';const html=composableHTML(p);assert.ok(!html.includes('</script><script>alert(1)</script>'));assert.ok(html.includes('\\u003cimg'));});
test('v3 export never embeds a saved snapshot',()=>{const p=dashboardExample(),s=snapshotFor(p);s.data.tasks=[task('private','private-record-marker')];assert.ok(!composableHTML(p).includes('private-record-marker'));});
test('v3 composes dynamic list and object values',()=>{assert.deepEqual(expr(['list',['object','x',['add',2,3]],['object','x',6]]),[{x:5},{x:6}]);assert.deepEqual(expr(['merge',{lit:{x:1}},['object','y',2]]),{x:1,y:2});assert.deepEqual(expr(['append',{lit:[1,2]},3]),[1,2,3]);});
test('v3 map can return and merge the full item',()=>assert.deepEqual(expr(['map',{lit:[{n:2},{n:3}]},['merge',['item'],['object','double',['mul',['row','n'],2]]]]),[{n:2,double:4},{n:3,double:6}]));
test('v3 object construction cannot use unsafe keys',()=>assert.throws(()=>expr(['object','__proto__',1])));
for(const [name,factory,change,path,missing,unknown] of [
 ['field options',dashboardExample,p=>delete p.collections[0].fields[0].options,'$.collections[0].fields[0]',['options'],[]],
 ['field required',dashboardExample,p=>delete p.collections[0].fields[1].required,'$.collections[0].fields[1]',['required'],[]],
 ['design width',dashboardExample,p=>delete p.design.width,'$.design',['width'],[]],
 ['node type',dashboardExample,p=>delete p.pages[0].root.type,'$.pages[0].root',['type'],[]],
 ['test fixture maps',quizExample,p=>{delete p.tests[0].state;delete p.tests[0].data;},'$.tests[0]',['state','data'],[]],
 ['test event',quizExample,p=>delete p.tests[0].actions[0].event,'$.tests[0].actions[0]',['event'],[]],
 ['test equals',quizExample,p=>delete p.tests[0].expect[0].equals,'$.tests[0].expect[0]',['equals'],[]],
 ['action value',quizExample,p=>delete p.actions[0].steps[0].value,'$.actions[0].steps[0]',['value'],[]],
 ['function parameter type',dashboardExample,p=>delete p.functions[1].params[0].type,'$.functions[1].params[0]',['type'],[]],
 ['unknown style',dashboardExample,p=>p.pages[0].root.style.css='private-diagnostic-value','$.pages[0].root.style',[],['css']],
 ['unknown program source',dashboardExample,p=>p.script='private-diagnostic-value','$',[],['script']],
 ['malformed literal expression',dashboardExample,p=>p.pages[0].root.children[0].text={literal:'private-diagnostic-value'},'$.pages[0].root.children[0].text',['lit'],['literal']]
])test('v3 strict schema diagnoses '+name+' without reflecting values',()=>{
 const p=factory();change(p);assert.throws(()=>validateProgram(p),e=>{assert.equal(e.code,'INVALID_PROGRAM_SCHEMA');assert.equal(e.details.path,path);assert.deepEqual(e.details.missingFields,missing);assert.deepEqual(e.details.unknownFields,unknown);assert.ok(missing.every(k=>e.details.requiredFields.includes(k)));assert.doesNotMatch(JSON.stringify({message:e.message,details:e.details}),/private-diagnostic-value/);return true;});
});
test('v3 schema diagnostic paths are isolated per validation and kernel instance',()=>{
 const a=dashboardExample(),b=quizExample();delete a.design.mode;delete b.tests[0].expect[0].equals;
 for(const [K,p,path]of [[createKernel(),a,'$.design'],[createKernel(),b,'$.tests[0].expect[0]'],[createKernel(),a,'$.design']])assert.throws(()=>K.validateProgram(p),e=>e.details.path===path);
});
test('v3 schema diagnostic output bounds unknown names and redacts credential-shaped keys',()=>{
 const p=dashboardExample();p['AIza'+'x'.repeat(35)]='private-diagnostic-value';for(let n=0;n<12;n++)p['extra'+n]='private-diagnostic-value';
 assert.throws(()=>validateProgram(p),e=>{assert.equal(e.details.unknownFieldCount,13);assert.equal(e.details.unknownFields.length,8);assert.equal(e.details.unknownFields[0],'[redacted property]');assert.doesNotMatch(JSON.stringify({message:e.message,details:e.details}),/AIzax|private-diagnostic-value/);return true;});
});
for(const [path,change]of [['$.design',p=>p.design=null],['$.pages[0].root',p=>p.pages[0].root=null],['$.pages[0].root.style',p=>p.pages[0].root.style=null]])test('v3 malformed object retains its parent path '+path,()=>{
 const p=dashboardExample();change(p);assert.throws(()=>validateProgram(p),e=>e.code==='INVALID_PROGRAM_SCHEMA'&&e.details.path===path);
});
for(const [name,change,phase,path,code,message]of [
 ['assertion mismatch',p=>p.tests[0].expect[0].equals='private-expected-value','assertion','$.tests[0].expect[0]','ASSERTION_FAILED',/Expected value did not match/],
 ['expression execution',p=>p.tests[0].expect[0].value=['div',1,0],'assertion','$.tests[0].expect[0]','EXECUTION_FAILED',/Division by zero/],
 ['fixture setup',p=>p.tests[0].state.score='private-fixture-value','setup','$.tests[0]','EXECUTION_FAILED',/declared type/],
 ['action execution',p=>{p.actions.push({id:'bad-test-action',steps:[{op:'set',state:'score',value:['div',1,0]}]});p.tests[0].actions=[{id:'bad-test-action',event:{}}];},'action','$.tests[0].actions[0]','EXECUTION_FAILED',/Division by zero/]
])test('v3 supplied test failure identifies '+name+' without revealing fixture values',()=>{
 const p=quizExample();change(p);const before=clone(p),r=runTests(p).results[0];assert.equal(r.passed,false);assert.equal(r.phase,phase);assert.equal(r.path,path);assert.equal(r.code,code);assert.match(r.error,message);assert.doesNotMatch(JSON.stringify(r),/private-expected-value|private-fixture-value/);assert.deepEqual(p,before);
});
test('v3 preflight names the innermost failing node without evaluating hidden subtrees',()=>{
 const p=quizExample();p.pages[0].root.children.push({id:'broken-stat',type:'stat',label:'Broken fixture',value:['div',1,0]});
 const r=preflight(p);assert.equal(r.passed,false);assert.equal(r.issues[0].node,'broken-stat');assert.equal(r.issues[0].page,'play');assert.match(r.issues[0].error,/Division by zero/);
 p.pages[0].root.children.at(-1).visible=false;assert.equal(preflight(p).passed,true);
});
