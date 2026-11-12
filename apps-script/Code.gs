const SPREADSHEET_ID = '1bsYAQg6CbPhBcREOwoqlNCccT1vb8JrfnTyrbn3Oikk';
const REQUESTS_SHEET = 'Заявки';
const DRIVE_FOLDER_ID = '1jPh67k7PszSG_dfo4O5UBkvJDzrGkrQM';
const MAX_FILES = 2;
const PEK_API_BASE = 'https://kabinet.pecom.ru/api/v1';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if(p.action === 'health') return jsonpResponse_({ok:true,protocol:2,service:'alfaprom-shipment-requests'},p.callback);
  if(p.action === 'requestStatus') {
    try { return jsonpResponse_(getRequestStatus_(p),p.callback); }
    catch(error) { return jsonpResponse_({ok:false,error:'Не удалось проверить приём заявки. Повторите попытку.'},p.callback); }
  }
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
  if (p.action === 'cdekTerminals') {
    try {
      return jsonpResponse_(getCdekTerminals_((p.location || '').trim()), p.callback);
    } catch (error) {
      console.error(error);
      return jsonpResponse_({ ok: false, terminals: [], error: error.message }, p.callback);
    }
  }
  if (p.action === 'jdeTerminals') {
    try {
      return jsonpResponse_(getJdeTerminals_((p.location || '').trim()), p.callback);
    } catch (error) {
      console.error(error);
      return jsonpResponse_({ ok: false, terminals: [], error: error.message }, p.callback);
    }
  }
  return jsonpResponse_({ok:true,protocol:2,service:'alfaprom-shipment-requests'},p.callback);
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

function getCdekTerminals_(location) {
  if (location.length < 2) throw new Error('Укажите населённый пункт.');

  const cache = CacheService.getScriptCache();
  const key = 'cdek:ltd:' + cacheKey_(location);
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const token = getCdekToken_();
  const cities = cdekGet_('/location/cities?country_codes=RU&size=10&city=' + encodeURIComponent(cityName_(location)), token);
  if (!cities.length) throw new Error('СДЭК не нашёл указанный населённый пункт.');

  const wanted = normalizeName_(cityName_(location));
  const city = cities.filter(function (item) {
    return normalizeName_(item.city || '') === wanted;
  })[0] || cities[0];

  const points = cdekGet_('/deliverypoints?city_code=' + encodeURIComponent(city.code) + '&type=ALL&size=1000', token);
  const terminals = points.filter(function (point) {
    return point.is_ltl === true &&
      point.is_handout !== false &&
      point.is_marketplace !== true &&
      String(point.type || '').toUpperCase() !== 'POSTAMAT';
  }).map(function (point) {
    return {
      id: String(point.code || ''),
      branchId: String(city.code || ''),
      branchName: city.city || location,
      name: point.name || 'Грузовой терминал СДЭК',
      address: point.location && point.location.address_full || point.address || '',
      type: point.type || 'Грузовой терминал СДЭК',
      phone: point.phones && point.phones[0] && point.phones[0].number || ''
    };
  });

  const output = { ok: true, location: location, terminals: terminals };
  cache.put(key, JSON.stringify(output), 21600);
  return output;
}

function getCdekToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('cdek:token');
  if (cached) return cached;

  const properties = PropertiesService.getScriptProperties();
  const clientId = properties.getProperty('SDEK_IDENT');
  const clientSecret = properties.getProperty('SDEK_PAROL');
  if (!clientId || !clientSecret) throw new Error('Добавьте SDEK_IDENT и SDEK_PAROL в свойства сценария.');

  const response = UrlFetchApp.fetch('https://api.cdek.ru/v2/oauth/token', {
    method: 'post',
    payload: {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    },
    muteHttpExceptions: true
  });
  let result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('СДЭК вернул некорректный ответ при авторизации.');
  }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !result.access_token) {
    throw new Error(result.message || 'Не удалось авторизоваться в СДЭК.');
  }

  const ttl = Math.max(60, Math.min(Number(result.expires_in || 3600) - 120, 3300));
  cache.put('cdek:token', result.access_token, ttl);
  return result.access_token;
}

