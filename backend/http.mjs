export class HttpError extends Error {
    constructor(status,message){super(message);this.status=status;}
}
export function json(data,status=200) {
    return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function readJson(request) {
    const max=1048576;
    if(Number(request.headers.get('Content-Length'))>max)throw new HttpError(413,'内容太大，未保存；原记录仍保留。');
    if(!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json'))throw new HttpError(400,'请发送 JSON。');
    const reader=request.body?.getReader();
    if(!reader)throw new HttpError(400,'内容为空。');
    const chunks=[];let length=0;
    while(true) {
        const {value,done}=await reader.read();if(done)break;
        length+=value.byteLength;
        if(length>max){await reader.cancel();throw new HttpError(413,'内容太大，未保存；原记录仍保留。');}
        chunks.push(value);
    }
    const bytes=new Uint8Array(length);let at=0;
    for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
    let value;
    try {value=JSON.parse(new TextDecoder().decode(bytes));}
    catch {throw new HttpError(400,'内容格式有误。');}
    if(!value || typeof value!=='object' || Array.isArray(value))throw new HttpError(400,'内容格式有误。');
    return value;
}
export function validateRecord(record) {
    const arrays={taHistory:'change',myHistory:'change',history:'change',messages:'text',album:'url',blogPosts:null,wishes:'text',anniversaries:'date'};
    for(const [field,required] of Object.entries(arrays)){
        if(record[field]===undefined)continue;
        if(!Array.isArray(record[field]))throw new HttpError(400,'记录格式有误。');
        for(const item of record[field]){
            if(!item || typeof item!=='object' || Array.isArray(item))throw new HttpError(400,'记录格式有误。');
            if(required==='change' ? !Number.isFinite(item.change) : required && typeof item[required]!=='string')throw new HttpError(400,'记录格式有误。');
            if(field==='blogPosts' && typeof item.title!=='string' && typeof item.body!=='string')throw new HttpError(400,'记录格式有误。');
            if(item.time!==undefined && typeof item.time!=='string')throw new HttpError(400,'记录时间格式有误。');
            if(item.id!==undefined && typeof item.id!=='string')throw new HttpError(400,'记录标识格式有误。');
        }
    }
    for(const field of ['taScore','myScore','score'])if(record[field]!==undefined && !Number.isFinite(record[field]))throw new HttpError(400,'积分格式有误。');
}
