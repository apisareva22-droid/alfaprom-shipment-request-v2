const test=require('node:test'),assert=require('node:assert/strict'),rules=require('../validation.js');
const {valid}=require('./fixtures.cjs');
test('INN rejects length, repeated digits, checksum; accepts company and person INN',()=>{
  assert.equal(rules.validInn('7707083893'),true);
  assert.equal(rules.validInn('500100732259'),true);
  for(const inn of ['0000000000','1111111111','7707083894','500100732258','123'])assert.equal(rules.validInn(inn),false,inn);
});
test('telephone, email, domestic and foreign documents enforce format',()=>{
  assert.equal(rules.validPhone('123'),false);assert.equal(rules.validPhone('+7 900 123-45-67'),true);
  assert.equal(rules.validEmail('почта'),false);assert.equal(rules.validEmail('test@example.ru'),true);
  assert.equal(rules.validPassport('1','ru'),false);assert.equal(rules.validPassport('4510 123456','ru'),true);
  assert.equal(rules.validPassport('AB123456','foreign'),true);
});
test('valid carrier; step errors have the actual target and step',()=>{
  assert.deepEqual(rules.errors(valid()),[]);
  assert(rules.errors(valid({recipientPhone:'123'}),4).some(e=>e.field==='recipientPhone'));
  assert(rules.errors(valid({originalsMethod:'Электронная почта',originalsEmail:'почта'}),5).some(e=>e.field==='originalsEmail'));
  assert(rules.errors(valid({carrierDeliveryMode:'address',deliveryAddress:''}),3).some(e=>e.field==='deliveryAddress'));
  assert(rules.errors(valid({terminalLoading:true}),3).some(e=>e.field==='terminal'));
});
test('different recipient never inherits buyer INN or passport',()=>{
  const d=valid({recipientSame:false,recipient:'Другой получатель',recipientInn:'500100732259'});
  assert.equal(rules.recipient(d).inn,'500100732259');assert.equal(rules.recipient(d).name,'Другой получатель');
  assert.deepEqual(rules.errors(d),[]);
});
test('self pickup needs contact and real-format passport, position optional',()=>{
  const d=valid({deliveryType:'representative',repName:'Тестов Водитель',repPassport:'4510 123456',repPassportIssued:'Тестовый орган, 01.01.2020',repPhone:'89001234567'});
  assert.deepEqual(rules.errors(d),[]);
  assert(rules.errors({...d,repPassport:'1'}).some(e=>e.field==='repPassport'));
});
test('files reject three files, invalid MIME, oversized and empty',()=>{
  const f={name:'scan.pdf',type:'application/pdf',size:1000};
  assert.deepEqual(rules.fileErrors([f]),[]);
  for(const files of [[f,f,f],[{...f,size:0}],[{...f,size:11*1024*1024}],[{...f,name:'scan.exe'}],[{...f,type:'text/plain'}]])assert(rules.fileErrors(files).length);
});
test('structured invoice requires document number and date',()=>{
  assert(rules.errors(valid({basisStructured:true,basisKind:'Счёт'}),4).some(e=>e.field==='basisNumber'));
  assert.deepEqual(rules.errors(valid({basisStructured:true,basisKind:'Счёт',basisNumber:'ТЕСТ-1',basisDate:'2026-11-12'}),4),[]);
});
