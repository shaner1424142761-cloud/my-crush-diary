// Debug-only adapter: every JSONBin request is handled locally, never on the internet.
import worker from '../../backend/worker.mjs';
import {DiaryObject as RealDiaryObject} from '../../backend/diary-object.mjs';
const initial=()=>({taScore:13,taHistory:[{id:'initial',change:10,time:'10-01',reason:'模拟积分'}],myScore:0,myHistory:[],messages:[{text:'本地模拟留言',time:'10-01'}],album:[],blogPosts:[],wishes:[{id:'demo-wish',text:'模拟愿望',done:false,updatedAt:1}],anniversaries:[],futureSection:{demo:true}});
export class DiaryObject extends RealDiaryObject {
    constructor(ctx,env){super(ctx,env,async(url,options={})=>{
        if(!url.startsWith('https://api.jsonbin.io/v3/b/'+'a'.repeat(24)))throw new Error('Unexpected upstream');
        // Use real Durable Object storage and a delayed mock upstream to exercise input gates.
        await new Promise(resolve=>setTimeout(resolve,30));
        let record=await ctx.storage.get('demo-cloud')||initial();
        if(options.method==='PUT'){record=JSON.parse(options.body);await ctx.storage.put('demo-cloud',record);}
        return Response.json({record});
    });}
}
import {PhotoObject as RealPhotoObject,PHOTO_LIMIT} from '../../backend/photo-object.mjs';
import {verifyToken} from '../../backend/auth.mjs';
export class PhotoObject extends RealPhotoObject {
    constructor(ctx,env){
        const fault={fail:false};
        const wrapped={blockConcurrencyWhile:fn=>ctx.blockConcurrencyWhile(fn),storage:{get:key=>ctx.storage.get(key),transaction:fn=>ctx.storage.transaction(tx=>fn({get:key=>tx.get(key),put:async(key,value)=>{await tx.put(key,value);if(key==='usedBytes' && fault.fail){fault.fail=false;throw new Error('Synthetic storage failure');}}}))}};
        super(wrapped,env);this.realCtx=ctx;this.fault=fault;
    }
    fetch(request){
        if(new URL(request.url).pathname!=='/__test/photo-control')return super.fetch(request);
        return this.realCtx.blockConcurrencyWhile(async()=>{
            const data=await request.json();
            if(data.mode==='capacity' && Number.isSafeInteger(data.usedBytes) && data.usedBytes>=0 && data.usedBytes<=PHOTO_LIMIT)await this.realCtx.storage.put('usedBytes',data.usedBytes);
            else if(data.mode==='failure')this.fault.fail=true;
            else return Response.json({message:'Bad fixture request'},{status:400});
            return Response.json({ok:true});
        });
    }
}
export default {async fetch(request,env){
    // This control route exists only in the fake local adapter, never production.
    if(new URL(request.url).pathname==='/__test/photo-control'){
        const origin=request.headers.get('Origin'),auth=request.headers.get('Authorization') || '';
        if(request.method!=='POST' || origin!==env.ALLOWED_ORIGINS || !auth.startsWith('Bearer ') || !await verifyToken(auth.slice(7),env))return Response.json({message:'Denied'},{status:401});
        return env.PHOTO_STORE.get(env.PHOTO_STORE.idFromName('our-photos')).fetch(request);
    }
    return worker.fetch(request,env);
}};
