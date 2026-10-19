/** Shared server-only bounds/errors. Never attach provider responses or request bodies. */
export class BuildError extends Error {
  constructor(code,message,status=502,retryAfter=null){super(message);this.name='BuildError';this.code=code;this.status=status;this.retryAfter=retryAfter;}
}
export const text=(x,n)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
export const bytes=x=>new TextEncoder().encode(typeof x==='string'?x:JSON.stringify(x)).length;
/** Stop waiting even if a transport/stream does not cooperate with cancellation. */
export async function withAbort(operation,signal) {
  if(!signal)return operation();
  signal.throwIfAborted();
  let abort;
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(signal.reason??new DOMException('Cancelled.','AbortError'));signal.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return operation();}),cancelled]);}
  finally{signal.removeEventListener('abort',abort);}
}
/** Cleanup must not delay an error or deadline; failures are intentionally private. */
export function cancelBody(body) {try{Promise.resolve(body?.cancel()).catch(()=>{});}catch{}}
export async function boundedJSON(response,limit=200000,signal) {
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing response body.');let size=0;const parts=[];
  try{while(true){const {done,value}=await withAbort(()=>reader.read(),signal);if(done)break;size+=value.byteLength;if(size>limit)throw new BuildError('AI_RESPONSE_TOO_LARGE','Response exceeded the byte limit. No changes applied.');parts.push(value);}const all=new Uint8Array(size);let i=0;for(const part of parts){all.set(part,i);i+=part.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch(e){cancelBody(reader);throw e;}finally{reader.releaseLock();}
}
