'use strict';
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])); }
function makePdf(data) {
  const buyer = data.customerType === 'legal' ? data.legalName : data.personName;
  const recipientData = ShipmentRules.recipient(data);
  const inn = data.deliveryType === 'carrier' ? recipientData.inn : (data.customerType === 'legal' ? data.legalInn : '');
  const isCarrier = data.deliveryType === 'carrier';
  const recipient = isCarrier ? recipientData.name : buyer;
  const passport = isCarrier ? recipientData.passport : data.repPassport + '; ' + data.repPassportIssued;
  const deliveryCondition = isCarrier ? (data.carrierDeliveryMode === 'address' ? 'адресная' : 'до терминала ТК') : 'самовывоз';
  const deliveryAddress = isCarrier ? (data.carrierDeliveryMode === 'address' ? data.deliveryAddress : data.carrierCity + ', ' + data.terminal) : 'Самовывоз со склада';
  const carrier = isCarrier ? (data.carrier === 'Другая' ? data.carrierOther : data.carrier) : 'Самовывоз';
  const contact = isCarrier ? data.recipientContactName + (data.recipientPhone ? ', ' + data.recipientPhone : '') : data.repName + (data.repPhone ? ', ' + data.repPhone : '');
  const signerFullName = data.customerType === 'legal' ? data.legalSigner : data.personName;
  const signerParts = String(signerFullName || '').trim().split(' ').filter(Boolean);
  const signer = signerParts.length > 1 ? signerParts[0] + ' ' + signerParts.slice(1).map(function (part) { return part.charAt(0).toUpperCase() + '.'; }).join('') : (signerParts[0] || '');
  const pickup = data.pickupDate ? new Date(data.pickupDate + 'T00:00:00').toLocaleDateString('ru-RU') : '';
  const originalsDestination = data.originalsMethod === 'Электронная почта' ? data.originalsEmail : data.originalsMethod === 'Почта России' ? data.originalsPostalAddress : '';
  const e = escapeHtml;
  const row = (label, value, cls = '') => '<tr class="' + cls + '"><td>' + label + '</td><td>' + e(value || '—') + '</td></tr>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заявка на отгрузку</title><style>
@page{size:A4;margin:9mm 10mm}*{box-sizing:border-box}body{width:190mm;margin:0;color:#111;font-family:Arial,sans-serif;font-size:10pt;line-height:1.28}.page{display:flow-root;width:190mm;min-height:277mm;position:relative;overflow-wrap:anywhere}.page+ .page{page-break-before:always}.brand{height:34mm;position:relative;overflow:hidden}.pixels{position:absolute;left:-8mm;top:-9mm;width:38mm;height:34mm;background:repeating-linear-gradient(90deg,#ff8100 0 7mm,transparent 7mm 11mm),repeating-linear-gradient(0deg,#ff8100 0 7mm,transparent 7mm 11mm);opacity:.95}.wordmark{position:absolute;right:0;top:8mm;color:#ff8100;font-size:26pt;font-weight:300;letter-spacing:-1px}.tagline{position:absolute;right:1mm;top:22mm;color:#ff8100;font-size:10pt;font-weight:700}.title{text-align:center;font-size:15pt;font-weight:700;margin:0 0 6mm}.form-table{width:100%;border-collapse:collapse;table-layout:fixed}.form-table td{border:1px solid #111;padding:2.4mm 3mm;vertical-align:top}.form-table td:first-child{width:50%;font-style:italic}.form-table .tall td{height:13mm}.form-table .note td:first-child{font-size:9.5pt}.signature{margin-top:8mm;font-style:italic}.footer-note{margin-top:6mm;font-size:9.5pt;font-style:italic}.rules h1{text-align:center;font-size:14pt;font-style:italic;margin:8mm 0}.rules p{margin:0 0 4.5mm;text-align:justify;font-size:11.4pt;font-style:italic}.rules h2{font-size:12pt;font-style:italic;margin:5mm 0 2mm}.rules ul{margin:0 0 4.5mm;padding-left:8mm;font-size:11.2pt;font-style:italic}.rules .strong{font-weight:700}.rules .agree{margin-top:15mm;text-align:center}</style></head><body>` +
`<section class="page"><div class="brand"><div class="wordmark">АЛЬФАПРОМ</div><div class="tagline">Пищевое и упаковочное оборудование<br>Надежно. Быстро. Удобно</div></div><h1 class="title">ЗАЯВКА НА ОТГРУЗКУ</h1><table class="form-table">` +
row('Прошу вас отгрузить товар по счету/договору/спецификации', data.shipmentBasis, 'tall') +
row('Получатель (юр/физ лицо)', recipient) +
(isCarrier ? row('Плательщик доставки', data.deliveryPayer) : '') +
row('ИНН получателя (заполняется для юр. лиц)', inn) +
row('Паспорт получателя (заполняется для физ. лиц)', passport) +
row('Условия доставки (адресная/до терминала ТК)', deliveryCondition) +
row('Адрес доставки (город)', deliveryAddress) +
row('Транспортная компания', carrier) +
(isCarrier && data.carrierNote ? row('Комментарий для перевозчика', data.carrierNote) : '') +
row('Контактные данные получателя (ФИО и номер телефона)', contact, 'tall') +
row('Способ направления оригиналов документов (ЭДО, эл. почта, Почта России)', data.originalsMethod, 'tall') +
(originalsDestination ? row(data.originalsMethod === 'Электронная почта' ? 'Адрес электронной почты для отправки документов' : 'Адрес для отправки документов', originalsDestination, 'tall') : '') +
`</table><p class="footer-note">* Страховка груза в обязательном порядке оформляется на сумму из счёта.</p>${pickup ? '<p class="footer-note">Планируемый приезд за товаром: ' + e(pickup) + '.</p>' : ''}<p class="signature">____________________ / ${e(signer || '____________________')}</p><p class="footer-note">* При подписании заявки на отгрузку ознакомьтесь с правилами приема груза от транспортных компаний.</p></section>` +
`<section class="page rules"><h1>ПРАВИЛА ПРИЕМА ГРУЗА ОТ ТРАНСПОРТНЫХ КОМПАНИЙ</h1><p>При получении груза на терминале ТК: НАСТОЯТЕЛЬНО СОВЕТУЕМ сначала осмотреть груз на наличие повреждений. При наличии повреждений составить акт осмотра и претензию в транспортной компании ДЛЯ ПОЛУЧЕНИЯ ПОЛНОЙ КОМПЕНСАЦИИ.</p><p>При получении груза по адресной доставке: осмотрите груз на внешние повреждения (целостность упаковки). После вскрытия при обнаружении дефектов, в течение 3 дней Вы можете подать претензию в ТК.</p><p>Если сомневаетесь в целостности доставленного заказа, ни при каких условиях не подписывайте документы без предварительного осмотра груза. В обязательном порядке проверьте груз в месте вручения в присутствии сотрудника транспортной компании.</p><h2>Порядок действий при приемке груза:</h2><ul><li>Сверить количество фактических мест указанным в Накладной. Если количество мест не совпадает — составьте акт о расхождении мест в присутствии сотрудников ТК.</li><li>Проверьте внешнюю целостность упаковки. Наличие подозрительной упаковки также является поводом к составлению акта о нарушении условий доставки.</li></ul><h2>При любых повреждениях сделайте ряд фотографий:</h2><ul><li>Общий вид подозрительной упаковки с 2 ракурсов.</li><li>Крупный план подозрительной части упаковки.</li><li>Фотография вскрытой упаковки.</li><li>При необходимости — дефекты крупным планом на содержимом или видеозапись вскрытия упаковки.</li></ul><p class="strong">При возникновении замечаний сотрудник ТК предоставляет бланк акта, в котором необходимо описать обнаруженные повреждения: повреждения, отсутствие, подмена товара, прочее.</p><p class="strong">Акт обязательно должен быть заверен синей печатью ТК либо подписью водителя при доставке до адреса. Сроки подачи жалобы составляют 3 рабочих дня с момента получения груза.</p><p class="agree">С данными по отправке согласен, ____________________ / ${e(signer || '____________________')} &nbsp;&nbsp; М.П.</p></section></body></html>`;
}

window.makeShipmentDocument = makePdf;
