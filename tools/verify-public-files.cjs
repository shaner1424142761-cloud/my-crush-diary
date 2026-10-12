const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
// Scan browser code and unexpected private files. Development dependencies are not a release.
const skipped=new Set(['.git','.worktrees','.superpowers','.wrangler','node_modules','backend','tests','tools','docs']);
const {spawnSync}=require('node:child_process');
const tracked=process.argv[2]?null:new Set(spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).stdout.split('\0'));
let count=0;const problems=[];
function walk(dir,relative=''){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const name=relative+entry.name,absolute=path.join(dir,entry.name);
  if(entry.isDirectory()){
   if(/^(?:backups|\.private-backups)(?:\/|$)/i.test(name))problems.push(name+'：私人备份目录');
   else if(!skipped.has(entry.name))walk(absolute,name+'/');
   continue;
  }
  if(tracked && !tracked.has(name))continue;
  if(entry.isSymbolicLink()){problems.push(name+'：不允许发布符号链接');continue;}
  if(/(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|cloud-before-fix[^/]*|.*(?:snapshot|private-backup)[^/]*)$/i.test(name)&& !name.endsWith('.example')){problems.push(name+'：私人文件');continue;}
  if(!/\.(?:html|js|css)$/i.test(name))continue;
  count++;const source=fs.readFileSync(absolute,'utf8');
  if(/\$2[aby]\$\d\d\$[A-Za-z0-9./]{30,}/.test(source)||/(?:API_KEY|JSONBIN_KEY|DIARY_PASSWORD|SESSION_SECRET)\s*[:=]\s*['"][^'"]+['"]/.test(source)||/api\.jsonbin\.io|X-Master-Key|X-Access-Key/.test(source))problems.push(name+'：浏览器文件含直接云端凭据或请求');
 }
}
try{walk(root);if(problems.length){console.error(problems.join('\n'));process.exitCode=2;}else console.log('发布检查通过：'+count+' 个浏览器文件，无直接云端凭据或私人快照。');}
catch(_){console.error('无法检查发布目录');process.exitCode=2;}
