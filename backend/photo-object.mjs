import {verifyToken} from './auth.mjs';
import {HttpError,json} from './http.mjs';
export const PHOTO_MAX=400*1024,PHOTO_LIMIT=200*1024*1024;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function readJPEG(request){
 if(request.headers.get('Content-Type')?.split(';')[0].toLowerCase()!=='image/jpeg')throw new HttpError(400,'请上传压缩后的 JPEG 照片。');
 if(Number(request.headers.get('Content-Length'))>PHOTO_MAX)throw new HttpError(413,'照片超过 400 KiB，请重新压缩。');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'照片为空。');
 let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reader.cancel().catch(()=>{});reject(new HttpError(400,'照片上传超时，请重试。'));},10000);});
 try{
  return await Promise.race([deadline,(async()=>{
   const chunks=[];let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>PHOTO_MAX){await reader.cancel();throw new HttpError(413,'照片超过 400 KiB，请重新压缩。');}chunks.push(value);}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
   if(size<4 || bytes[0]!==255 || bytes[1]!==216 || bytes[size-2]!==255 || bytes[size-1]!==217)throw new HttpError(400,'照片文件有误，请重新选择。');
   return bytes;
  })()]);
 }finally{clearTimeout(timer);}
}
export class PhotoObject {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 fetch(request){return this.ctx.blockConcurrencyWhile(async()=>{
  try{return await this.handle(request);}catch(error){return json({message:error instanceof HttpError?error.message:'照片存储暂时不可用，请重试；已有照片保留。'},error instanceof HttpError?error.status:503);}
 });}
 async handle(request){
  const auth=request.headers.get('Authorization') || '';
  if(!auth.startsWith('Bearer ') || !await verifyToken(auth.slice(7),this.env))throw new HttpError(401,'请重新登录。');
  const path=new URL(request.url).pathname,storage=this.ctx.storage;
  if(path==='/photo-usage'){
   if(request.method!=='GET')throw new HttpError(405,'不支持此操作。');
   return json({usedBytes:await storage.get('usedBytes') || 0,limitBytes:PHOTO_LIMIT});
  }
  const id=path.slice('/photos/'.length);
  if(!path.startsWith('/photos/') || !/^[a-f0-9]{64}$/.test(id))throw new HttpError(400,'照片标识有误。');
  if(request.method==='GET'){
   const bytes=await storage.get('photo:'+id);if(!bytes)throw new HttpError(404,'找不到这张照片。');
   return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(request.method!=='PUT')throw new HttpError(405,'不支持此操作。');
  const bytes=await readJPEG(request);if(await digest(bytes)!==id)throw new HttpError(400,'照片摘要不匹配，请重新选择。');
  const usedBytes=await storage.transaction(async tx=>{
   const existing=await tx.get('photo:'+id),used=await tx.get('usedBytes') || 0;
   if(existing){if(existing.byteLength!==bytes.byteLength || await digest(existing)!==id)throw new Error('Stored photo mismatch');return used;}
   if(used+bytes.byteLength>PHOTO_LIMIT)throw new HttpError(409,'相册已达到 200 MiB 容量上限，已有照片保留。');
   await tx.put('photo:'+id,bytes.buffer);await tx.put('usedBytes',used+bytes.byteLength);return used+bytes.byteLength;
  });
  return json({photoId:id,bytes:bytes.byteLength,usedBytes,limitBytes:PHOTO_LIMIT});
 }
}
