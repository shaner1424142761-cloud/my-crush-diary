import '../shared/records.js';
import {HttpError,validateRecord} from './http.mjs';
const rules=globalThis.CrushDiaryRecords.createRecordTools();
const targetFor=id=>id==='yyf'?'my':id==='zxr'?'ta':null;
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
function identical(old,item,userId){
 const copy={...item};
 // A retry may predate the server assigning its own author metadata.
 if(copy.authorId===undefined && old.authorId===userId)copy.authorId=userId;
 return JSON.stringify(canonical(old))===JSON.stringify(canonical(copy));
}
export function authorizeChanges(remote,local,userId){
 const target=targetFor(userId);
 if(!target)throw new HttpError(401,'请重新登录。');
 const safe={...local};
 delete safe.taScore;delete safe.myScore;delete safe.score;delete safe.scoreBaseline;delete safe.history;
 for(const field of ['taHistory','myHistory','messages']){
  const key=field==='messages'?rules.keys.message:rules.keys.history;
  const existing=new Map((remote[field] || []).map(item=>[key(item),item]));
  safe[field]=(local[field] || []).map(item=>{
   const old=existing.get(key(item));
   if(old){if(!identical(old,item,userId))throw new HttpError(409,'已有历史记录不能修改；请保留原记录后重试。');return old;}
   if(field!=='messages' && field!==target+'History')throw new HttpError(403,'当前账号只能为对方打分，待同步内容仍保留在本机。');
   if(item.authorId!==undefined && item.authorId!==userId)throw new HttpError(403,'不能冒用另一人的署名。');
   if(typeof item.id!=='string' || !item.id.trim() || item.id.length>256)throw new HttpError(400,'旧的待同步内容请通过历史备份恢复。');
   if(item.importedBy!==undefined)throw new HttpError(400,'历史恢复需要专用接口。');
   const stamped={...item,authorId:userId};
   existing.set(key(stamped),stamped);
   return stamped;
  });
 }
 return safe;
}
export function legacyImport(remote,request,userId){
 if(!targetFor(userId) || request.target!==targetFor(userId))throw new HttpError(403,'请登录有权为此人打分的账号来恢复。');
 if(!Array.isArray(request.history) || !Array.isArray(request.messages))throw new HttpError(400,'恢复内容格式有误。');
 const field=request.target+'History';
 validateRecord({[field]:request.history,messages:request.messages});
 const recover=(items,old,key)=>{
  const existing=new Map(old.map(item=>[key(item),item]));
  return items.map(item=>{
   const legacyKey=key(item);
   if(existing.has(legacyKey))return existing.get(legacyKey);
   const id='import|'+key({...item,id:undefined});
   if(existing.has(id))return existing.get(id);
   if(item.authorId!==undefined || item.importedBy!==undefined)throw new HttpError(400,'此入口仅恢复未署名的旧内容。');
   const imported={...item,id,importedBy:userId};existing.set(id,imported);return imported;
  });
 };
 return {[field]:recover(request.history,remote[field] || [],rules.keys.history),messages:recover(request.messages,remote.messages || [],rules.keys.message)};
}
