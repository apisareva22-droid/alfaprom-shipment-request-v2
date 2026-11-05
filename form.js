const form = document.querySelector('#request-form');
const result = document.querySelector('#result');
let documentPdf;
let finalizedRequestData;
let edoLogged = false;
const INTEGRATION_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyg0Ov5Gc632N16R61A1MySKK4jiU-Jh9AO4yoDiJvS7Y5m2FWt7emuiClrQXFrcXKrPA/exec';

function getData() { return Object.fromEntries(new FormData(form).entries()); }
function optionCards() {
  document.querySelectorAll('.choice input').forEach(input => {
    input.addEventListener('change', () => {
      document.querySelectorAll(`input[name="${input.name}"]`).forEach(i => i.closest('.choice').classList.toggle('active', i.checked));
      toggleSections();
    });
  });
}
function toggleSections() {
  const data = getData();
  document.querySelector('.legal-fields').classList.toggle('hidden', data.customerType !== 'legal');
  document.querySelector('.person-fields').classList.toggle('hidden', data.customerType !== 'person');
  const delivery = data.deliveryType;
  document.querySelector('.carrier-fields').classList.toggle('hidden', delivery !== 'carrier');
  document.querySelector('.representative-fields').classList.toggle('hidden', delivery !== 'representative');
  document.querySelector('.originals-email-fields').classList.toggle('hidden', data.originalsMethod !== 'Электронная почта');
  document.querySelector('.originals-post-fields').classList.toggle('hidden', data.originalsMethod !== 'Почта России');
}
function required(data, value, label) { if (!value?.trim()) throw new Error(`Заполните поле: «${label}».`); }
function validate(data) {
  if(data.customerType==='legal' && document.querySelector('#legal-details').classList.contains('hidden')) throw new Error('Введите ИНН и дождитесь завершения поиска организации.');
  if(data.customerType==='legal'){required(data,data.legalName,'Полное наименование организации');required(data,data.legalInn,'ИНН');required(data,data.legalSigner,'ФИО подписанта');}
  else {required(data,data.personName,'ФИО');required(data,data.contactPhone,'Телефон'); }
  if(data.deliveryType==='carrier'){
    required(data,data.carrier,'Транспортная компания');
    required(data,data.carrierCity,'Город получения');
    required(data,data.recipient,'Грузополучатель');
    required(data,data.recipientContactName,'Контактное лицо получателя');
    required(data,data.recipientPhone,'Телефон контактного лица');
    if(data.carrierDeliveryMode==='address') required(data,data.deliveryAddress,'Адрес доставки');
    else required(data,data.terminal,'Терминал транспортной компании');
  }
    if(data.deliveryType==='representative'){
    required(data,data.repPosition,'Должность получателя');
    required(data,data.repName,'ФИО получателя');
    required(data,data.repPassport,'Паспорт: серия и номер');
    required(data,data.repPassportIssued,'Кем и когда выдан паспорт');
  }
  required(data,data.shipmentBasis,'Счёт, договор или спецификация');
  if(data.originalsMethod==='Электронная почта') required(data,data.originalsEmail,'Адрес электронной почты для отправки документов');
  if(data.originalsMethod==='Почта России') required(data,data.originalsPostalAddress,'Адрес для отправки документов');
}
function date() {return new Intl.DateTimeFormat('ru-RU').format(new Date());}
function docTitle() {return 'ЗАЯВКА НА ОТГРУЗКУ';}
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
function makePdf(data) {
  const buyer = data.customerType === 'legal' ? data.legalName : data.personName;
  const inn = data.customerType === 'legal' ? data.legalInn : '—';
  const isCarrier = data.deliveryType === 'carrier';
  const recipient = isCarrier ? data.recipient : buyer;
  const passport = isCarrier ? (data.customerType === 'person' ? (data.personPassport || '—') : '—') : data.repPassport + '; ' + data.repPassportIssued;
  const deliveryCondition = isCarrier ? (data.carrierDeliveryMode === 'address' ? 'адресная' : 'до терминала ТК') : 'самовывоз';
  const deliveryAddress = isCarrier ? (data.carrierDeliveryMode === 'address' ? data.deliveryAddress : data.carrierCity + ', ' + data.terminal) : 'Самовывоз со склада';
  const carrier = isCarrier ? data.carrier : 'Самовывоз';
  const contact = isCarrier ? data.recipientContactName + (data.recipientPhone ? ', ' + data.recipientPhone : '') : data.repName + (data.contactPhone ? ', ' + data.contactPhone : '');
  const signerFullName = data.customerType === 'legal' ? data.legalSigner : data.personName;
  const signerParts = String(signerFullName || '').trim().split(' ').filter(Boolean);
  const signer = signerParts.length > 1 ? signerParts[0] + ' ' + signerParts.slice(1).map(function (part) { return part.charAt(0).toUpperCase() + '.'; }).join('') : (signerParts[0] || '');
  const pickup = data.pickupDate ? new Date(data.pickupDate + 'T00:00:00').toLocaleDateString('ru-RU') : '';
  const originalsDestination = data.originalsMethod === 'Электронная почта' ? data.originalsEmail : data.originalsMethod === 'Почта России' ? data.originalsPostalAddress : '';
  const e = escapeHtml;
  const row = (label, value, cls = '') => '<tr class="' + cls + '"><td>' + label + '</td><td>' + e(value || '—') + '</td></tr>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заявка на отгрузку</title><style>
@page{size:A4;margin:9mm 10mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:Arial,sans-serif;font-size:10.7pt;line-height:1.28}.page{min-height:277mm;position:relative}.page+ .page{page-break-before:always}.brand{height:38mm;position:relative;overflow:hidden}.pixels{position:absolute;left:-8mm;top:-9mm;width:38mm;height:38mm;background:repeating-linear-gradient(90deg,#ff8100 0 7mm,transparent 7mm 11mm),repeating-linear-gradient(0deg,#ff8100 0 7mm,transparent 7mm 11mm);opacity:.95}.wordmark{position:absolute;right:0;top:8mm;color:#ff8100;font-size:26pt;font-weight:300;letter-spacing:-1px}.tagline{position:absolute;right:1mm;top:22mm;color:#ff8100;font-size:10pt;font-weight:700}.title{text-align:center;font-size:15pt;font-weight:700;margin:0 0 6mm}.form-table{width:100%;border-collapse:collapse;table-layout:fixed}.form-table td{border:1px solid #111;padding:3.5mm 3mm;vertical-align:top}.form-table td:first-child{width:50%;font-style:italic}.form-table .tall td{height:18mm}.form-table .note td:first-child{font-size:9.5pt}.signature{margin-top:13mm;font-style:italic}.footer-note{margin-top:6mm;font-size:9.5pt;font-style:italic}.rules h1{text-align:center;font-size:14pt;font-style:italic;margin:8mm 0}.rules p{margin:0 0 4.5mm;text-align:justify;font-size:11.4pt;font-style:italic}.rules h2{font-size:12pt;font-style:italic;margin:5mm 0 2mm}.rules ul{margin:0 0 4.5mm;padding-left:8mm;font-size:11.2pt;font-style:italic}.rules .strong{font-weight:700}.rules .agree{margin-top:15mm;text-align:center}</style></head><body>` +
`<section class="page"><div class="brand"><div class="wordmark">АЛЬФАПРОМ</div><div class="tagline">Пищевое и упаковочное оборудование<br>Надежно. Быстро. Удобно</div></div><h1 class="title">ЗАЯВКА НА ОТГРУЗКУ</h1><table class="form-table">` +
row('Прошу вас отгрузить товар по счету/договору/спецификации', data.shipmentBasis, 'tall') +
row('Получатель (юр/физ лицо)', recipient) +
row('Плательщик за доставку (получатель/отправитель)', data.deliveryPayer, 'tall') +
row('ИНН получателя (заполняется для юр. лиц)', inn) +
row('Паспорт получателя (заполняется для физ. лиц)', passport) +
row('Условия доставки (адресная/до терминала ТК)', deliveryCondition) +
row('Адрес доставки (город)', deliveryAddress) +
row('Транспортная компания', carrier) +
row('Контактные данные получателя (ФИО и номер телефона)', contact, 'tall') +
row('Способ направления оригиналов документов (ЭДО, эл. почта, Почта России)', data.originalsMethod, 'tall') +
(originalsDestination ? row(data.originalsMethod === 'Электронная почта' ? 'Адрес электронной почты для отправки документов' : 'Адрес для отправки документов', originalsDestination, 'tall') : '') +
`</table><p class="footer-note">* Страховка груза в обязательном порядке оформляется на сумму из счёта.</p>${pickup ? '<p class="footer-note">Планируемый приезд за товаром: ' + e(pickup) + '.</p>' : ''}<p class="signature">____________________ / ${e(signer || '____________________')}</p><p class="footer-note">* При подписании заявки на отгрузку ознакомьтесь с правилами приема груза от транспортных компаний.</p></section>` +
`<section class="page rules"><h1>ПРАВИЛА ПРИЕМА ГРУЗА ОТ ТРАНСПОРТНЫХ КОМПАНИЙ</h1><p>При получении груза на терминале ТК: НАСТОЯТЕЛЬНО СОВЕТУЕМ сначала осмотреть груз на наличие повреждений. При наличии повреждений составить акт осмотра и претензию в транспортной компании ДЛЯ ПОЛУЧЕНИЯ ПОЛНОЙ КОМПЕНСАЦИИ.</p><p>При получении груза по адресной доставке: осмотрите груз на внешние повреждения (целостность упаковки). После вскрытия при обнаружении дефектов, в течение 3 дней Вы можете подать претензию в ТК.</p><p>Если сомневаетесь в целостности доставленного заказа, ни при каких условиях не подписывайте документы без предварительного осмотра груза. В обязательном порядке проверьте груз в месте вручения в присутствии сотрудника транспортной компании.</p><h2>Порядок действий при приемке груза:</h2><ul><li>Сверить количество фактических мест указанным в Накладной. Если количество мест не совпадает — составьте акт о расхождении мест в присутствии сотрудников ТК.</li><li>Проверьте внешнюю целостность упаковки. Наличие подозрительной упаковки также является поводом к составлению акта о нарушении условий доставки.</li></ul><h2>При любых повреждениях сделайте ряд фотографий:</h2><ul><li>Общий вид подозрительной упаковки с 2 ракурсов.</li><li>Крупный план подозрительной части упаковки.</li><li>Фотография вскрытой упаковки.</li><li>При необходимости — дефекты крупным планом на содержимом или видеозапись вскрытия упаковки.</li></ul><p class="strong">При возникновении замечаний сотрудник ТК предоставляет бланк акта, в котором необходимо описать обнаруженные повреждения: повреждения, отсутствие, подмена товара, прочее.</p><p class="strong">Акт обязательно должен быть заверен синей печатью ТК либо подписью водителя при доставке до адреса. Сроки подачи жалобы составляют 3 рабочих дня с момента получения груза.</p><p class="agree">С данными по отправке согласен, __________/____________ &nbsp;&nbsp; М.П.</p></section></body></html>`;
}
window.getShipmentPreviewHtml = function () { return makePdf(getData()); };
function printPdf(html){const w=window.open('','_blank');if(!w)return;w.document.write(html);w.document.close();w.focus();w.print();}
optionCards();
const signedFilesInput = document.querySelector('[name="signedFiles"]');
const fileName = document.querySelector('#file-name');
const sendStatus = document.querySelector('#send-status');
const sendButton = document.querySelector('#submit-signed-request');

signedFilesInput.addEventListener('change', function () {
  const files = Array.from(signedFilesInput.files);
  fileName.textContent = files.length ? files.map(function (file) { return file.name; }).join(', ') : 'Файлы не выбраны';
  sendStatus.textContent = '';
});

function fileToPayload(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onerror = function () { reject(new Error('Не удалось прочитать файл «' + file.name + '».')); };
    reader.onload = function () {
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64: String(reader.result).split(',')[1]
      });
    };
    reader.readAsDataURL(file);
  });
}

