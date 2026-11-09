const SPREADSHEET_ID = '1bsYAQg6CbPhBcREOwoqlNCccT1vb8JrfnTyrbn3Oikk';
const REQUESTS_SHEET = 'Заявки';
const DRIVE_FOLDER_ID = '1jPh67k7PszSG_dfo4O5UBkvJDzrGkrQM';
const MAX_FILES = 2;
const PEK_API_BASE = 'https://kabinet.pecom.ru/api/v1';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'pekTerminals') {
    try {
      return jsonpResponse_(getPekTerminals_((p.location || '').trim()), p.callback);
    } catch (error) {
      console.error(error);
      return jsonpResponse_({ ok: false, terminals: [], error: error.message }, p.callback);
    }
  }
  if (p.action === 'dellinTerminals') {
    try {
      return jsonpResponse_(getDellinTerminals_((p.location || '').trim()), p.callback);
    } catch (error) {
      console.error(error);
      return jsonpResponse_({ ok: false, terminals: [], error: error.message }, p.callback);
    }
  }
  return response_({ ok: true, service: 'alfaprom-shipment-requests' });
}

function getDellinTerminals_(location) {
  if (location.length < 2) throw new Error('Укажите населённый пункт.');

  const properties = PropertiesService.getScriptProperties();
  const appKey = properties.getProperty('DL_API');
  if (!appKey) throw new Error('Добавьте DL_API в свойства сценария.');

  const cache = CacheService.getScriptCache();
  const key = 'dellin:' + location.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 120);
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const response = UrlFetchApp.fetch('https://api.dellin.ru/v1/public/request_terminals.json', {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: JSON.stringify({ appkey: appKey, search: location, direction: 'arrival' }),
    muteHttpExceptions: true
  });
  const httpStatus = response.getResponseCode();
  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('Деловые Линии вернули некорректный ответ.');
  }
  const apiStatus = data.metadata && data.metadata.status;
  if (httpStatus < 200 || httpStatus >= 300 || (apiStatus && apiStatus !== 200)) {
    throw new Error((data.errors && data.errors[0] && data.errors[0].message) || 'Деловые Линии временно недоступны.');
  }

  const terminals = (data.terminals || []).map(function (terminal) {
    return {
      id: String(terminal.id || ''),
      branchId: String(terminal.cityID || ''),
      branchName: terminal.city || '',
      name: terminal.name || 'Терминал Деловых Линий',
      address: terminal.address || '',
      type: 'Терминал Деловых Линий',
      phone: ''
    };
  });
  const output = { ok: true, location: location, terminals: terminals };
  cache.put(key, JSON.stringify(output), 21600);
  return output;
}

function getPekTerminals_(location) {
  if (location.length < 2) throw new Error('Укажите населённый пункт.');

  const cache = CacheService.getScriptCache();
  const key = 'pek:v2:' + location.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 120);
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const result = pekRequest_('/branches/nearestdepartments/', {
    address: location,
    weight: null,
    volume: null,
    maxDimension: null,
    maxWeightPerPlace: null,
    departmentOperation: 3,
    type: 1,
    searchRadius: 100,
    limit: 5
  });

  const seen = {};
  const terminals = (result.freeDepartments || []).concat(result.paidDepartments || [])
    .filter(function (department) {
      const title = String(department.divisionName || department.branchName || '') + ' ' + String(department.address || '');
      const type = String(department.departmentType || '').toLowerCase();
      const isPartnerOrPickupPoint = /пвз|сдэк|cdek|boxberry|боксберри|постамат|ozon|wildberries|яндекс|закр|закрыт/.test(title.toLowerCase()) || /пвз|пункт выдачи/.test(type);
      const isCompanyTerminal = /отделение компании|терминал|склад/.test(type);
      if (!department.warehouseId || seen[department.warehouseId] || isPartnerOrPickupPoint || !isCompanyTerminal) return false;
      seen[department.warehouseId] = true;
      return true;
    })
    .map(function (department) {
      return {
        id: department.warehouseId,
        branchId: department.branchId || '',
        branchName: department.branchName || '',
        name: department.divisionName || department.branchName || 'Терминал ПЭК',
        address: department.address || '',
        type: department.departmentType || '',
        phone: department.phone || ''
      };
    });

  const output = { ok: true, location: location, terminals: terminals };
  cache.put(key, JSON.stringify(output), 21600);
  return output;
}

