import {validateModel,validateData} from '../core.mjs';
import {validateProgram,snapshotFor} from './kernel.mjs';
/** Explicit non-destructive copy. The original v1 workspace is never modified. */
export function migrateLegacy(app,data={}) {
  const old=validateModel(app),records=validateData(old,data);
  const colors={violet:'#7055d9',teal:'#087e80',blue:'#2e66c5',rose:'#b84975',amber:'#967015'};
  const p={format:'native-ai/3',id:old.id,name:old.name,description:old.description,
    design:{mode:'light',accent:colors[old.theme],density:'comfortable',font:'system',radius:12,navigation:'top',width:1200},
    collections:old.collections,state:[],functions:[],actions:[],
    pages:old.views.map(v=>({id:v.id,title:v.title,root:{id:`view-${v.id}`,type:'stack',children:[
      {id:`heading-${v.id}`,type:'heading',text:v.title},
      {id:`records-${v.id}`,type:'collection',collection:v.collection,layout:v.layout,titleField:v.titleField,groupField:v.groupField}
    ]}})),tests:[]};
  validateProgram(p);const snapshot=snapshotFor(p);snapshot.data=records;return {app:p,snapshot:snapshotFor(p,snapshot)};
}