function cdekGet_(path, token) {
  const response = UrlFetchApp.fetch('https://api.cdek.ru/v2' + path, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    muteHttpExceptions: true
  });
  let result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('СДЭК вернул некорректный ответ.');
  }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    const message = result && (result.message || result.error && result.error.message);
    throw new Error(message || 'СДЭК временно недоступен.');
  }
  return result;
}

function getJdeTerminals_(location) {
  if (location.length < 2) throw new Error('Укажите населённый пункт.');

  const cache = CacheService.getScriptCache();
  const key = 'jde:' + cacheKey_(location);
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const cities = jdeGet_('/geo/SearchCity?mode=2');
  const wanted = normalizeName_(cityName_(location));
  const city = cities.filter(function (item) {
    return normalizeName_(item.title || '') === wanted;
  })[0] || cities.filter(function (item) {
    return normalizeName_(item.title || '').indexOf(wanted) === 0;
  })[0];

  if (!city || !city.kladr_code) throw new Error('ЖДЭ не нашла указанный населённый пункт.');

  const terminals = jdeGet_('/geo/MstByKladr?' + toQuery_({
    kladr_code: city.kladr_code,
    mst_count: 10,
    mst_out: 1,
    mst_distance: 150000,
    near_kg: 0
  })).filter(function (item) {
    return item.output === 1 && item.MST_PR_VIRT !== 1;
  }).map(function (item) {
    return {
      id: String(item.code || ''),
      branchId: String(city.code || ''),
      branchName: item.title || city.title || location,
      name: item.title || 'Терминал ЖелДорЭкспедиции',
      address: item.addr || '',
      type: 'Грузовой терминал ЖелДорЭкспедиции',
      phone: ''
    };
  });

  const output = { ok: true, location: location, terminals: terminals };
  cache.put(key, JSON.stringify(output), 21600);
  return output;
}

function jdeGet_(path) {
  const properties = PropertiesService.getScriptProperties();
  const user = properties.getProperty('JDE_IDENT');
  const token = properties.getProperty('JDE_API');
  if (!user || !token) throw new Error('Добавьте JDE_IDENT и JDE_API в свойства сценария.');

  const separator = path.indexOf('?') === -1 ? '?' : '&';
  const response = UrlFetchApp.fetch('https://api.jde.ru/vD' + path + separator + toQuery_({ user: user, token: token }), {
    muteHttpExceptions: true
  });
  let result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('ЖДЭ вернула некорректный ответ.');
  }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !Array.isArray(result)) {
    throw new Error(result && (result.message || result.error) || 'ЖДЭ временно недоступна.');
  }
  return result;
}

function cityName_(location) {
  return String(location || '').split('—')[0].trim();
}

function normalizeName_(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/gi, '');
}

function cacheKey_(value) {
  return String(value || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 120);
}

