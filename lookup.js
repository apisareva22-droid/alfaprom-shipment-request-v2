(function () {
  // Public requisites endpoint. Credentials and upstream requests stay on the server.
  const API_URL = 'https://script.google.com/macros/s/AKfycbypYQn_gIGVDe-wbIUvpySTnRKRQgXtUkAi2xoxc6-mjmzDRwJiuZNZCT8yGmvPz2JwCg/exec';
  const innInput = document.querySelector('[name="legalInn"]');
  const status = document.querySelector('#legal-inn-status');
  const details = document.querySelector('#legal-details');
  if (!innInput || !status || !details) return;

  const fallback = 'К сожалению, не удалось найти организацию по ИНН. Введите данные.';
  // The protected service may use either short or descriptive field names.
  // Keep the client independent from the data source and accept both.
  const fields = {
    name: { target: 'legalName', source: ['name', 'companyName', 'fullName'] },
    kpp: { target: 'kpp', source: ['kpp'] },
    ogrn: { target: 'ogrn', source: ['ogrn'] },
    signer: { target: 'legalSigner', source: ['signer', 'signerName', 'director', 'ceo', 'generalDirector', 'headName'] },
    role: { target: 'legalRole', source: ['role', 'signerRole', 'signerPosition', 'directorPosition', 'position', 'headPosition'] }
  };

  function firstText(record, names) {
    for (const name of names) {
      const value = record[name];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }
  let timer;
  let requestNumber = 0;
  let cancelRequest = function () {};
  let lastInn = '';

  function message(text, kind) {
    status.textContent = text;
    status.className = 'lookup-status' + (kind ? ' ' + kind : '');
  }

  function isLegal() {
    return document.querySelector('[name="customerType"]:checked').value === 'legal';
  }

  function reset() {
    clearTimeout(timer);
    ++requestNumber;
    cancelRequest();
    details.classList.add('hidden');
    details.dataset.lookupState = 'idle';
    details.removeAttribute('aria-busy');
    details.querySelectorAll('input').forEach(function (input) { input.value = input.defaultValue; });
    document.querySelector('#result').classList.add('hidden');
  }

  function lookup(inn) {
    const currentRequest = requestNumber;
    const callback = '__alfapromLookup' + Date.now() + '_' + currentRequest;
    const script = document.createElement('script');
    let timeout;
    let settled = false;

    function cleanup() {
      clearTimeout(timeout);
      script.remove();
      delete window[callback];
    }

    function finish(response) {
      if (settled) return;
      settled = true;
      cleanup();
      if (currentRequest !== requestNumber || innInput.value !== inn || !isLegal()) return;
      const company = response && response.ok === true && response.found === true && response.company;
      const returnedInn = String(company && (company.inn || company.taxId || company.INN) || '').replace(/\D/g, '');
      const found = company && returnedInn === inn && typeof company.name === 'string' && company.name.trim();
      if (found) {
        Object.keys(fields).forEach(function (key) {
          const field = fields[key];
          const value = firstText(company, field.source);
          document.querySelector('[name="' + field.target + '"]').value = value;
        });
      }
      details.classList.remove('hidden');
      details.dataset.lookupState = 'ready';
      details.removeAttribute('aria-busy');
      message(found ? 'Данные организации заполнены. Проверьте и при необходимости дополните их.' : fallback, found ? 'success' : '');
    }

    cancelRequest = function () { settled = true; cleanup(); };
    details.dataset.lookupState = 'loading';
    details.setAttribute('aria-busy', 'true');
    message('Ищем организацию…', 'loading');
    window[callback] = finish;
    script.onerror = function () { finish(null); };
    script.onload = function () { if (!settled) finish(null); };
    timeout = setTimeout(function () { finish(null); }, 10000);
    script.src = API_URL + '?inn=' + encodeURIComponent(inn) + '&callback=' + encodeURIComponent(callback);
    script.referrerPolicy = 'no-referrer';
    document.head.appendChild(script);
  }

  function onInnInput() {
    const inn = innInput.value.replace(/\D/g, '');
    innInput.value = inn;
    if (inn === lastInn) return;
    lastInn = inn;
    reset();
    if (!inn) { message('Введите ИНН для поиска организации.'); return; }
    if (inn.length !== 10 && inn.length !== 12) { message('Введите 10 или 12 цифр ИНН.'); return; }
    if (!isLegal()) return;
    timer = setTimeout(function () { lookup(inn); }, 600);
  }

  innInput.addEventListener('input', onInnInput);
  document.querySelectorAll('[name="customerType"]').forEach(function (input) {
    input.addEventListener('change', function () {
      // Discard in-flight responses on type changes; completed manual edits may remain.
      clearTimeout(timer);
      ++requestNumber;
      cancelRequest();
      if (isLegal() && details.classList.contains('hidden')) {
        lastInn = '';
        onInnInput();
      }
    });
  });
  message('Введите ИНН для поиска организации.');
  if (innInput.value) onInnInput();
}());

