// Maintainer-only local test server. Public users do not run this.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../docs/',import.meta.url));
const types={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname==='/api/config'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"mode":"starter"}');return;}
 let filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(root)){res.writeHead(403);res.end();return;}
 try{const data=await readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
}).listen(4322,'127.0.0.1',()=>console.log('Native AI test server http://127.0.0.1:4322'));
