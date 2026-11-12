(function () {
  const form = document.querySelector('#request-form');
  const labels = ['Тип покупателя','Данные покупателя','Доставка','Получатель и документы','Получение документов','Подписание','Проверка заявки'];
  let step = 1;
  function clearErrors() {
    document.querySelectorAll('.field-error, .wizard-error').forEach(el => el.remove());
    form.querySelectorAll('[aria-invalid]').forEach(el => { el.removeAttribute('aria-invalid'); if (el.dataset.errorId) { const ids=(el.getAttribute('aria-describedby')||'').split(' ').filter(id=>id!==el.dataset.errorId); if(ids.length)el.setAttribute('aria-describedby',ids.join(' ')); else el.removeAttribute('aria-describedby'); delete el.dataset.errorId; } });
  }
  function summary() {
    const d = window.shipmentData(), r = ShipmentRules.recipient(d);
    const entries = [
      ['Покупатель', d.customerType === 'legal' ? d.legalName + ', ИНН ' + d.legalInn : d.personName,2],
      ['Доставка', d.deliveryType === 'carrier' ? [d.carrier==='Другая'?d.carrierOther:d.carrier,d.carrierCity,d.carrierDeliveryMode==='address'?d.deliveryAddress:d.terminal,'Плательщик: '+d.deliveryPayer].join('\n') : 'Самовывоз со склада',3],
      ['Получатель', d.deliveryType === 'carrier' ? [r.name,r.inn?'ИНН '+r.inn:'Физическое лицо',d.recipientContactName,d.recipientPhone].join('\n') : [d.repName,d.repPhone,d.repPosition].filter(Boolean).join('\n'),4],
      ['Основание отгрузки',d.shipmentBasis,4],
      ['Комментарий перевозчику',d.deliveryType==='carrier'?(d.carrierNote||'Не указан'):'Не требуется',4],
      ['Получение документов',[d.originalsMethod,d.originalsMethod==='Электронная почта'?d.originalsEmail:d.originalsMethod==='Почта России'?d.originalsPostalAddress:''].filter(Boolean).join('\n'),5],
      ['Подписание',d.signMethod==='edo'?'Передать PDF бухгалтерии для ЭДО':'Распечатать, подписать обе страницы и прикрепить скан/фото',6]
    ];
    const container=document.querySelector('#review-summary'); container.replaceChildren();
    entries.forEach(function ([title,body,target]) {
      const section=document.createElement('section'), heading=document.createElement('h3'), text=document.createElement('p'), edit=document.createElement('button');
      section.className='summary-row'; heading.textContent=title; text.textContent=body||'Не указано';
      edit.type='button'; edit.className='text-button'; edit.textContent='Изменить'; edit.setAttribute('aria-label','Изменить: '+title);
      edit.addEventListener('click',()=>showStep(target,true));
      section.append(heading,text,edit); container.appendChild(section);
    });
    document.querySelector('#application-preview').srcdoc=window.getShipmentPreviewHtml();
  }
  function showStep(target,scroll) {
    step=Math.max(1,Math.min(labels.length,target)); clearErrors(); window.syncShipment();
    document.querySelectorAll('.wizard-step').forEach(card=>card.classList.toggle('active-step',Number(card.dataset.step)===step&&!card.classList.contains('hidden')));
    document.querySelector('#wizard-title').textContent='Шаг '+step+' из '+labels.length;
    document.querySelector('#wizard-label').textContent=labels[step-1];
    document.querySelector('#wizard-bar').style.width=(step/labels.length*100)+'%';
    if(step!==7) document.querySelector('#result').classList.add('hidden');
    if(step===7) summary();
    if(scroll) {
      const card=document.querySelector('.wizard-step.active-step');
      card.scrollIntoView({behavior:'auto',block:'start'});
      const heading=card.querySelector('h2'); heading.tabIndex=-1; heading.focus({preventScroll:true});
    }
  }
  function showErrors(errors) {
    if(!errors.length)return;
    showStep(errors[0].step,true);
    let first;
    errors.filter(error=>error.step===step).forEach(function (error,index) {
      const input=form.elements.namedItem(error.field);
      let control=input && input.nodeType ? input : input && input[0];
      if(!control)return;
      if(control.closest('#legal-details')) document.querySelector('#legal-details').classList.remove('hidden');
      if(error.field==='terminal') control=document.querySelector('.terminal-choice .custom-dropdown:not(.hidden) button') || control;
      if(control.classList.contains('dropdown-native')) control=control.nextElementSibling.querySelector('button');
      const note=document.createElement('p'); note.id='field-error-'+index; note.className='field-error'; note.textContent=error.message; note.setAttribute('role','alert');
      (control.closest('label') || control.parentElement).appendChild(note);
      control.setAttribute('aria-invalid','true'); control.dataset.errorId=note.id;
      control.setAttribute('aria-describedby',((control.getAttribute('aria-describedby')||'')+' '+note.id).trim());
      if(!first)first=control;
    });
    if(first) { first.scrollIntoView({behavior:'auto',block:'center'}); first.focus({preventScroll:true}); }
  }
  document.querySelectorAll('.wizard-step').forEach(function (card) {
    const n=Number(card.dataset.step); if(n===7)return;
    const nav=document.createElement('div'); nav.className='wizard-nav';
    if(n>1) {const back=document.createElement('button');back.type='button';back.className='secondary';back.dataset.wizardBack='';back.textContent='Назад';nav.appendChild(back);}
    const next=document.createElement('button');next.type='button';next.className='primary';next.dataset.wizardNext='';next.textContent=n===6?'Проверить заявку':'Продолжить';nav.appendChild(next);card.appendChild(nav);
  });
  document.addEventListener('click',function (event) {
    if(event.target.closest('[data-wizard-back]'))showStep(step-1,true);
    if(event.target.closest('[data-wizard-next]')) {
      const errors=ShipmentRules.errors(window.shipmentData(),step);
      if(errors.length)showErrors(errors);else showStep(step+1,true);
    }
  });
  form.addEventListener('input',clearErrors);
  form.addEventListener('change',function(event){clearErrors();if(event.target.name==='customerType')showStep(step,false);});
  window.ShipmentWizard={showErrors:showErrors,showStep:showStep};
  showStep(1,false);
}());
