'use strict';
const form = document.querySelector('#request-form');
const result = document.querySelector('#result');
const signedFilesInput = document.querySelector('[name="signedFiles"]');
const fileName = document.querySelector('#file-name');
const sendStatus = document.querySelector('#send-status');
const receipt = document.querySelector('#request-receipt');
const draftKey = 'alfaprom-shipment-draft-v30';
let finalizedRequestData = null;
let documentHtml = '';
let generatedPdf = null;
let generation = 0;
let submission = null;
let submitted = false;
let sending = false;
const value = name => form.elements.namedItem(name);
const checked = name => Boolean(value(name) && value(name).checked);
const all = selector => Array.from(document.querySelectorAll(selector));
const show = (selector, visible) => all(selector).forEach(el => el.classList.toggle('hidden', !visible));

function getData() {
  const data = Object.fromEntries(new FormData(form).entries());
  ['recipientSame','contactSame','pickupSelf','basisStructured'].forEach(name => { data[name] = checked(name); });
  if(data.basisStructured) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(data.basisDate||'') ? data.basisDate.split('-').reverse().join('.') : '';
    data.shipmentBasis = [data.basisKind, data.basisNumber ? '№ '+data.basisNumber : '', date ? 'от '+date : ''].filter(Boolean).join(' ');
  }
  data.terminalLoading = form.dataset.terminalLoading === 'true';
  return data;
}
window.shipmentData = getData;
function invalidate() {
  generation += 1; documentHtml = ''; generatedPdf = null; finalizedRequestData = null;
  submission = null; submitted = false;
  result.classList.add('hidden'); result.classList.remove('has-error');
  show('#signed-upload-result, #edo-submit-result, #request-receipt', false);
  signedFilesInput.value = ''; fileName.textContent = 'Файлы не выбраны';
  sendStatus.textContent = ''; receipt.textContent = '';
  ['#download-pdf','#print-pdf','#submit-signed-request','#submit-edo-request'].forEach(selector => { document.querySelector(selector).disabled = false; });
  document.querySelector('#submit-signed-request').textContent = 'Отправить подписанную заявку';
  document.querySelector('#submit-edo-request').textContent = 'Сообщить менеджеру о заявке для ЭДО';
}
window.invalidateShipment = invalidate;

