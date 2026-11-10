import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const files=new Map([
  ['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],
  ['/labels-core.js','labels-core.js'],['/config.js','config.js'],
  ['/styles.css','styles.css']
]);
const mime=path=>path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8';
const host='127.0.0.1',port=Number(process.env.PORT||4273);
createServer(async(req,res)=>{
  const path=new URL(req.url||'/', 'http://127.0.0.1').pathname;
  const file=files.get(path);
  if(!['GET','HEAD'].includes(req.method)||!file){
    res.writeHead(404,{'Content-Type':'text/plain','X-Content-Type-Options':'nosniff'});res.end('Not found');return;
  }
  try{
    const body=await readFile(new URL(file,root));
    res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(500);res.end('File unavailable');}
}).listen(port,host,()=>console.log('Neur.AI Etiquetas: http://'+host+':'+port));
