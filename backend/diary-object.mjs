import '../shared/records.js';
import {issueToken,passwordMatches,verifyToken} from './auth.mjs';
import {HttpError,json,readJson,validateRecord} from './http.mjs';
const rules=globalThis.CrushDiaryRecords.createRecordTools();
export class DiaryObject {
    constructor(ctx,env,fetcher=globalThis.fetch) {this.ctx=ctx;this.env=env;this.fetcher=fetcher;}
    fetch(request) {
        // Keep the input gate closed throughout the external read/merge/write.
        // Catch inside the gate so ordinary upstream failures do not reset the object.
        return this.ctx.blockConcurrencyWhile(async()=>{
            try {return await this.handle(request);}
            catch(error){return json({message:error instanceof HttpError?error.message:'云端暂时不可用，本机内容保留。'},error instanceof HttpError?error.status:502);}
        });
    }
    async login(request) {
        const body=await readJson(request);
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('CF-Connecting-IP') || 'unknown'));
        const ip=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        const now=Date.now();const key='rate:'+ip;const storage=this.ctx.storage;
        const entries=await storage.list({prefix:'rate:',limit:513});
        let active=entries.size;
        for(const [name,value]of entries)if(value.expiresAt<=now){await storage.delete(name);active--;}
        let rate=await storage.get(key);
        if(!rate && active>=512)throw new HttpError(429,'登录服务繁忙，请稍后再试。');
        if(!rate || rate.expiresAt<=now)rate={count:0,expiresAt:now+900000};
        if(rate.count>=5)throw new HttpError(429,'尝试次数较多，请 15 分钟后再试。');
        await storage.put(key,{...rate,count:rate.count+1});
        if(!await passwordMatches(body.password,this.env,body.username))throw new HttpError(401,'账号或密码不正确。');
        return json(await issueToken(this.env,body.username));
    }
    async upstream(method,record) {
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
        try {
            const bin=this.env.JSONBIN_BIN_ID;
            const headers={[this.env.JSONBIN_KEY_HEADER || 'X-Master-Key']:this.env.JSONBIN_KEY};
            if(method==='PUT'){headers['Content-Type']='application/json';headers['X-Bin-Versioning']='true';}
            const response=await this.fetcher('https://api.jsonbin.io/v3/b/'+bin+(method==='GET'?'/latest':''),
                {method,headers,signal:controller.signal,cache:'no-store',body:method==='PUT'?JSON.stringify(record):undefined});
            if(!response.ok)throw new Error('Upstream error');
            const data=await response.json();
            if(method==='GET'){
                try {validateRecord(data.record);return rules.normalizeFetched(data.record);}
                catch {throw new Error('Invalid upstream record');}
            }
            return record;
        } finally {clearTimeout(timer);}
    }
    async handle(request) {
        const path=new URL(request.url).pathname;
        if(path==='/auth/login' && request.method==='POST')return this.login(request);
        const token=(request.headers.get('Authorization') || '').replace(/^Bearer /,'');
        if(!await verifyToken(token,this.env))throw new HttpError(401,'请重新登录。');
        if(path!=='/diary')throw new HttpError(404,'找不到此接口。');
        if(request.method==='GET')return json({record:await this.upstream('GET')});
        if(request.method!=='PUT')throw new HttpError(405,'不支持此操作。');
        const local=await readJson(request);validateRecord(local);
        const remote=await this.upstream('GET');
        const record=rules.mergeRecords(remote,local);
        const snapshots=(await this.ctx.storage.get('snapshots') || []).slice(-2);
        snapshots.push({savedAt:Date.now(),record:remote});
        await this.ctx.storage.put('snapshots',snapshots);
        await this.upstream('PUT',record);
        return json({record});
    }
}