function sync() {
  const d = getData();
  show('.legal-fields', d.customerType === 'legal'); show('.person-fields', d.customerType === 'person');
  show('.carrier-fields', d.deliveryType === 'carrier'); show('.representative-fields, .pickup-info', d.deliveryType === 'representative');
  show('.pickup-self', d.customerType === 'person');
  show('.recipient-custom', !d.recipientSame);
  show('.recipient-legal', d.recipientType === 'legal'); show('.recipient-person', d.recipientType === 'person');
  show('.originals-email-fields', d.originalsMethod === 'Электронная почта');
  show('.originals-post-fields', d.originalsMethod === 'Почта России');
  show('.carrier-other', d.carrier === 'Другая');
  show('.basis-builder',d.basisStructured); show('.basis-free',!d.basisStructured);
  if (d.contactSame) {
    value('recipientContactName').value = d.customerType === 'legal' ? d.legalSigner || '' : d.personName || '';
    if (d.customerType === 'person') value('recipientPhone').value = d.contactPhone || '';
  }
  value('recipientContactName').readOnly = d.contactSame;
  if (d.pickupSelf && d.customerType === 'person') {
    ['Name','Passport','PassportType'].forEach(part => { value('rep' + part).value = value('person' + part).value; });
    value('repPhone').value = d.contactPhone || '';
  }
  ['repName','repPhone','repPassport','repPassportType'].forEach(name => {
    value(name).disabled = false;
    if (value(name).tagName === 'INPUT') value(name).readOnly = Boolean(d.pickupSelf && d.customerType === 'person');
  });
  const r = ShipmentRules.recipient(getData());
  document.querySelector('#recipient-summary').textContent = d.recipientSame ? 'Получатель: ' + (r.name || 'заполните данные покупателя на шаге 2') + (r.inn ? ', ИНН ' + r.inn : '') : '';
  all('.choice input').forEach(input => input.closest('.choice').classList.toggle('active', input.checked));
}
window.syncShipment = sync;
function saveDraft() {
  try { sessionStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), data: getData() })); }
  catch (_) { document.querySelector('#draft-status').textContent = 'Автосохранение недоступно в этом браузере. Не закрывайте вкладку до отправки.'; }
}
try {
  const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
  if (draft && Date.now() - draft.at < 24 * 60 * 60 * 1000) {
    all('#request-form input, #request-form textarea, #request-form select').forEach(input => {
      const saved = draft.data[input.name];
      if (saved == null || input.type === 'file') return;
      if (input.type === 'radio') input.checked = input.value === saved;
      else if (input.type === 'checkbox') input.checked = saved === true;
      else input.value = String(saved).slice(0, input.maxLength > 0 ? input.maxLength : 2000);
    });
    // Terminal IDs are only valid after the route is checked again.
    value('pekWarehouseId').value = '';
    document.querySelector('#draft-status').textContent = 'Черновик восстановлен в этой вкладке. Проверьте данные и повторно выберите терминал.';
  }
} catch (_) { /* A damaged or unavailable draft must not block filling. */ }
form.addEventListener('input', function (event) {
  if (event.target.name === 'recipientContactName' && !event.target.readOnly) value('contactSame').checked = false;
  invalidate(); sync(); saveDraft();
});
form.addEventListener('change', function () { invalidate(); sync(); saveDraft(); });
document.addEventListener('shipment:change', function () { invalidate(); sync(); saveDraft(); });
all('input[type="tel"]').forEach(input => input.addEventListener('blur', function () {
  const digits = input.value.replace(/\D/g, '');
  if (/^[78]\d{10}$/.test(digits)) input.value = '+7 ' + digits.slice(1,4) + ' ' + digits.slice(4,7) + '-' + digits.slice(7,9) + '-' + digits.slice(9);
  saveDraft();
}));
sync();
window.getShipmentPreviewHtml = function () { return window.makeShipmentDocument(getData()); };

