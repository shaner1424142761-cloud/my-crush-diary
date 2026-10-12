const encoder = new TextEncoder();
const DAY = 86400;
let cachedSecret, cachedKey;
function bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64ToBytes(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Invalid encoding');
    return Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')), char=>char.charCodeAt(0));
}
async function key(env) {
    if (cachedSecret !== env.SESSION_SECRET) {
        cachedSecret = env.SESSION_SECRET;
        cachedKey = crypto.subtle.importKey('raw', encoder.encode(cachedSecret), {name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
    }
    return cachedKey;
}
export function configured(env) {
    return ['YYF_PASSWORD','ZXR_PASSWORD'].every(k=>typeof env[k]==='string' && env[k].length>=16) && env.YYF_PASSWORD!==env.ZXR_PASSWORD &&
        typeof env.SESSION_SECRET==='string' && env.SESSION_SECRET.length>=32 &&
        typeof env.JSONBIN_KEY==='string' && !!env.JSONBIN_KEY &&
        /^[a-f0-9]{24}$/i.test(env.JSONBIN_BIN_ID || '') && !!env.ALLOWED_ORIGINS && !!env.DIARY_STORE &&
        ['X-Master-Key','X-Access-Key'].includes(env.JSONBIN_KEY_HEADER || 'X-Master-Key');
}
export async function passwordMatches(password, env, userId) {
    if (!['yyf','zxr'].includes(userId) || typeof password!=='string' || password.length>1024) return false;
    const [actual, expected] = await Promise.all([password,env[userId.toUpperCase()+'_PASSWORD']].map(async value =>
        new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))));
    let mismatch=0;
    for(let i=0;i<expected.length;i++) mismatch |= actual[i]^expected[i];
    return mismatch===0;
}
export async function issueToken(env, userId, nowSeconds=Math.floor(Date.now()/1000)) {
    if(!['yyf','zxr'].includes(userId))throw new Error('Unknown account');
    const expiresAt=nowSeconds+7*DAY;
    const payload=bytesToBase64(encoder.encode(JSON.stringify({v:2,sub:userId,exp:expiresAt,nonce:crypto.randomUUID()})));
    const signature=await crypto.subtle.sign('HMAC',await key(env),encoder.encode(payload));
    return {token:payload+'.'+bytesToBase64(new Uint8Array(signature)),expiresAt,user:{id:userId,name:userId.toUpperCase()}};
}
export async function readSession(token, env, nowSeconds=Math.floor(Date.now()/1000)) {
    try {
        if(typeof token!=='string' || token.length>1024) return null;
        const parts=token.split('.');
        if(parts.length!==2) return null;
        const signature=base64ToBytes(parts[1]);
        if(signature.length!==32 || !await crypto.subtle.verify('HMAC',await key(env),signature,encoder.encode(parts[0]))) return null;
        const payload=JSON.parse(new TextDecoder().decode(base64ToBytes(parts[0])));
        const valid=payload.v===2 && ['yyf','zxr'].includes(payload.sub) && Number.isSafeInteger(payload.exp) && payload.exp>nowSeconds &&
            payload.exp<=nowSeconds+7*DAY && typeof payload.nonce==='string' && payload.nonce.length>0;
        return valid?{id:payload.sub,name:payload.sub.toUpperCase()}:null;
    } catch { return null; }
}

export async function verifyToken(token,env,nowSeconds) {return !!await readSession(token,env,nowSeconds);}
