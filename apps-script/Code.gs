const SPREADSHEET_ID = '1bsYAQg6CbPhBcREOwoqlNCccT1vb8JrfnTyrbn3Oikk';
const REQUESTS_SHEET = 'Заявки';
const DRIVE_FOLDER_ID = '1jPh67k7PszSG_dfo4O5UBkvJDzrGkrQM';
const MAX_FILES = 2;

function doGet() {
  return response_({ ok: true, service: 'alfaprom-shipment-requests' });
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