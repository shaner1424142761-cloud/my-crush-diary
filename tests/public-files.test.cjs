const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const scanner=path.resolve(__dirname,'../tools/verify-public-files.cjs');
function scan(files){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'diary-release-'));try{for(const [name,data]of Object.entries(files)){const dest=path.join(dir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);}return spawnSync(process.execPath,[scanner,dir],{encoding:'utf8'});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('public scanner accepts the safe browser set',()=>assert.equal(scan({'index.html':'<html></html>','js/config.js':"window.CrushDiary.API_BASE_URL='https://example.workers.dev';"}).status,0));
test('public scanner refuses literal cloud keys without printing values',()=>{const result=scan({'js/config.js':"CD.API_KEY='fake-private-key';"});assert.equal(result.status,2);assert.equal(result.stdout.includes('fake-private-key'),false);});
test('public scanner refuses private snapshots and credential files',()=>{for(const name of ['cloud-before-fix-20261011.json','.dev.vars','backups/cloud.json'])assert.equal(scan({[name]:'private memories'}).status,2);});
