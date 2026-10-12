import {configured,verifyToken,readSession} from './auth.mjs';
import {json} from './http.mjs';
export {DiaryObject} from './diary-object.mjs';
export default {
    async fetch(request,env) {
        const origin=request.headers.get('Origin');
        const allowed=(env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
        const respond=response=>{
            const headers=new Headers(response.headers);
            headers.set('Cache-Control','no-store');headers.set('Vary','Origin');
            if(origin && allowed.includes(origin))headers.set('Access-Control-Allow-Origin',origin);
            return new Response(response.body,{status:response.status,headers});
        };
        if(origin && !allowed.includes(origin))return respond(json({message:'此网站未获准连接。'},403));
        if(request.method==='OPTIONS'){
            const response=new Response(null,{status:204,headers:{
                'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS',
                'Access-Control-Allow-Headers':'Authorization, Content-Type',
                'Access-Control-Max-Age':'600'
            }});
            return respond(response);
        }
        const path=new URL(request.url).pathname;
        if(path==='/health' && request.method==='GET')return respond(json({configured:configured(env)}));
        if(!['/diary','/legacy-import','/auth/login','/auth/me'].includes(path))return respond(json({message:'找不到此接口。'},404));
        if(!configured(env))return respond(json({message:'后端尚未配置完成。'},503));
        if(path==='/auth/login' && request.method!=='POST')return respond(json({message:'不支持此操作。'},405));
        if(path==='/auth/me'){
            if(request.method!=='GET')return respond(json({message:'不支持此操作。'},405));
            const auth=request.headers.get('Authorization') || '';
            const user=auth.startsWith('Bearer ')?await readSession(auth.slice(7),env):null;
            return respond(user?json({user}):json({message:'请重新登录。'},401));
        }
        if(path==='/diary' || path==='/legacy-import'){
            const auth=request.headers.get('Authorization') || '';
            if(!auth.startsWith('Bearer ') || !await verifyToken(auth.slice(7),env))return respond(json({message:'请重新登录。'},401));
        }
        try {
            const id=env.DIARY_STORE.idFromName('our-diary');
            return respond(await env.DIARY_STORE.get(id).fetch(request));
        }catch {return respond(json({message:'同步服务暂时不可用，本机内容保留。'},502));}
    }
};
