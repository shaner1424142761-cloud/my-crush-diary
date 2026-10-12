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
export default worker;
