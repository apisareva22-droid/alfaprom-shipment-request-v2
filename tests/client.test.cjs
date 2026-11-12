const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const {valid}=require('./fixtures.cjs');
function app() {
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://test.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async()=>({ok:true,json:async()=>[]});
  for(const file of ['validation.js','transport.js','document.js','form.js','lookup.js','wizard.js','carrier.js','passport.js'])w.eval(fs.readFileSync(file,'utf8'));
  function set(data) {
    for(const [name,value]of Object.entries(data)){
      const controls=[...w.document.querySelectorAll('[name="'+name+'"]')];
      controls.forEach(el=>{if(el.type==='radio')el.checked=el.value===value;else if(el.type==='checkbox')el.checked=value===true;else el.value=String(value);});
    }
    w.syncShipment();
  }
  return {dom,w,set,doc:w.document};
}
test('seven steps, inline errors focus the actual invalid input',()=>{
  const a=app();try{
    a.w.ShipmentWizard.showStep(2,false);
    a.doc.querySelector('.active-step [data-wizard-next]').click();
    assert.equal(a.doc.activeElement.name,'legalInn');
    assert.equal(a.doc.activeElement.getAttribute('aria-invalid'),'true');
    assert.match(a.doc.querySelector('.field-error').textContent,/ИНН/);
    assert.match(a.doc.querySelector('#wizard-title').textContent,/из 7/);
  }finally{a.dom.window.close();}
});
test('PDF preview includes carrier comment and independent recipient INN; HTML escaped',()=>{
  const a=app();try{
    a.set(valid({recipientSame:false,recipient:'Другой <получатель>',recipientInn:'500100732259',carrierNote:'Позвонить за час <script>bad()</script>'}));
    const html=a.w.getShipmentPreviewHtml();
    assert.match(html,/Комментарий для перевозчика/);assert.match(html,/500100732259/);
    assert.match(html,/&lt;script&gt;/);assert(!html.includes('<script>bad()'));
    assert.equal((html.match(/Тестов Т.Т./g)||[]).length,2);
  }finally{a.dom.window.close();}
});
test('editing after preparation cancels the old document and clears signatures',()=>{
  const a=app();try{
    a.set(valid());a.w.ShipmentWizard.showStep(7,false);
    a.doc.querySelector('form').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(a.doc.querySelector('#result').classList.contains('hidden'),false);
    const input=a.doc.querySelector('[name="shipmentBasis"]');input.value='Новый счёт';input.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    assert.equal(a.doc.querySelector('#result').classList.contains('hidden'),true);
    assert.equal(a.doc.querySelector('#signed-upload-result').classList.contains('hidden'),true);
  }finally{a.dom.window.close();}
});
test('route change clears terminal and warehouse immediately, so old terminal cannot validate',()=>{
  const a=app();try{
    a.set(valid({pekWarehouseId:'old'}));
    const carrier=a.doc.querySelector('[name="carrier"]');carrier.value='Деловые Линии';carrier.dispatchEvent(new a.w.Event('change',{bubbles:true}));
    assert.equal(a.doc.querySelector('[name="terminal"]').value,'');
    assert.equal(a.doc.querySelector('[name="pekWarehouseId"]').value,'');
    assert.equal(a.w.shipmentData().terminalLoading,true);
    assert(a.w.ShipmentRules.errors(a.w.shipmentData(),3).length);
  }finally{a.dom.window.close();}
});
test('lookup timeout/failure enables manual terminal; late obsolete response ignored',async()=>{
  const a=app();try{
    a.set(valid());
    a.w.ShipmentTransport.jsonp=async()=>{throw new Error('timeout');};
    const carrier=a.doc.querySelector('[name="carrier"]');carrier.dispatchEvent(new a.w.Event('change',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,550));
    assert.equal(a.w.shipmentData().terminalLoading,false);
    assert.equal(a.doc.querySelector('[name="terminal"]').disabled,false);
    assert.equal(a.doc.querySelector('#retry-terminals').classList.contains('hidden'),false);
  }finally{a.dom.window.close();}
});
test('successful terminal remains in FormData after native field is hidden',async()=>{
  const a=app();try{
    a.set(valid());
    a.w.ShipmentTransport.jsonp=async()=>({ok:true,terminals:[{id:'one',name:'Самара',branchName:'Самара',address:'Тестовый адрес'}]});
    a.doc.querySelector('[name="carrier"]').dispatchEvent(new a.w.Event('change',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,550));
    const select=a.doc.querySelector('[name="pekTerminal"]');select.value='one';select.dispatchEvent(new a.w.Event('change',{bubbles:true}));
    assert.equal(a.w.shipmentData().terminal,'Самара — Тестовый адрес');
    assert.equal(a.w.shipmentData().pekWarehouseId,'one');
  }finally{a.dom.window.close();}
});
test('JSONP timeout rejects rather than leaving a pending promise',async()=>{
  const a=app();try{
    await assert.rejects(a.w.ShipmentTransport.jsonp('https://test.invalid/slow',10),/не ответил вовремя/);
  }finally{a.dom.window.close();}
});
test('company lookup uses the callback accepted by the deployed requisites service',async()=>{
  const a=app();try{
    const input=a.doc.querySelector('[name="legalInn"]');input.value='9900000017';
    input.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,450));
    const script=[...a.doc.querySelectorAll('script[src]')].find(el=>el.src.includes('inn=9900000017'));
    assert(script,'lookup request must be inserted');
    const callback=new URL(script.src).searchParams.get('callback');
    assert.match(callback,/^__alfapromLookup\d+_\d+$/);
    a.w[callback]({ok:true,found:true,company:{inn:'9900000017',name:'ООО Тестовый покупатель',director:'Тестов Тест Тестович',position:'Директор',phone:'+7 900 123-45-67',invoice:{number:'ТЕСТ-5',date:'12.11.2026'}}});
    await Promise.resolve();await Promise.resolve();
    assert.equal(a.doc.querySelector('[name="legalName"]').value,'ООО Тестовый покупатель');
    assert.equal(a.doc.querySelector('[name="legalSigner"]').value,'Тестов Тест Тестович');
    assert.match(a.doc.querySelector('[name="shipmentBasis"]').value,/ТЕСТ-5/);
    assert.match(a.doc.querySelector('#legal-inn-status').textContent,/Реквизиты найдены/);
  }finally{a.dom.window.close();}
});
test('shared transport keeps the default callback for carrier and receipt APIs',async()=>{
  const a=app();try{
    const request=a.w.ShipmentTransport.jsonp('https://test.invalid/health',1000);
    const script=[...a.doc.querySelectorAll('script[src]')].find(el=>el.src.includes('test.invalid/health'));
    const callback=new URL(script.src).searchParams.get('callback');
    assert.match(callback,/^__shipment_\d+_\d+$/);
    a.w[callback]({ok:true,protocol:2});assert.equal((await request).protocol,2);
  }finally{a.dom.window.close();}
});