async function sendToRegistry(mode) {
  const files = mode === 'signed' ? Array.from(signedFilesInput.files) : [];
  if (mode === 'signed' && !files.length) throw new Error('Прикрепите хотя бы один файл с подписанной заявкой.');
  if (files.length > 2) throw new Error('Можно прикрепить не более двух файлов.');

  const payload = {
    action: 'submit',
    mode: mode,
    data: finalizedRequestData || getData(),
    files: await Promise.all(files.map(fileToPayload))
  };

  await fetch(INTEGRATION_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
}

form.addEventListener('submit', function (event) {
  event.preventDefault();
  const data = getData();
  const error = document.querySelector('#form-error');
  try {
    validate(data);
    finalizedRequestData = data;
    edoLogged = false;
    documentPdf = makePdf(data);
    error.textContent = '';
    result.classList.remove('hidden');
    document.querySelector('#signed-upload-result').classList.add('hidden');

    const text = data.signMethod === 'print'
      ? 'Благодарим за заполнение. Скачайте PDF, распечатайте и подпишите его. После скачивания прикрепите до двух файлов и отправьте заявку.'
      : data.signMethod === 'edo'
        ? 'Благодарим за заполнение. Скачайте PDF и отправьте его бухгалтерии для отправки через ЭДО.'
        : 'Документ можно сохранить как PDF. Автоматическая отправка в СБИС потребует отдельного подключения после тестирования формы.';
    document.querySelector('#result-text').textContent = docTitle(data) + ' сформирована.';
    document.querySelector('#sign-instruction').textContent = text;
    result.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    error.textContent = err.message;
  }
});

async function openPdf() {
  if (!documentPdf) return;
  printPdf(documentPdf);
  const mode = form.querySelector('[name="signMethod"]:checked').value;

  if (mode === 'print') {
    const upload = document.querySelector('#signed-upload-result');
    upload.classList.remove('hidden');
    upload.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (mode === 'edo' && !edoLogged) {
    edoLogged = true;
    const instruction = document.querySelector('#sign-instruction');
    try {
      await sendToRegistry('edo');
      instruction.textContent = 'Благодарим за заполнение. PDF скачан. Информация передана сотруднику, а файл можно отправить бухгалтерии для ЭДО.';
    } catch (err) {
      edoLogged = false;
      instruction.textContent = 'PDF скачан, но не удалось передать уведомление: ' + err.message;
    }
  }
}

sendButton.addEventListener('click', async function () {
  sendStatus.textContent = '';
  sendButton.disabled = true;
  try {
    await sendToRegistry('signed');
    sendStatus.textContent = 'Заявка отправлена. Сотрудник получил уведомление.';
    sendButton.textContent = 'Заявка отправлена';
  } catch (err) {
    sendStatus.textContent = err.message;
    sendButton.disabled = false;
  }
});

document.querySelector('#download-pdf').addEventListener('click', openPdf);
document.querySelector('#print-pdf').addEventListener('click', openPdf);

