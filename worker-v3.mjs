/** Side-by-side routing: every legacy URL still uses the unmodified production handler. */
import {handleRequest as legacy} from './worker.mjs';
import {handleComposable} from './ai/composable-gateway.mjs';
export function handleRequest(request,env,fetcher=fetch){
  return new URL(request.url).pathname.startsWith('/api/v3/')?handleComposable(request,env,fetcher):legacy(request,env,fetcher);
}
export default {fetch:(request,env)=>handleRequest(request,env)};