async function buildPdf(html, version) {
  if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) throw new Error('Модуль PDF не загрузился. Обновите страницу и повторите скачивание.');
  const frame = document.createElement('iframe');
  frame.title = 'Подготовка файла'; frame.setAttribute('aria-hidden','true'); frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:0;top:0;width:794px;height:1200px;border:0;z-index:-100;pointer-events:none;';
  const ready = new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('Не удалось подготовить документ. Повторите скачивание.')), 15000);
    frame.onload = () => { clearTimeout(timer); resolve(); };
  });
  frame.srcdoc = html; document.body.appendChild(frame);
  try {
    await ready;
    await frame.contentDocument.fonts.ready;
    const pdf = new window.jspdf.jsPDF({ unit:'mm', format:'a4', orientation:'portrait', compress:true });
    const pages = Array.from(frame.contentDocument.querySelectorAll('.page'));
    if (!pages.length) throw new Error('Документ не содержит страниц.');
    for (let i=0; i<pages.length; i++) {
      if (version !== generation) throw new Error('Данные изменились. Подготовьте документ заново.');
      const canvas = await window.html2canvas(pages[i], { scale:2, backgroundColor:'#ffffff', logging:false, useCORS:true, windowWidth:794, scrollX:0, scrollY:0 });
      const factor = Math.min(190/canvas.width, 277/canvas.height);
      const width = canvas.width*factor, height = canvas.height*factor;
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',.95), 'JPEG', 10+(190-width)/2, 9, width, height, undefined, 'MEDIUM');
    }
    return pdf;
  } finally { frame.remove(); }
}
function resultError(message) {
  result.classList.add('has-error');
  document.querySelector('#result-title').textContent = 'Нужно повторить действие';
  document.querySelector('#sign-instruction').textContent = message;
}
function currentDocument() {
  if (!finalizedRequestData || !documentHtml) throw new Error('Данные изменились. Проверьте заявку и подготовьте PDF заново.');
}
form.addEventListener('submit', function (event) {
  event.preventDefault();
  const data = getData(), errors = ShipmentRules.errors(data);
  if (errors.length) { window.ShipmentWizard.showErrors(errors); return; }
  invalidate(); finalizedRequestData = JSON.parse(JSON.stringify(data));
  documentHtml = window.makeShipmentDocument(finalizedRequestData);
  result.classList.remove('hidden','has-error');
  document.querySelector('#result-title').textContent = 'Данные проверены';
  document.querySelector('#result-text').textContent = 'Скачайте PDF и подпишите обе страницы.';
  document.querySelector('#sign-instruction').textContent = data.signMethod === 'print' ? 'После скачивания прикрепите подписанный скан или фото и отправьте заявку.' : 'Передайте скачанный PDF бухгалтерии. Для менеджера можно отдельно зарегистрировать заявку для ЭДО.';
  result.scrollIntoView({ behavior:'auto', block:'start' });
});
async function downloadDocument() {
  const button = document.querySelector('#download-pdf');
  const version = generation;
  button.disabled = true; button.textContent = 'Подготавливаем PDF…';
  try {
    currentDocument();
    const pdf = generatedPdf || await buildPdf(documentHtml, version);
    if (version !== generation) return;
    generatedPdf = pdf;
    await pdf.save('Заявка на отгрузку.pdf', {returnPromise:true});
    result.classList.remove('has-error');
    document.querySelector('#result-title').textContent = 'PDF подготовлен для скачивания';
    document.querySelector('#sign-instruction').textContent = finalizedRequestData.signMethod === 'print' ? 'Подпишите обе страницы и прикрепите скан или фото ниже.' : 'Передайте файл бухгалтерии для подписания через ЭДО. Затем сообщите менеджеру о заявке.';
    show('#signed-upload-result', finalizedRequestData.signMethod === 'print');
    show('#edo-submit-result', finalizedRequestData.signMethod === 'edo');
  } catch (error) { if (version === generation) resultError(error.message); }
  finally { button.disabled = false; button.textContent = 'Скачать PDF'; }
}
document.querySelector('#download-pdf').addEventListener('click', downloadDocument);
document.querySelector('#print-pdf').addEventListener('click', function () {
  try {
    currentDocument();
    const popup = window.open('', '_blank');
    if (!popup) throw new Error('Браузер заблокировал окно печати. Разрешите всплывающее окно или скачайте PDF.');
    popup.document.open(); popup.document.write(documentHtml); popup.document.close();
    popup.addEventListener('load', () => { popup.focus(); popup.print(); }, {once:true});
    show('#signed-upload-result', finalizedRequestData.signMethod === 'print');
    show('#edo-submit-result', finalizedRequestData.signMethod === 'edo');
  } catch (error) { resultError(error.message); }
});
function updateFiles() {
  const files = Array.from(signedFilesInput.files);
  const errors = ShipmentRules.fileErrors(files);
  fileName.textContent = files.length ? files.map(file => file.name + ' (' + (file.size/1024/1024).toFixed(1) + ' МБ)').join(', ') : 'Файлы не выбраны';
  sendStatus.textContent = errors.join(' ');
  sendStatus.classList.toggle('is-error', errors.length > 0);
  show('#clear-files', files.length > 0);
  document.querySelector('#submit-signed-request').disabled = submitted || errors.length > 0;
}
signedFilesInput.addEventListener('change', function () { submission=null; updateFiles(); });
document.querySelector('#clear-files').addEventListener('click', () => { submission=null; signedFilesInput.value=''; updateFiles(); });
function asPayload(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл «' + file.name + '».'));
    reader.onload = () => resolve({name:file.name,mimeType:file.type||ShipmentRules.mime[file.name.split('.').pop().toLowerCase()],base64:String(reader.result).split(',')[1]});
    reader.readAsDataURL(file);
  });
}
async function register(mode) {
  currentDocument();
  if (mode !== (finalizedRequestData.signMethod === 'edo' ? 'edo' : 'signed')) throw new Error('Способ подписания изменился. Подготовьте документ заново.');
  const files = mode === 'signed' ? Array.from(signedFilesInput.files) : [];
  if (mode === 'signed' && !files.length) throw new Error('Выберите хотя бы один файл с подписанной заявкой.');
  const issues = ShipmentRules.fileErrors(files); if (issues.length) throw new Error(issues[0]);
  const endpoint = ShipmentTransport.endpoint;
  const health = await ShipmentTransport.jsonp(endpoint + '?action=health');
  if (!health.ok || health.protocol !== 2) throw new Error('Сервис отправки обновляется. PDF можно сохранить. Повторите отправку позже.');
  if (!submission) submission = { id:crypto.randomUUID(), token:crypto.randomUUID().replace(/-/g,'') };
  const pdf = generatedPdf || await buildPdf(documentHtml, generation);
  generatedPdf = pdf;
  const generated = await asPayload(new File([pdf.output('blob')], 'Заявка на отгрузку.pdf', {type:'application/pdf'}));
  const payload = {action:'submit', protocol:2, submissionId:submission.id, statusToken:submission.token, mode:mode, data:finalizedRequestData, files:await Promise.all(files.map(asPayload)), generatedPdf:generated};
  // The opaque POST response is never interpreted as success.
  let transportError;
  try {
    await fetch(endpoint, {method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
  } catch (error) { transportError = error; }
  const statusUrl = endpoint + '?action=requestStatus&submissionId=' + encodeURIComponent(submission.id) + '&statusToken=' + encodeURIComponent(submission.token);
  for (let attempt=0; attempt<12; attempt++) {
    const status = await ShipmentTransport.jsonp(statusUrl);
    if (status.ok && status.received && status.requestId) return status;
    if (status.error) throw new Error(status.error);
    await new Promise(resolve => setTimeout(resolve,1500));
  }
  throw new Error('Подтверждение приёма пока не получено. Повторите отправку: повторная попытка этой заявки не создаст дубликат.' + (transportError ? ' Проверьте соединение.' : ''));
}
async function submitRequest(mode, button) {
  if (sending || submitted) return;
  sending = true; form.inert = true; signedFilesInput.disabled = true;
  const buttons = all('#submit-signed-request, #submit-edo-request');
  buttons.forEach(el => { el.disabled=true; });
  sendStatus.classList.remove('is-error'); sendStatus.textContent = 'Отправляем файлы и ожидаем подтверждение…';
  try {
    const status = await register(mode);
    submitted = true; show('#request-receipt',true);
    receipt.textContent = 'Заявка № ' + status.requestId + ' принята и сохранена.';
    sendStatus.textContent = status.notification === 'sent' ? 'Менеджеру отправлено уведомление.' : 'Заявка сохранена. Уведомление менеджеру ожидает отправки; повторно отправлять заявку не нужно.';
    button.textContent = 'Заявка принята';
    try { sessionStorage.removeItem(draftKey); } catch (_) {}
  } catch (error) { sendStatus.textContent = error.message; sendStatus.classList.add('is-error'); }
  finally { sending=false; form.inert=false; signedFilesInput.disabled=false; buttons.forEach(el => { el.disabled=submitted; }); }
}
document.querySelector('#submit-signed-request').addEventListener('click', event => submitRequest('signed',event.currentTarget));
document.querySelector('#submit-edo-request').addEventListener('click', event => submitRequest('edo',event.currentTarget));
