/** Explicit authored fixtures. These do not impersonate live model output. */
import {validateProgram} from './kernel.mjs';
const lit=v=>({lit:v});
const field=(id,label,type='text',required=false,options=[])=>({id,label,type,required,options});
const base=(id,name)=>({format:'native-ai/3',id,name,description:'',design:{mode:'dark',accent:'#62c9b2',density:'compact',font:'system',radius:14,navigation:'sidebar',width:1280},collections:[],state:[],functions:[],actions:[],pages:[],tests:[]});
export function dashboardExample() {
  const p=base('lab-planner','My Planner');p.description='A quieter place to focus on what matters.';
  p.collections=[{id:'tasks',name:'Tasks',fields:[field('title','Task','text',true),field('status','Status','select',true,['To do','In progress','Done']),field('due','Due date','date'),field('notes','Notes','longtext')]}];
  const total=['count',['rows','tasks']];
  const done=['count',['filter',['rows','tasks'],['eq',['row','status'],'Done']]];
  p.functions=[{id:'completion',params:[],returns:'number',body:['if',['eq',total,0],0,['round',['mul',100,['div',done,total]]]]},
    {id:'overdue',params:[{id:'task',type:'object'}],returns:'boolean',body:['and',['neq',['get',['arg','task'],'status'],'Done'],['neq',['get',['arg','task'],'due'],''],['lt',['get',['arg','task'],'due'],['today']]]}];
  const highlight=['and',['neq',['row','status'],'Done'],['neq',['row','due'],''],['lt',['row','due'],['today']]];
  p.pages=[{id:'overview',title:'Overview',root:{id:'dashboard',type:'stack',style:{gap:24},children:[
    {id:'eyebrow',type:'text',text:'MAKE SPACE FOR YOUR BEST WORK',style:{tone:'accent',size:12,weight:700}},
    {id:'welcome',type:'heading',text:'A little clarity. A lot of possibility.',style:{size:36}},
    {id:'metrics',type:'grid',style:{columns:3,gap:16},children:[
      {id:'total-card',type:'stat',label:'In your workspace',value:['count',['rows','tasks']]},
      {id:'active-card',type:'stat',label:'Still in motion',value:['count',['filter',['rows','tasks'],['neq',['row','status'],'Done']]]},
      {id:'done-card',type:'stat',label:'Completion',value:['concat',['call','completion'],'%']}
    ]},
    {id:'completion-bar',type:'progress',label:'Your progress',value:['call','completion'],max:100},
    {id:'board-heading',type:'heading',text:'Your week, in view',style:{size:22}},
    {id:'tasks-board',type:'collection',collection:'tasks',layout:'board',titleField:'title',groupField:'status',highlight}
  ]}},
  {id:'focus',title:'Focus',root:{id:'focus-root',type:'stack',children:[{id:'focus-title',type:'heading',text:'One thing at a time.'},{id:'focus-description',type:'text',text:'Unfinished work only. Overdue tasks have a red border.',style:{tone:'muted'}},{id:'focus-tasks',type:'collection',collection:'tasks',layout:'cards',titleField:'title',filter:['neq',['row','status'],'Done'],highlight}]}},
  {id:'list',title:'Task list',root:{id:'list-root',type:'stack',children:[{id:'list-title',type:'heading',text:'The full picture'},{id:'list-tasks',type:'collection',collection:'tasks',layout:'table',titleField:'title'}]}}];
  p.tests=[{name:'Empty completion is zero',state:{},data:{},actions:[],expect:[{value:['call','completion'],equals:0}]},
    {name:'Completed task is never overdue',state:{},data:{},actions:[],expect:[{value:['call','overdue',lit({title:'Finished',status:'Done',due:'2026-01-01',notes:''})],equals:false}]},
    {name:'Unfinished past task is overdue',state:{},data:{},actions:[],expect:[{value:['call','overdue',lit({title:'Waiting',status:'To do',due:'2026-01-01',notes:''})],equals:true}]}];
  return validateProgram(p);
}
export function quizExample() {
  const p=base('lab-quiz','Curious minds');p.description='A tiny challenge. A fresh perspective.';p.design={...p.design,mode:'light',accent:'#6545bb',navigation:'top',density:'comfortable',width:900};
  p.state=[{id:'questions',type:'list',initial:[{prompt:'Which planet is known as the Red Planet?',choices:['Mars','Venus','Saturn'],answer:'Mars'},{prompt:'What is 7 multiplied by 6?',choices:['36','42','48'],answer:'42'},{prompt:'Which is a primary color of light?',choices:['Red','Brown','Orange'],answer:'Red'}]},
    {id:'index',type:'number',initial:0},{id:'score',type:'number',initial:0},{id:'choice',type:'text',initial:''},{id:'answered',type:'boolean',initial:false},{id:'feedback',type:'text',initial:''}];
  p.functions=[{id:'finished',params:[],returns:'boolean',body:['gte',['state','index'],['count',['state','questions']]]},
    {id:'question',params:[],returns:'object',body:['get',['state','questions'],['state','index']]}];
  const correct=['eq',['state','choice'],['get',['call','question'],'answer']];
  p.actions=[{id:'choose',steps:[{op:'set',state:'choice',value:['event','value']}]},
    {id:'answer',steps:[{op:'if',when:['and',['not',['call','finished']],['not',['state','answered']],['neq',['state','choice'],'']],then:[{op:'set',state:'score',value:['add',['state','score'],['if',correct,1,0]]},{op:'set',state:'feedback',value:['if',correct,'Exactly right. Nicely done!',['concat','Not quite. The answer is ',['get',['call','question'],'answer'],'.']]},{op:'set',state:'answered',value:true}],else:[]}]},
    {id:'next',steps:[{op:'if',when:['and',['state','answered'],['not',['call','finished']]],then:[{op:'set',state:'index',value:['add',['state','index'],1]},{op:'set',state:'choice',value:''},{op:'set',state:'answered',value:false},{op:'set',state:'feedback',value:''}],else:[]}]},
    {id:'restart',steps:[{op:'set',state:'index',value:0},{op:'set',state:'score',value:0},{op:'set',state:'choice',value:''},{op:'set',state:'answered',value:false},{op:'set',state:'feedback',value:''}]}];
  p.pages=[{id:'play',title:'Daily challenge',root:{id:'quiz-root',type:'stack',style:{gap:24,padding:16},children:[
    {id:'quiz-kicker',type:'badge',text:'3 QUESTIONS · NO PRESSURE',style:{tone:'accent'}},
    {id:'quiz-title',type:'heading',text:'Give your curiosity a little room.',style:{size:36}},
    {id:'quiz-progress',type:'progress',label:'Quiz progress',value:['state','index'],max:['count',['state','questions']]},
    {id:'question-card',type:'card',visible:['not',['call','finished']],style:{padding:24,gap:20},children:[
      {id:'question-count',type:'text',text:['concat','Question ',['add',['state','index'],1],' of ',['count',['state','questions']]],style:{tone:'muted'}},
      {id:'question-text',type:'heading',text:['get',['call','question'],'prompt'],style:{size:24}},
      {id:'choice-input',type:'select',label:'Your answer',value:['state','choice'],options:['get',['call','question'],'choices'],action:'choose',disabled:['state','answered']},
      {id:'submit-answer',type:'button',text:'Check my answer',action:'answer',disabled:['or',['state','answered'],['eq',['state','choice'],'']]},
      {id:'feedback-text',type:'text',text:['state','feedback'],visible:['state','answered'],style:{weight:600}},
      {id:'next-question',type:'button',text:'Continue →',action:'next',visible:['state','answered']}
    ]},
    {id:'results-card',type:'card',visible:['call','finished'],style:{padding:32,gap:20},children:[{id:'results-title',type:'heading',text:'A little wiser already.'},{id:'results-score',type:'stat',label:'Your score',value:['concat',['state','score'],' / ',['count',['state','questions']]]},{id:'restart-quiz',type:'button',text:'Try again',action:'restart'}]}
  ]}}];
  p.tests=[{name:'Correct answer adds one point',state:{},data:{},actions:[{id:'choose',event:{value:'Mars'}},{id:'answer',event:{}}],expect:[{value:['state','score'],equals:1},{value:['state','answered'],equals:true}]},
    {name:'Cannot score twice on one question',state:{},data:{},actions:[{id:'choose',event:{value:'Mars'}},{id:'answer',event:{}},{id:'answer',event:{}}],expect:[{value:['state','score'],equals:1}]},
    {name:'Incorrect answer gives no point',state:{},data:{},actions:[{id:'choose',event:{value:'Venus'}},{id:'answer',event:{}}],expect:[{value:['state','score'],equals:0}]},
    {name:'Restart clears progress',state:{index:3,score:2},data:{},actions:[{id:'restart',event:{}}],expect:[{value:['state','index'],equals:0},{value:['state','score'],equals:0}]}];
  return validateProgram(p);
}