function toQuery_(params) {
  return Object.keys(params).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
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

function statusCredentials_(request) {
  return /^[a-f0-9-]{36}$/i.test(String(request.submissionId || '')) && /^[a-f0-9]{32}$/i.test(String(request.statusToken || ''));
}
function digest_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)).replace(/=+$/g,'');
}
function statusCacheKey_(request) { return 'status:v2:' + request.submissionId + ':' + digest_(request.statusToken); }
function requestsSheet_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REQUESTS_SHEET);
  if (!sheet) throw new Error('Не найден реестр заявок. Обратитесь к менеджеру.');
  return sheet;
}
function findSubmission_(sheet, submissionId) {
  if (sheet.getLastRow() < 2) return null;
  const cell = sheet.getRange(2,14,sheet.getLastRow()-1,1).createTextFinder(submissionId).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : null;
}
function getRequestStatus_(request) {
  if (!statusCredentials_(request)) return {ok:false,error:'Некорректный идентификатор подтверждения.'};
  const cached = CacheService.getScriptCache().get(statusCacheKey_(request));
  if (cached) return JSON.parse(cached);
  const sheet = requestsSheet_(), row = findSubmission_(sheet,request.submissionId);
  if (!row) return {ok:true,received:false};
  const record = sheet.getRange(row,1,1,18).getValues()[0];
  if (record[14] !== digest_(request.statusToken)) return {ok:true,received:false};
  return {ok:true,received:true,requestId:String(record[0]),notification:record[15] || 'pending'};
}
function decodeAttachment_(file, generated) {
  if (!file || typeof file.name !== 'string' || file.name.length > 200 || typeof file.base64 !== 'string') throw new Error('Некорректный файл.');
  const name = file.name.replace(/[\/\\\x00-\x1f]/g,'_');
  const ext = name.split('.').pop().toLowerCase();
  const mime = ShipmentRules.mime[ext];
  const limit = generated ? 8*1024*1024 : ShipmentRules.maxFileBytes;
  if (!mime || file.mimeType !== mime || (generated && ext !== 'pdf')) throw new Error('Допустимы только PDF, JPG и PNG.');
  if (file.base64.length > Math.ceil(limit/3)*4+4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) throw new Error('Файл слишком большой или повреждён.');
  const bytes = Utilities.base64Decode(file.base64);
  if (!bytes.length || bytes.length > limit) throw new Error('Файл должен быть непустым и не больше ' + (generated ? 8 : 10) + ' МБ.');
  const u = bytes.map(function(b){return (b+256)%256;});
  const pdf = u[0]===37 && u[1]===80 && u[2]===68 && u[3]===70 && u[4]===45;
  const jpg = u[0]===255 && u[1]===216 && u[2]===255;
  const png = u[0]===137 && u[1]===80 && u[2]===78 && u[3]===71 && u[4]===13 && u[5]===10 && u[6]===26 && u[7]===10;
  if (!(ext==='pdf'?pdf:ext==='png'?png:jpg)) throw new Error('Содержимое файла не соответствует его формату.');
  return {name:name,mime:mime,bytes:bytes};
}
function saveFileOnce_(folder, file) {
  const existing=folder.getFilesByName(file.name);
  if(existing.hasNext())return existing.next();
  return folder.createFile(Utilities.newBlob(file.bytes,file.mime,file.name));
}
function sheetText_(value) {
  const s = String(value == null ? '' : value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function saveRequest_(request) {
  if (request.protocol !== 2 || !statusCredentials_(request)) throw new Error('Обновите страницу перед отправкой заявки.');
  if (['signed','edo'].indexOf(request.mode)<0) throw new Error('Неизвестный способ подписания.');
  const data=request.data;
  if (!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Не переданы данные заявки.');
  const issues=ShipmentRules.errors(data);
  if(issues.length)throw new Error(issues[0].message);
  if((request.mode==='edo')!==(data.signMethod==='edo'))throw new Error('Способ подписания не совпадает с заявкой.');
  if(!Array.isArray(request.files)||request.files.length>MAX_FILES||(request.mode==='signed'&&!request.files.length)||(request.mode==='edo'&&request.files.length))throw new Error('Для подписанной заявки прикрепите один или два файла.');
  const files=request.files.map(function(file){return decodeAttachment_(file,false);});
  const names={};files.forEach(function(file){if(names[file.name])throw new Error('Файлы должны иметь разные имена.');names[file.name]=true;});
  if(files.reduce(function(sum,file){return sum+file.bytes.length;},0)>ShipmentRules.maxTotalBytes)throw new Error('Общий размер вложений превышает 20 МБ.');
  const documentFile=decodeAttachment_(request.generatedPdf,true);
  documentFile.name='Заявка на отгрузку — сформированная.pdf';
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  let result, row, sheet, folder;
  try {
    sheet=requestsSheet_();
    if(sheet.getMaxColumns()<18)sheet.insertColumnsAfter(sheet.getMaxColumns(),18-sheet.getMaxColumns());
    const existing=findSubmission_(sheet,request.submissionId);
    if(existing){
      const record=sheet.getRange(existing,1,1,18).getValues()[0];
      if(record[14]!==digest_(request.statusToken))throw new Error('Идентификатор заявки уже используется.');
      return {ok:true,received:true,requestId:String(record[0]),notification:record[15]||'pending'};
    }
    sheet.getRange(1,14,1,5).setValues([['Идентификатор отправки','Ключ подтверждения (хеш)','Уведомление','Папка заявки','Обновление уведомления']]);
    const id=request.submissionId.replace(/-/g,'').slice(0,12).toUpperCase();
    const root=DriveApp.getFolderById(DRIVE_FOLDER_ID),folderName='Заявка '+id;
    const folders=root.getFoldersByName(folderName);folder=folders.hasNext()?folders.next():root.createFolder(folderName);
    const documentUrl=saveFileOnce_(folder,documentFile).getUrl();
    const links=files.map(function(file,index){file.name=(index+1)+' — '+file.name;return saveFileOnce_(folder,file).getUrl();});
    const details={name:'Данные заявки.json',mime:'application/json',bytes:Utilities.newBlob(JSON.stringify(data,null,2)).getBytes()};
    saveFileOnce_(folder,details);
    const createdAt=new Date(), buyer=data.customerType==='legal'?data.legalName:data.personName;
    const recipient=data.deliveryType==='carrier'?ShipmentRules.recipient(data).name:data.repName;
    const status=request.mode==='edo'?'Подготовлена для ЭДО; подпись и отправка через оператора выполняются клиентом':'Подписанная заявка принята';
    sheet.appendRow([id,createdAt,sheetText_(data.customerType==='legal'?data.legalInn:''),sheetText_(buyer),data.customerType==='legal'?'Юридическое лицо / ИП':'Физическое лицо',data.deliveryType==='carrier'?'Транспортная компания':'Самовывоз',sheetText_(data.deliveryType==='carrier'?(data.carrier==='Другая'?data.carrierOther:data.carrier):''),sheetText_(recipient),status,documentUrl,links.join('\n'),'',createdAt,request.submissionId,digest_(request.statusToken),'pending',folder.getUrl(),createdAt]);
    row=sheet.getLastRow();SpreadsheetApp.flush();
    result={ok:true,received:true,requestId:id,notification:'pending'};
  } finally {lock.releaseLock();}
  try {
    const buyer=data.customerType==='legal'?data.legalName:data.personName;
    sendTelegram_(buildMessage_(result.requestId,buyer,request.mode==='edo'?'Заявка подготовлена для ЭДО':'Подписанная заявка принята',folder.getUrl(),files.length));
    result.notification='sent';
  } catch(error) {
    // A notification failure must never roll back or duplicate a saved request.
    console.error('Не удалось отправить уведомление по заявке '+result.requestId);
    result.notification='failed';
  }
  try{sheet.getRange(row,16).setValue(result.notification);sheet.getRange(row,18).setValue(new Date());}catch(error){console.error('Не удалось обновить статус уведомления '+result.requestId);}
  return result;
}
function doPost(e) {
  let request;
  try {
    const contents=(e&&e.postData&&e.postData.contents)||'';
    if(contents.length>42*1024*1024)throw new Error('Слишком большой размер отправки.');
    request=JSON.parse(contents||'{}');
    if(request.action!=='submit')throw new Error('Неизвестное действие.');
    const saved=saveRequest_(request);
    CacheService.getScriptCache().remove(statusCacheKey_(request));
    return response_(saved);
  } catch(error) {
    if(request&&statusCredentials_(request)){
      try{CacheService.getScriptCache().put(statusCacheKey_(request),JSON.stringify({ok:false,error:error.message}),120);}catch(_){}
    }
    return response_({ok:false,error:error.message});
  }
}
function buildMessage_(id,buyer,status,folderUrl,filesCount) {
  return ['Новая заявка на отгрузку','№ '+id,'Покупатель: '+buyer,'Статус: '+status,filesCount?'Подписанных файлов: '+filesCount:'','Папка заявки: '+folderUrl].filter(Boolean).join('\n');
}
function sendTelegram_(text) {
  const properties=PropertiesService.getScriptProperties(),token=properties.getProperty('TELEGRAM_BOT_TOKEN'),chatId=properties.getProperty('TELEGRAM_CHAT_ID');
  if(!token||!chatId)throw new Error('Не настроено уведомление.');
  const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',payload:{chat_id:chatId,text:text},muteHttpExceptions:true});
  const result=JSON.parse(response.getContentText());
  if(!result.ok)throw new Error('Уведомление не принято.');
}
function response_(payload) {return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);}

// BEGIN SHARED VALIDATION
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

// END SHARED VALIDATION