function pekRequest_(path, payload) {
  const properties = PropertiesService.getScriptProperties();
  const login = properties.getProperty('PEK_LOGIN');
  const apiKey = properties.getProperty('PEK_IP');
  if (!login || !apiKey) throw new Error('Добавьте PEK_LOGIN и PEK_IP в свойства сценария.');

  const response = UrlFetchApp.fetch(PEK_API_BASE + path, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(login + ':' + apiKey), Accept: 'application/json', 'Accept-Encoding': 'gzip' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('ПЭК вернул некорректный ответ.');
  }

  if (status < 200 || status >= 300) {
    throw new Error((data && (data.errorMessage || data.message)) || 'ПЭК временно недоступен.');
  }
  if (data && data.hasError) throw new Error(data.errorMessage || 'ПЭК не смог подобрать терминалы.');
  return data;
}

function jsonpResponse_(payload, callback) {
  const safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback || '') ? callback : '';
  const output = safeCallback ? safeCallback + '(' + JSON.stringify(payload) + ');' : JSON.stringify(payload);
  return ContentService.createTextOutput(output)
    .setMimeType(safeCallback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const request = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (request.action !== 'submit') throw new Error('Неизвестное действие.');

    const result = saveRequest_(request);
    return response_({ ok: true, requestId: result.id });
  } catch (error) {
    console.error(error);
    return response_({ ok: false, error: error.message });
  }
}

function saveRequest_(request) {
  const data = request.data || {};
  const mode = request.mode === 'edo' ? 'edo' : 'signed';
  const id = Utilities.getUuid().slice(0, 8).toUpperCase();
  const createdAt = new Date();
  const buyer = data.customerType === 'legal' ? data.legalName : data.personName;
  const inn = data.customerType === 'legal' ? data.legalInn : '';
  const delivery = data.deliveryType === 'carrier' ? 'Транспортная компания' : 'Самовывоз';
  const files = (request.files || []).slice(0, MAX_FILES);

  if (!buyer) throw new Error('Не заполнен покупатель.');
  if (mode === 'signed' && !files.length) throw new Error('Прикрепите хотя бы один подписанный файл.');

  const root = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const requestFolder = root.createFolder('Заявка ' + id);
  const fileLinks = files.map(function (file) {
    if (!file.name || !file.base64) throw new Error('Не удалось прочитать прикреплённый файл.');
    const bytes = Utilities.base64Decode(file.base64);
    const blob = Utilities.newBlob(bytes, file.mimeType || 'application/octet-stream', file.name);
    const saved = requestFolder.createFile(blob);
    return saved.getUrl();
  });

  const status = mode === 'edo'
    ? 'PDF скачан для отправки через ЭДО'
    : 'Подписанная заявка отправлена';

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REQUESTS_SHEET);
  if (!sheet) throw new Error('Не найден лист «' + REQUESTS_SHEET + '».');

  sheet.appendRow([
    id,
    createdAt,
    inn,
    buyer,
    data.customerType === 'legal' ? 'Юридическое лицо / ИП' : 'Физическое лицо',
    delivery,
    data.carrier || '',
    data.recipient || data.repName || '',
    status,
    request.pdfUrl || '',
    fileLinks.join('\n'),
    '',
    createdAt
  ]);

  sendTelegram_(buildMessage_(id, buyer, status, requestFolder.getUrl(), fileLinks.length));
  return { id: id };
}

function buildMessage_(id, buyer, status, folderUrl, filesCount) {
  return [
    'Новая заявка на отгрузку',
    '№ ' + id,
    'Покупатель: ' + buyer,
    'Статус: ' + status,
    filesCount ? 'Прикреплено файлов: ' + filesCount : '',
    'Папка заявки: ' + folderUrl
  ].filter(Boolean).join('\n');
}

function sendTelegram_(text) {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = properties.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) throw new Error('Добавьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в свойства сценария.');

  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    payload: { chat_id: chatId, text: text },
    muteHttpExceptions: true
  });
  const result = JSON.parse(response.getContentText());
  if (!result.ok) throw new Error('Telegram не принял уведомление: ' + result.description);
}

function response_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}