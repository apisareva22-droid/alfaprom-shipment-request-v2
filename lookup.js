(function () {
  const form=document.querySelector('#request-form');
  const endpoint='https://script.google.com/macros/s/AKfycbypYQn_gIGVDe-wbIUvpySTnRKRQgXtUkAi2xoxc6-mjmzDRwJiuZNZCT8yGmvPz2JwCg/exec';
  const input=document.querySelector('[name="legalInn"]'),status=document.querySelector('#legal-inn-status'),details=document.querySelector('#legal-details');
  let sequence=0,timer;
  function message(text){status.textContent=text;}
  function manual() { clearTimeout(timer);++sequence;details.classList.remove('hidden');details.dataset.lookupState='ready';message('Введите реквизиты вручную и проверьте ИНН.'); }
  document.querySelector('#manual-company').addEventListener('click',manual);
  function first(record,names){for(const name of names){if(typeof record[name]==='string'&&record[name].trim())return record[name].trim();}return '';}
  async function lookup(inn,id) {
    message('Ищем организацию… Можно заполнить реквизиты вручную.');
    try {
      const response=await ShipmentTransport.jsonp(endpoint+'?inn='+encodeURIComponent(inn),8000);
      if(id!==sequence||input.value!==inn||document.querySelector('[name="customerType"]:checked').value!=='legal')return;
      const company=response&&response.ok&&response.found&&response.company;
      if(company&&String(company.inn||company.taxId||company.INN||'').replace(/\D/g,'')===inn) {
        const mappings={legalName:['name','companyName','fullName'],legalSigner:['signer','signerName','director','ceo','generalDirector','headName'],legalRole:['role','signerRole','signerPosition','position','headPosition']};
        Object.entries(mappings).forEach(([target,names])=>{form.elements.namedItem(target).value=first(company,names);});
        if(!form.elements.namedItem('recipientPhone').value)form.elements.namedItem('recipientPhone').value=first(company,['phone','recipientPhone','contactPhone']);
        if(company.invoice&&company.invoice.number&&!form.elements.namedItem('shipmentBasis').value)form.elements.namedItem('shipmentBasis').value='Счёт № '+company.invoice.number+(company.invoice.date?' от '+company.invoice.date:'');
        message('Реквизиты найдены. Проверьте и дополните их.');
      } else message('Организация не найдена. Введите реквизиты вручную.');
    } catch (_) {if(id!==sequence)return;message('Поиск временно недоступен. Введите реквизиты вручную.');}
    if(id!==sequence)return;
    details.classList.remove('hidden');details.dataset.lookupState='ready';
    document.dispatchEvent(new Event('shipment:change'));
  }
  input.addEventListener('input',function(){
    clearTimeout(timer);const id=++sequence;
    input.value=input.value.replace(/\D/g,'');
    ['legalName','legalSigner','legalRole'].forEach(name=>{form.elements.namedItem(name).value='';});
    details.classList.add('hidden');
    if(!ShipmentRules.validInn(input.value)){message('Введите корректный ИНН: 10 или 12 цифр.');return;}
    timer=setTimeout(()=>lookup(input.value,id),400);
  });
  if(input.value&&ShipmentRules.validInn(input.value)&&form.elements.namedItem('legalName').value)details.classList.remove('hidden');
  else message('Введите ИНН или заполните реквизиты вручную.');
}());
