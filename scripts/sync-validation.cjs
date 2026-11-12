const fs=require('node:fs');
const file='apps-script/Code.gs';
const backend=fs.readFileSync(file,'utf8');
const validation=fs.readFileSync('validation.js','utf8');
fs.writeFileSync(file,backend.replace(/\/\/ BEGIN SHARED VALIDATION[\s\S]*?\/\/ END SHARED VALIDATION/,()=>'// BEGIN SHARED VALIDATION\n'+validation+'\n// END SHARED VALIDATION\n'));
