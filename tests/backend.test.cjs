const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {valid}=require('./fixtures.cjs');
function harness({telegramFails=false,appendFails=false}={}) {
  const rows=[Array(18).fill('')],cache=new Map(),folders=new Map();
  let notifications=0,locked=false;
  function range(row,col,height=1,width=1) {
    return {
      getValues:()=>rows.slice(row-1,row-1+height).map(r=>Array.from({length:width},(_,i)=>r[col-1+i]||'')),
      setValue(v){rows[row-1][col-1]=v;},
      setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>{rows[row-1+i][col-1+j]=v;}));},
      createTextFinder(id){return {matchEntireCell(){return this;},findNext(){const index=rows.findIndex((r,i)=>i>0&&r[col-1]===id);return index<0?null:{getRow:()=>index+1};}};}
    };
  }
  const sheet={getLastRow:()=>rows.length,getRange:range,getMaxColumns:()=>18,insertColumnsAfter(){},appendRow(row){if(appendFails){appendFails=false;throw new Error('storage failed');}rows.push(row);}};
  const iterator=array=>({hasNext:()=>array.length>0,next:()=>array.shift()});
  function folder(name){
    const files=new Map();
    return {files,getUrl:()=> 'https://drive.test/'+name,getFilesByName:n=>iterator(files.has(n)?[files.get(n)]:[]),createFile(blob){const f={getUrl:()=> 'https://drive.test/'+name+'/'+blob.name};files.set(blob.name,f);return f;}};
  }
  const root={getFoldersByName:n=>iterator(folders.has(n)?[folders.get(n)]:[]),createFolder(n){const f=folder(n);folders.set(n,f);return f;}};
  const context={
    console:{error(){}},Date,Math,JSON,Array,Object,String,Number,RegExp,
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>Array.from(crypto.createHash('sha256').update(text).digest()),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),base64Decode:s=>Array.from(Buffer.from(s,'base64')),newBlob(bytes,mime,name){return {bytes,mime,name,getBytes:()=>typeof bytes==='string'?Array.from(Buffer.from(bytes)):bytes};}},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){}},
    DriveApp:{getFolderById:()=>root},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test'})},
    UrlFetchApp:{fetch(){notifications++;if(telegramFails)throw new Error('telegram unavailable');return {getContentText:()=>JSON.stringify({ok:true})};}},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:text=>({text,setMimeType(){return this;}})}
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);
  return {context,rows,folders,notifications:()=>notifications,locked:()=>locked};
}
function request(overrides={}) {
  const pdf={name:'scan.pdf',mimeType:'application/pdf',base64:Buffer.from('%PDF-1.7\n test').toString('base64')};
  return {protocol:2,action:'submit',submissionId:'12345678-1234-4123-8123-123456789abc',statusToken:'a'.repeat(32),mode:'signed',data:valid(),files:[pdf],generatedPdf:pdf,...overrides};
}
test('acknowledgement is persisted, duplicate retry sends no extra files or notification',()=>{
  const h=harness(),r=request(),a=h.context.saveRequest_(r),b=h.context.saveRequest_(r);
  assert.equal(a.received,true);assert.equal(a.requestId,b.requestId);assert.equal(h.rows.length,2);
  assert.equal(h.notifications(),1);assert.equal(h.folders.size,1);assert.equal([...h.folders.values()][0].files.size,3);
  assert.equal(h.context.getRequestStatus_(r).requestId,a.requestId);
  assert.equal(h.context.getRequestStatus_({...r,statusToken:'b'.repeat(32)}).received,false);
});
test('notification failure still returns saved acknowledgement without duplicates',()=>{
  const h=harness({telegramFails:true}),r=request(),result=h.context.saveRequest_(r);
  assert.equal(result.received,true);assert.equal(result.notification,'failed');assert.equal(h.rows.length,2);
  h.context.saveRequest_(r);assert.equal(h.rows.length,2);assert.equal(h.notifications(),1);
});
test('invalid data and spoofed attachment create no folder or registry row',()=>{
  for(const change of [
    {data:valid({recipientPhone:'123'})},
    {files:[{name:'bad.pdf',mimeType:'application/pdf',base64:Buffer.from('not a PDF').toString('base64')}]},
    {files:[request().files[0],request().files[0],request().files[0]]},
    {mode:'edo'}
  ]) {
    const h=harness();assert.throws(()=>h.context.saveRequest_(request(change)));
    assert.equal(h.rows.length,1);assert.equal(h.folders.size,0);assert.equal(h.notifications(),0);
  }
});
test('retry after registry failure reuses folder and files, releases lock',()=>{
  const h=harness({appendFails:true}),r=request();
  assert.throws(()=>h.context.saveRequest_(r));assert.equal(h.locked(),false);
  h.context.saveRequest_(r);assert.equal(h.rows.length,2);assert.equal(h.folders.size,1);
  assert.equal([...h.folders.values()][0].files.size,3);
});
test('doPost stores validation failure for status polling, never claims receipt',()=>{
  const h=harness(),r=request({data:valid({recipientPhone:'123'})});
  const response=h.context.doPost({postData:{contents:JSON.stringify(r)}});
  assert.equal(JSON.parse(response.text).ok,false);assert(h.context.getRequestStatus_(r).error);
  const fixed=request();h.context.doPost({postData:{contents:JSON.stringify(fixed)}});
  assert.equal(h.context.getRequestStatus_(fixed).received,true);
});
