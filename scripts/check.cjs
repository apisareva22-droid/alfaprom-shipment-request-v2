const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
for(const name of fs.readdirSync('.').filter(x=>x.endsWith('.js')))new vm.Script(fs.readFileSync(name,'utf8'),{filename:name});
const backend=fs.readFileSync('apps-script/Code.gs','utf8');
new vm.Script(backend,{filename:'Code.gs'});
const shared=fs.readFileSync('validation.js','utf8').replace(/\r\n/g,'\n');
if(!backend.replace(/\r\n/g,'\n').includes(shared))throw new Error('Server/client validation must match');
console.log('All scripts parse; server and client rules match.');
