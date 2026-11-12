(function () {
  const form=document.querySelector('#request-form');
  const city=document.querySelector('[name="carrierCity"]'),cities=document.querySelector('#carrier-city-options');
  const carrier=document.querySelector('[name="carrier"]'),mode=document.querySelector('[name="carrierDeliveryMode"]');
  const terminal=document.querySelector('[name="terminal"]'),select=document.querySelector('[name="pekTerminal"]'),idField=document.querySelector('[name="pekWarehouseId"]');
  const help=document.querySelector('#terminal-help'),retry=document.querySelector('#retry-terminals'),manual=document.querySelector('#manual-terminal');
  const actions={'ПЭК':'pekTerminals','Деловые Линии':'dellinTerminals','СДЭК':'cdekTerminals','ЖелДорЭкспедиция':'jdeTerminals'};
  const cache=new Map(),cityCache=new Map();
  let routeRevision=0,cityRevision=0,cityTimer,routeTimer,controller;
  function changed(){document.dispatchEvent(new Event('shipment:change'));}
  function dropdown(native,placeholder) {
    const root=document.createElement('div'),trigger=document.createElement('button'),menu=document.createElement('div');
    root.className='custom-dropdown'+(native.classList.contains('hidden')?' hidden':'');
    trigger.type='button';trigger.className='custom-dropdown-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    menu.className='custom-dropdown-menu hidden';menu.setAttribute('role','listbox');menu.id='options-'+native.name;
    const label=native.closest('label');const labelText=label?label.childNodes[0].textContent.trim():placeholder;
    menu.setAttribute('aria-label',labelText);trigger.setAttribute('aria-label',labelText);trigger.setAttribute('aria-controls',menu.id);
    root.append(trigger,menu);native.classList.add('dropdown-native');native.insertAdjacentElement('afterend',root);
    function close(){menu.classList.add('hidden');root.classList.remove('open');trigger.setAttribute('aria-expanded','false');}
    function options(){return Array.from(menu.querySelectorAll('button:not(:disabled)'));}
    function render(){
      const option=native.options[native.selectedIndex];trigger.textContent=option&&option.value?option.textContent:placeholder;
      trigger.classList.toggle('is-placeholder',!(option&&option.value));menu.replaceChildren();let group='';
      Array.from(native.options).forEach(option=>{
        if(option.dataset.group&&option.dataset.group!==group){group=option.dataset.group;const title=document.createElement('div');title.className='dropdown-group';title.textContent=group;menu.appendChild(title);}
        const item=document.createElement('button');item.type='button';item.className='custom-dropdown-option'+(option.selected?' selected':'');
        item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.textContent=option.textContent;item.disabled=option.disabled;
        item.addEventListener('click',()=>{native.value=option.value;native.dispatchEvent(new Event('change',{bubbles:true}));close();trigger.focus();});menu.appendChild(item);
      });
    }
    function open(){
      document.querySelectorAll('.custom-dropdown-menu').forEach(el=>el.classList.add('hidden'));
      document.querySelectorAll('.custom-dropdown-trigger').forEach(el=>el.setAttribute('aria-expanded','false'));
      document.querySelectorAll('.custom-dropdown').forEach(el=>el.classList.remove('open'));
      menu.classList.remove('hidden');root.classList.add('open');trigger.setAttribute('aria-expanded','true');
    }
    trigger.addEventListener('click',()=>menu.classList.contains('hidden')?open():close());
    trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open();const opts=options();if(opts.length)opts[event.key==='ArrowDown'?0:opts.length-1].focus();}if(event.key==='Escape')close();});
    menu.addEventListener('keydown',event=>{
      const opts=options(),index=opts.indexOf(document.activeElement);
      if(event.key==='Escape'){event.preventDefault();close();trigger.focus();}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();let next=event.key==='Home'?0:event.key==='End'?opts.length-1:(index+(event.key==='ArrowDown'?1:-1)+opts.length)%opts.length;if(opts[next])opts[next].focus();}
    });
    root.addEventListener('focusout',()=>setTimeout(()=>{if(!root.contains(document.activeElement))close();},0));
    document.addEventListener('click',event=>{if(!root.contains(event.target))close();});native.addEventListener('change',render);render();
    return {render,setVisible(visible){root.classList.toggle('hidden',!visible);if(!visible)close();},setDisabled(disabled){trigger.disabled=disabled;if(disabled)close();}};
  }
  dropdown(carrier,'Выберите транспортную компанию');dropdown(mode,'Выберите способ доставки');
  const terminalMenu=dropdown(select,'Выберите ближайший терминал');
  function clearTerminals(){
    ++routeRevision;clearTimeout(routeTimer);
    form.dataset.terminalLoading='false';terminal.value='';idField.value='';terminal.disabled=false;
    select.replaceChildren(new Option('Выберите ближайший терминал',''));terminalMenu.render();terminalMenu.setVisible(false);
    select.classList.add('hidden');terminal.classList.remove('hidden');retry.classList.add('hidden');manual.classList.add('hidden');
  }
  function lookupRoute(){return actions[carrier.value]&&mode.value==='terminal'&&window.shipmentData().deliveryType==='carrier';}
  function updateRoute(){
    clearTerminals();
    document.querySelector('.terminal-choice').classList.toggle('hidden',mode.value==='address');
    document.querySelector('.address-choice').classList.toggle('hidden',mode.value!=='address');
    help.textContent='Укажите название и адрес грузового терминала выбранной ТК.';
    if(lookupRoute()&&city.value.trim().length>=2){
      form.dataset.terminalLoading='true';terminal.disabled=true;help.textContent='Подбираем терминалы '+carrier.value+'…';
      manual.classList.remove('hidden');
      const revision=routeRevision;routeTimer=setTimeout(()=>load(revision),450);
    }
  }
  const normalize=text=>String(text||'').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
  function renderTerminals(payload){
    terminal.disabled=false;
    const items=payload.terminals||[];
    if(!items.length){terminal.disabled=false;terminalMenu.setVisible(false);terminal.classList.remove('hidden');help.textContent='Рядом не найдено грузовых терминалов. Укажите адрес вручную или повторите поиск.';retry.classList.remove('hidden');return;}
    terminal.classList.add('hidden');select.classList.remove('hidden');
    const wanted=normalize(city.value.split('—')[0]);
    const sorted=items.map(item=>({...item,near:normalize(item.branchName)===wanted||normalize(item.name).startsWith(wanted)})).sort((a,b)=>Number(b.near)-Number(a.near));
    select.replaceChildren(new Option('Выберите ближайший терминал',''));
    sorted.forEach(item=>{
      const distance=Number.isFinite(item.distanceKm)?' ('+item.distanceKm+' км)':'';
      const label=[item.name,item.address].filter(Boolean).join(' — ')+distance;
      const option=new Option(label,String(item.id));option.dataset.label=label;option.dataset.group=item.near?'В выбранном городе и его окрестностях':'Другие ближайшие населённые пункты';select.add(option);
    });
    terminalMenu.render();terminalMenu.setVisible(true);terminalMenu.setDisabled(false);
    help.textContent='Выберите грузовой терминал. Для крупногабаритного оборудования уточните ограничения у перевозчика.';
    manual.classList.remove('hidden');
  }
  async function load(revision){
    const key=carrier.value+':'+city.value.trim(),route=carrier.value,location=city.value.trim();
    try{
      const payload=cache.get(key)||await ShipmentTransport.jsonp(ShipmentTransport.endpoint+'?action='+actions[route]+'&location='+encodeURIComponent(location),12000);
      if(revision!==routeRevision||!lookupRoute()||carrier.value!==route||city.value.trim()!==location)return;
      if(!payload||payload.ok!==true)throw new Error('Перевозчик временно не ответил.');
      cache.set(key,payload);form.dataset.terminalLoading='false';renderTerminals(payload);changed();
    }catch(error){
      if(revision!==routeRevision)return;
      form.dataset.terminalLoading='false';terminal.disabled=false;terminalMenu.setVisible(false);terminal.classList.remove('hidden');
      help.textContent='Не удалось подобрать терминалы. Укажите адрес вручную или повторите поиск.';retry.classList.remove('hidden');manual.classList.add('hidden');changed();
    }
  }
  retry.addEventListener('click',()=>{cache.delete(carrier.value+':'+city.value.trim());updateRoute();changed();});
  manual.addEventListener('click',()=>{clearTerminals();help.textContent='Укажите название и полный адрес грузового терминала.';retry.classList.remove('hidden');terminal.focus();changed();});
  select.addEventListener('change',()=>{
    const option=select.options[select.selectedIndex];terminal.value=option&&option.dataset.label||'';idField.value=select.value;changed();
  });
  function closeCities(){cities.classList.add('hidden');city.setAttribute('aria-expanded','false');}
  function chooseCity(title){city.value=title;closeCities();updateRoute();changed();}
  function renderCities(places,query){
    const wanted=normalize(query);const seen=new Set();
    const items=places.map(place=>{
      const address=place.address||{},locality=address.city||address.town||address.village||address.hamlet||'';
      const region=address.state||address.region||'';
      return {locality,region,title:locality+(region?' — '+region:'')};
    }).filter(item=>item.locality&&normalize(item.locality).includes(wanted)).sort((a,b)=>Number(normalize(b.locality)===wanted)-Number(normalize(a.locality)===wanted)||Number(Boolean(b.region))-Number(Boolean(a.region)));
    cities.replaceChildren();
    items.forEach(item=>{
      const key=normalize(item.title);if(seen.has(key)||(!item.region&&items.some(other=>other.region&&other.locality===item.locality)))return;seen.add(key);
      const option=document.createElement('button');option.type='button';option.className='city-option';option.setAttribute('role','option');option.textContent=item.title;
      option.addEventListener('mousedown',event=>event.preventDefault());option.addEventListener('click',()=>chooseCity(item.title));cities.appendChild(option);
    });
    const visible=cities.childElementCount>0;cities.classList.toggle('hidden',!visible);city.setAttribute('aria-expanded',String(visible));
    document.querySelector('#city-help').textContent=visible?'Выберите населённый пункт и проверьте регион.':'Подсказок нет. Можно оставить введённый город и уточнить регион вручную.';
  }
  async function searchCity(query){
    const revision=++cityRevision,text=query.trim();if(controller)controller.abort();
    if(text.length<2){closeCities();return;}
    if(cityCache.has(normalize(text))){renderCities(cityCache.get(normalize(text)),text);return;}
    controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
    document.querySelector('#city-help').textContent='Ищем населённые пункты…';
    try{
      const response=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ru&limit=8&q='+encodeURIComponent(text),{signal:controller.signal});
      if(!response.ok)throw new Error('Поиск недоступен');
      const places=await response.json();if(revision!==cityRevision||city.value.trim()!==text)return;
      cityCache.set(normalize(text),places);renderCities(places,text);
    }catch(_){if(revision===cityRevision){closeCities();document.querySelector('#city-help').textContent='Подсказки временно недоступны. Укажите город и регион вручную.';}}
    finally{clearTimeout(timer);}
  }
  city.addEventListener('input',()=>{++cityRevision;if(controller)controller.abort();clearTimeout(cityTimer);closeCities();cityTimer=setTimeout(()=>searchCity(city.value),300);updateRoute();changed();});
  city.addEventListener('focus',()=>{if(city.value.trim().length>=2)searchCity(city.value);});
  city.addEventListener('blur',()=>setTimeout(()=>{if(!cities.contains(document.activeElement))closeCities();},150));
  city.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeCities();
    if(event.key==='ArrowDown'){const option=cities.querySelector('button');if(option){event.preventDefault();option.focus();}}
  });
  cities.addEventListener('keydown',event=>{const items=Array.from(cities.querySelectorAll('button'));if(event.key==='Escape'){closeCities();city.focus();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const index=items.indexOf(document.activeElement);items[(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}});
  carrier.addEventListener('change',()=>{updateRoute();changed();});mode.addEventListener('change',()=>{updateRoute();changed();});
  document.querySelectorAll('[name="deliveryType"]').forEach(input=>input.addEventListener('change',()=>{updateRoute();changed();}));
  updateRoute();
}());
