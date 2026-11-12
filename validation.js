/* Shared rules: also embedded in apps-script/Code.gs by scripts/build.mjs. */
var ShipmentRules = (function () {
  'use strict';
  var MAX_FILE_BYTES = 10 * 1024 * 1024;
  var MAX_TOTAL_BYTES = 20 * 1024 * 1024;
  var MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  function text(value) { return String(value == null ? '' : value).trim(); }
  function validInn(value) {
    var n = text(value);
    if (!/^\d{10}(\d{2})?$/.test(n) || /^(\d)\1+$/.test(n)) return false;
    function digit(weights) { return weights.reduce(function (s, w, i) { return s + w * Number(n[i]); }, 0) % 11 % 10; }
    return n.length === 10 ? digit([2,4,10,3,5,9,4,6,8]) === Number(n[9]) :
      digit([7,2,4,10,3,5,9,4,6,8]) === Number(n[10]) && digit([3,7,2,4,10,3,5,9,4,6,8]) === Number(n[11]);
  }
  function validPhone(value) { return /^(?:7|8)\d{10}$/.test(text(value).replace(/\D/g, '')); }
  function validEmail(value) { return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(text(value)); }
  function validPassport(value, type) {
    var n = text(value).replace(/[\s-]/g, '');
    return type === 'foreign' ? /^[0-9A-ZА-ЯЁ]{5,24}$/i.test(n) : /^\d{10}$/.test(n) && !/^(\d)\1+$/.test(n);
  }
  function recipient(data) {
    var same = data.recipientSame === true || data.recipientSame === 'on';
    var legal = (same ? data.customerType : data.recipientType) === 'legal';
    return {
      type: legal ? 'legal' : 'person',
      name: text(same ? (legal ? data.legalName : data.personName) : data.recipient),
      inn: legal ? text(same ? data.legalInn : data.recipientInn) : '',
      passport: legal ? '' : text(same ? data.personPassport : data.recipientPassport),
      passportType: same ? data.personPassportType : data.recipientPassportType
    };
  }
  function errors(data, onlyStep) {
    var out = [];
    function add(field, step, message) { if (!onlyStep || step === onlyStep) out.push({ field: field, step: step, message: message }); }
    function need(field, step, label) { if (!text(data[field])) add(field, step, 'Заполните поле «' + label + '».'); }
    function phone(field, step) { if (!validPhone(data[field])) add(field, step, 'Введите российский телефон полностью: +7 и 10 цифр.'); }
    function passport(field, type, step) { if (!validPassport(data[field], data[type])) add(field, step, data[type] === 'foreign' ? 'Введите номер иностранного документа: от 5 до 24 букв и цифр.' : 'Введите серию и номер паспорта РФ: 10 цифр.'); }
    if (['legal','person'].indexOf(data.customerType) < 0) add('customerType',1,'Выберите тип покупателя.');
    if (data.customerType === 'legal') {
      if (!validInn(data.legalInn)) add('legalInn',2,'Проверьте ИНН: 10 или 12 цифр и корректное контрольное число.');
      need('legalName',2,'Наименование организации'); need('legalSigner',2,'ФИО подписанта');
    } else {
      need('personName',2,'ФИО покупателя'); phone('contactPhone',2);
      passport('personPassport','personPassportType',2);
      if (text(data.contactEmail) && !validEmail(data.contactEmail)) add('contactEmail',2,'Введите email в формате name@example.ru.');
    }
    if (['carrier','representative'].indexOf(data.deliveryType) < 0) add('deliveryType',3,'Выберите способ получения.');
    if (data.deliveryType === 'carrier') {
      need('carrierCity',3,'Город получения'); need('carrier',3,'Транспортная компания');
      if (data.carrier === 'Другая') need('carrierOther',3,'Название транспортной компании');
      if (['terminal','address'].indexOf(data.carrierDeliveryMode) < 0) add('carrierDeliveryMode',3,'Выберите способ доставки.');
      if (data.carrierDeliveryMode === 'address') need('deliveryAddress',3,'Адрес доставки');
      else need('terminal',3,'Терминал транспортной компании');
      if (data.terminalLoading) add('terminal',3,'Дождитесь подбора терминалов или включите ручной ввод.');
      if (['Получатель','Отправитель'].indexOf(data.deliveryPayer) < 0) add('deliveryPayer',3,'Выберите плательщика доставки.');
      var r = recipient(data);
      if (!(data.recipientSame === true || data.recipientSame === 'on')) {
        need('recipient',4,'Грузополучатель');
        if (['legal','person'].indexOf(data.recipientType) < 0) add('recipientType',4,'Выберите тип получателя.');
        if (r.type === 'legal' && !validInn(r.inn)) add('recipientInn',4,'Проверьте ИНН грузополучателя.');
        if (r.type === 'person') passport('recipientPassport','recipientPassportType',4);
      }
      need('recipientContactName',4,'Контактное лицо получателя'); phone('recipientPhone',4);
    }
    if (data.deliveryType === 'representative') {
      need('repName',4,'ФИО получателя'); passport('repPassport','repPassportType',4);
      need('repPassportIssued',4,'Кем и когда выдан документ'); phone('repPhone',4);
      if (data.pickupDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.pickupDate)) add('pickupDate',4,'Укажите дату приезда.');
    }
    need('shipmentBasis',4,'Счёт, договор или спецификация');
    if(data.basisStructured === true || data.basisStructured === 'on') {
      if(['Счёт','Договор','Спецификация'].indexOf(data.basisKind)<0)add('basisKind',4,'Выберите вид документа.');
      need('basisNumber',4,'Номер документа');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(data.basisDate||'') || isNaN(Date.parse(data.basisDate)))add('basisDate',4,'Укажите дату документа.');
    }
    if (['ЭДО','Электронная почта','Почта России'].indexOf(data.originalsMethod) < 0) add('originalsMethod',5,'Выберите способ получения документов.');
    if (data.originalsMethod === 'Электронная почта' && !validEmail(data.originalsEmail)) add('originalsEmail',5,'Введите email в формате name@example.ru.');
    if (data.originalsMethod === 'Почта России') need('originalsPostalAddress',5,'Почтовый адрес с индексом');
    if (['print','edo'].indexOf(data.signMethod) < 0) add('signMethod',6,'Выберите доступный способ подписания.');
    Object.keys(data).forEach(function (field) {
      if (data[field] != null && typeof data[field] !== 'string' && typeof data[field] !== 'boolean') add(field,2,'Некорректное значение поля.');
      if (typeof data[field] === 'string' && data[field].length > (field === 'carrierNote' ? 2000 : 500)) add(field, field === 'carrierNote' ? 4 : 2, 'Сократите текст: не более ' + (field === 'carrierNote' ? 2000 : 500) + ' символов.');
    });
    return out;
  }
  function fileErrors(files) {
    var result = [];
    var names = {};
    if (files.length > 2) result.push('Можно прикрепить не более двух файлов.');
    var total = 0;
    files.forEach(function (file) {
      if(names[file.name]) result.push('Выберите файлы с разными именами.');
      names[file.name] = true;
      var ext = text(file.name).split('.').pop().toLowerCase();
      if (!MIME[ext] || (file.type && file.type !== MIME[ext])) result.push('Файл «' + text(file.name) + '»: допустимы PDF, JPG и PNG.');
      if (!file.size || file.size > MAX_FILE_BYTES) result.push('Файл «' + text(file.name) + '» должен быть непустым и не больше 10 МБ.');
      total += Number(file.size) || 0;
    });
    if (total > MAX_TOTAL_BYTES) result.push('Общий размер файлов не должен превышать 20 МБ.');
    return result;
  }
  return { validInn: validInn, validPhone: validPhone, validEmail: validEmail, validPassport: validPassport,
    recipient: recipient, errors: errors, fileErrors: fileErrors, mime: MIME, maxFileBytes: MAX_FILE_BYTES, maxTotalBytes: MAX_TOTAL_BYTES };
}());
if (typeof module !== 'undefined' && module.exports) module.exports = ShipmentRules;
