/**
 * ====================================================================
 * RESPALDO AUTOMÁTICO CAMPITO JOROX -> GOOGLE DRIVE / GOOGLE SHEETS
 * Cuenta: campitojorox@gmail.com
 * Ubicación: Mi unidad / APP CAMPITO JOROX
 *            ├── CAMPITO JOROX DATA (Sheets con Contabilidad y Calendario)
 *            ├── Comprobantes/ (Fotos de tickets por mes)
 *            └── Codigo Fuente/ (ZIP con el código fuente de GitHub)
 * ====================================================================
 */

// ─── CREDENCIALES SUPABASE ───────────────────────────────────────────────────
const SUPABASE_CONFIG = {
  url: 'https://byyqdtcuutfnjdlaewsu.supabase.co',
  serviceKey: 'PEGAR_AQUI_SUPABASE_SERVICE_ROLE_KEY'
};

// ─── CREDENCIALES GITHUB (Para respaldo de código) ───────────────────────────
const GITHUB_CONFIG = {
  owner: 'campitojorox',
  repo: 'campito-app',
  branch: 'main',
  token: 'PEGAR_AQUI_GITHUB_TOKEN'
};

// Carpeta raíz en Google Drive
const DRIVE_FOLDER_NAME = 'APP CAMPITO JOROX';
const IMAGES_SUBFOLDER_NAME = 'Comprobantes';
const CODE_SUBFOLDER_NAME = 'Codigo Fuente';
const CHAT_SUBFOLDER_NAME = 'Chat IA Files';

// ─── MENÚ EN GOOGLE SHEETS ───────────────────────────────────────────────────
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏕️ Campito Jorox')
    .addItem('🔄 Sincronizar datos + imágenes ahora', 'actualizarCampitoJorox')
    .addItem('📦 Respaldar código de la app (ZIP) ahora', 'respaldarCodigoGitHubMenu')
    .addItem('🖼️ Respaldar imágenes de contabilidad solamente', 'respaldarImagenes')
    .addItem('💬 Respaldar Chat IA (Conversaciones + Archivos)', 'respaldarChatIAMenu')
    .addSeparator()
    .addItem('⏰ Activar Respaldo Automático Semanal (Lunes 04:00 AM)', 'activarRespaldoSemanal')
    .addSeparator()
    .addItem('❌ Desactivar Respaldo Automático', 'desactivarRespaldoAutomatico')
    .addToUi();
}

// ─── WEBHOOK: SE EJECUTA AUTOMÁTICAMENTE EN CADA "GIT PUSH" ──────────────────
/**
 * Cada vez que haces "git push", GitHub llama a esta función vía Webhook.
 * Descarga y guarda el ZIP con el código más reciente en Google Drive.
 */
function doPost(e) {
  try {
    const res = respaldarCodigoGitHub();
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', detail: res }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput("✅ Webhook de Campito Jorox activo y listo para recibir eventos de GitHub.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// ─── RESPALDO DEL CÓDIGO FUENTE DESDE GITHUB ─────────────────────────────────
function respaldarCodigoGitHubMenu() {
  const res = respaldarCodigoGitHub();
  SpreadsheetApp.getUi().alert('📦 Respaldo de Código Completado\n\n' + res);
}

function respaldarCodigoGitHub() {
  Logger.log('Descargando código de GitHub...');
  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/zipball/${GITHUB_CONFIG.branch}`;
  
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + GITHUB_CONFIG.token,
      'User-Agent': 'CampitoJorox-Backup-Script'
    },
    followRedirects: true,
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  if (statusCode !== 200) {
    throw new Error('Error al conectar con GitHub (' + statusCode + '): ' + response.getContentText());
  }

  const rootFolders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (!rootFolders.hasNext()) {
    throw new Error('No se encontró la carpeta "' + DRIVE_FOLDER_NAME + '" en tu Google Drive.');
  }
  const rootFolder = rootFolders.next();

  // Carpeta: APP CAMPITO JOROX / Codigo Fuente
  const codeFolder = obtenerOCrearSubcarpeta(rootFolder, CODE_SUBFOLDER_NAME);

  const fechaHoy = Utilities.formatDate(new Date(), 'GMT+1', 'yyyy-MM-dd_HHmm');
  const blob = response.getBlob();

  // 1. Guardar o reemplazar "campito-app-latest.zip" (siempre la versión más reciente)
  const existingLatest = codeFolder.getFilesByName('campito-app-latest.zip');
  while (existingLatest.hasNext()) {
    existingLatest.next().setTrashed(true);
  }
  const latestFile = codeFolder.createFile(blob.setName('campito-app-latest.zip'));

  // 2. Guardar en histórico de versiones
  const historicoFolder = obtenerOCrearSubcarpeta(codeFolder, 'Versiones Anteriores');
  historicoFolder.createFile(blob.setName(`campito-app-${fechaHoy}.zip`));

  const msg = `Guardado en Drive:\n• ${latestFile.getName()} (Versión más reciente)\n• campito-app-${fechaHoy}.zip (Histórico)`;
  Logger.log(msg);
  return msg;
}

// ─── SINCRONIZACIÓN DE DATOS (SUPABASE -> SHEETS + DRIVE) ─────────────────────
function actualizarCampitoJorox() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. OBTENER TRANSACCIONES
  Logger.log('Descargando transacciones...');
  const txUrl = SUPABASE_CONFIG.url + '/rest/v1/transactions?select=*,profiles(name)&order=date.desc';
  const txRes = UrlFetchApp.fetch(txUrl, {
    method: 'get',
    headers: {
      'apikey': SUPABASE_CONFIG.serviceKey,
      'Authorization': 'Bearer ' + SUPABASE_CONFIG.serviceKey
    },
    muteHttpExceptions: true
  });

  if (txRes.getResponseCode() !== 200) {
    throw new Error('Error al conectar con transacciones: ' + txRes.getContentText());
  }
  const transactions = JSON.parse(txRes.getContentText());

  // 2. OBTENER EVENTOS
  Logger.log('Descargando eventos...');
  const evUrl = SUPABASE_CONFIG.url + '/rest/v1/events?select=*,profiles:responsible_id(name)&order=date.desc';
  const evRes = UrlFetchApp.fetch(evUrl, {
    method: 'get',
    headers: {
      'apikey': SUPABASE_CONFIG.serviceKey,
      'Authorization': 'Bearer ' + SUPABASE_CONFIG.serviceKey
    },
    muteHttpExceptions: true
  });

  if (evRes.getResponseCode() !== 200) {
    throw new Error('Error al conectar con eventos: ' + evRes.getContentText());
  }
  const events = JSON.parse(evRes.getContentText());

  // 3. ACTUALIZAR HOJA 'CONTABILIDAD'
  let sheetCont = ss.getSheetByName('CONTABILIDAD');
  if (!sheetCont) sheetCont = ss.insertSheet('CONTABILIDAD');
  sheetCont.clearContents();

  const contHeaders = ['TransactionID', 'Fecha', 'Usuario', 'Categoría', 'Monto', 'Descripción', 'UserID', 'URL Imagen', 'Archivo en Drive', 'Estado', 'Fecha Eliminado'];
  const contRows = [contHeaders];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const dateStr = tx.date ? tx.date.split('T')[0] : '';
    const userStr = (tx.profiles && tx.profiles.name) ? tx.profiles.name : '';
    contRows.push([
      tx.id || '',
      dateStr,
      userStr,
      tx.type || '',
      tx.amount || 0,
      tx.description || '',
      tx.user_id || '',
      tx.image_url || '',
      '',
      tx.status || 'ACTIVE',
      tx.deleted_at || ''
    ]);
  }

  sheetCont.getRange(1, 1, contRows.length, contHeaders.length).setValues(contRows);
  formatearEncabezado(sheetCont, contHeaders.length);

  // 4. ACTUALIZAR HOJA 'CALENDARIO'
  let sheetCal = ss.getSheetByName('CALENDARIO');
  if (!sheetCal) sheetCal = ss.insertSheet('CALENDARIO');
  sheetCal.clearContents();

  const calHeaders = ['EventID', 'Fecha', 'Fecha Fin', 'Hora Inicio', 'Hora Fin', 'Responsable', 'Categoría', 'Info', 'UserID', 'CalendarID'];
  const calRows = [calHeaders];

  for (let j = 0; j < events.length; j++) {
    const ev = events[j];
    const dateStr = ev.date ? ev.date.split('T')[0] : '';
    const endDateStr = ev.end_date ? ev.end_date.split('T')[0] : dateStr;
    const respStr = (ev.responsibles && ev.responsibles.length > 0)
      ? ev.responsibles.join(', ')
      : ((ev.profiles && ev.profiles.name) ? ev.profiles.name : '');

    calRows.push([
      ev.id || '',
      dateStr,
      endDateStr,
      ev.start_time || '',
      ev.end_time || '',
      respStr,
      ev.category || '',
      ev.info || '',
      ev.responsible_id || '',
      'campitojorox@gmail.com'
    ]);
  }

  sheetCal.getRange(1, 1, calRows.length, calHeaders.length).setValues(calRows);
  formatearEncabezado(sheetCal, calHeaders.length);

  // 4b. ACTUALIZAR HOJA 'CHAT_IA' (HISTORIAL DE CONVERSACIONES)
  let chatMessages = [];
  try {
    Logger.log('Descargando historial de Chat IA...');
    const chatUrl = SUPABASE_CONFIG.url + '/rest/v1/chat_history?select=*&order=created_at.desc&limit=2000';
    const chatRes = UrlFetchApp.fetch(chatUrl, {
      method: 'get',
      headers: {
        'apikey': SUPABASE_CONFIG.serviceKey,
        'Authorization': 'Bearer ' + SUPABASE_CONFIG.serviceKey
      },
      muteHttpExceptions: true
    });
    if (chatRes.getResponseCode() === 200) {
      chatMessages = JSON.parse(chatRes.getContentText());
      sincronizarHojaChatIA(ss, chatMessages);
    }
  } catch (chatErr) {
    Logger.log('Aviso al sincronizar Chat IA: ' + chatErr.message);
  }

  // 5. DESCARGAR IMÁGENES DE CONTABILIDAD A DRIVE
  Logger.log('Descargando comprobantes a Google Drive...');
  const imagenesGuardadas = respaldarImagenesInterno(transactions, sheetCont);

  // 5b. DESCARGAR ARCHIVOS E IMÁGENES DE CHAT IA A 'Chat IA Files'
  let chatArchivosGuardados = 0;
  try {
    Logger.log('Descargando archivos de Chat IA a Google Drive...');
    chatArchivosGuardados = respaldarArchivosChatIAInterno(chatMessages);
  } catch (chatFilesErr) {
    Logger.log('Aviso al respaldar archivos de Chat IA: ' + chatFilesErr.message);
  }

  // 6. RESPALDAR CÓDIGO FUENTE DE GITHUB TAMBIÉN
  try {
    respaldarCodigoGitHub();
  } catch (codeErr) {
    Logger.log('Aviso al respaldar código: ' + codeErr.message);
  }

  const msg = '✅ Sincronización completada:\n' +
    '• ' + transactions.length + ' transacciones\n' +
    '• ' + events.length + ' eventos\n' +
    '• ' + chatMessages.length + ' mensajes de Chat IA guardados\n' +
    '• ' + imagenesGuardadas + ' comprobantes en Drive\n' +
    '• ' + chatArchivosGuardados + ' archivos en "Chat IA Files/"\n' +
    '• Código fuente respaldado en "Codigo Fuente/"';
  Logger.log(msg);

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, '🏕️ Campito Jorox', 8);
  } catch (e) {}
}

// ─── HOJA CHAT IA EN SHEETS ──────────────────────────────────────────────────
function sincronizarHojaChatIA(ss, chatMessages) {
  let sheetChat = ss.getSheetByName('CHAT_IA');
  if (!sheetChat) sheetChat = ss.insertSheet('CHAT_IA');
  sheetChat.clearContents();

  const chatHeaders = ['MessageID', 'Fecha', 'Hora', 'Usuario', 'Rol', 'Mensaje', 'Modelo IA', 'URL Archivo', 'Archivo en Drive'];
  const chatRows = [chatHeaders];

  for (let k = 0; k < chatMessages.length; k++) {
    const msg = chatMessages[k];
    const created = msg.created_at || '';
    const dateStr = created ? created.split('T')[0] : '';
    const timeStr = created ? (created.split('T')[1] || '').substring(0, 8) : '';

    chatRows.push([
      msg.id || '',
      dateStr,
      timeStr,
      msg.user_name || 'Admin',
      msg.role || 'user',
      msg.content || '',
      msg.model_used || '',
      msg.file_url || '',
      ''
    ]);
  }

  sheetChat.getRange(1, 1, chatRows.length, chatHeaders.length).setValues(chatRows);
  formatearEncabezado(sheetChat, chatHeaders.length);
}

// ─── RESPALDO INDEPENDIENTE DE CHAT IA DESDE EL MENÚ ─────────────────────────
function respaldarChatIAMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const chatUrl = SUPABASE_CONFIG.url + '/rest/v1/chat_history?select=*&order=created_at.desc&limit=2000';
  const chatRes = UrlFetchApp.fetch(chatUrl, {
    method: 'get',
    headers: {
      'apikey': SUPABASE_CONFIG.serviceKey,
      'Authorization': 'Bearer ' + SUPABASE_CONFIG.serviceKey
    },
    muteHttpExceptions: true
  });

  if (chatRes.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert('❌ Error al conectar con Chat IA en Supabase: ' + chatRes.getContentText());
    return;
  }

  const chatMessages = JSON.parse(chatRes.getContentText());
  sincronizarHojaChatIA(ss, chatMessages);
  const guardados = respaldarArchivosChatIAInterno(chatMessages);

  SpreadsheetApp.getUi().alert(
    '💬 Respaldo de Chat IA completado:\n\n' +
    '• ' + chatMessages.length + ' mensajes guardados en la pestaña "CHAT_IA"\n' +
    '• ' + guardados + ' archivos/imágenes respaldados en:\n' +
    'Mi unidad / APP CAMPITO JOROX / ' + CHAT_SUBFOLDER_NAME + '/'
  );
}

// ─── DESCARGA DE ARCHIVOS/FOTOS DE CHAT IA A GOOGLE DRIVE ────────────────────
function respaldarArchivosChatIAInterno(chatMessages) {
  if (!chatMessages || chatMessages.length === 0) return 0;

  const rootFolders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (!rootFolders.hasNext()) {
    Logger.log('❌ No se encontró la carpeta "' + DRIVE_FOLDER_NAME + '" en Google Drive.');
    return 0;
  }
  const rootFolder = rootFolders.next();
  const chatFolder = obtenerOCrearSubcarpeta(rootFolder, CHAT_SUBFOLDER_NAME);

  let count = 0;

  for (let i = 0; i < chatMessages.length; i++) {
    const item = chatMessages[i];
    if (!item.file_url || !item.file_url.startsWith('https://')) continue;

    try {
      const datePrefix = item.created_at ? item.created_at.split('T')[0] : 'sin-fecha';
      const monthFolder = datePrefix.substring(0, 7);
      const ext = item.file_name ? item.file_name.split('.').pop() : 'jpg';
      const fileName = datePrefix + '-' + item.id + '-chat.' + ext;

      const mesFolder = obtenerOCrearSubcarpeta(chatFolder, monthFolder);

      // Si ya existe en Drive, saltar
      const existing = mesFolder.getFilesByName(fileName);
      if (existing.hasNext()) {
        continue;
      }

      const fileRes = UrlFetchApp.fetch(item.file_url, { muteHttpExceptions: true });
      if (fileRes.getResponseCode() !== 200) continue;

      const contentType = fileRes.getHeaders()['Content-Type'] || 'image/jpeg';
      const blob = fileRes.getBlob().setName(fileName).setContentType(contentType);
      mesFolder.createFile(blob);
      count++;
    } catch (err) {
      Logger.log('Error descargando archivo de chat ' + item.id + ': ' + err.message);
    }
  }

  return count;
}

// ─── RESPALDO INDEPENDIENTE DE IMÁGENES ──────────────────────────────────────
function respaldarImagenes() {
  const txUrl = SUPABASE_CONFIG.url + '/rest/v1/transactions?select=id,date,image_url&image_url=not.is.null&order=date.desc';
  const txRes = UrlFetchApp.fetch(txUrl, {
    method: 'get',
    headers: {
      'apikey': SUPABASE_CONFIG.serviceKey,
      'Authorization': 'Bearer ' + SUPABASE_CONFIG.serviceKey
    },
    muteHttpExceptions: true
  });

  if (txRes.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert('❌ Error al conectar con Supabase: ' + txRes.getContentText());
    return;
  }

  const transactions = JSON.parse(txRes.getContentText());
  const count = respaldarImagenesInterno(transactions, null);

  SpreadsheetApp.getUi().alert(
    '🖼️ Respaldo de imágenes completado\n\n' +
    '• ' + count + ' imágenes guardadas en:\n' +
    'Mi unidad / APP CAMPITO JOROX / Comprobantes/'
  );
}

function respaldarImagenesInterno(transactions, sheet) {
  const rootFolders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (!rootFolders.hasNext()) {
    Logger.log('❌ No se encontró la carpeta "' + DRIVE_FOLDER_NAME + '" en Google Drive.');
    return 0;
  }
  const rootFolder = rootFolders.next();
  const compFolder = obtenerOCrearSubcarpeta(rootFolder, IMAGES_SUBFOLDER_NAME);

  let count = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx.image_url) continue;

    // Solo procesar URLs válidas de Supabase Storage
    if (!tx.image_url.startsWith('https://')) {
      Logger.log('  ⚠️ URL inválida, saltando: ' + tx.image_url);
      continue;
    }

    try {
      const datePrefix = tx.date ? tx.date.split('T')[0] : 'sin-fecha';
      const monthFolder = datePrefix.substring(0, 7);
      const fileName = datePrefix + '-' + tx.id + '-comprobante.jpg';

      const mesFolder = obtenerOCrearSubcarpeta(compFolder, monthFolder);

      // Verificar si ya existe en Drive para no duplicar
      const existing = mesFolder.getFilesByName(fileName);
      if (existing.hasNext()) {
        if (sheet) {
          const driveUrl = existing.next().getUrl();
          actualizarCeldaDrive(sheet, tx.id, driveUrl);
        }
        continue;
      }

      const imgRes = UrlFetchApp.fetch(tx.image_url, { muteHttpExceptions: true });
      if (imgRes.getResponseCode() !== 200) continue;

      const contentType = imgRes.getHeaders()['Content-Type'] || 'image/jpeg';
      const blob = imgRes.getBlob().setName(fileName).setContentType(contentType);
      const file = mesFolder.createFile(blob);

      if (sheet) {
        actualizarCeldaDrive(sheet, tx.id, file.getUrl());
      }

      count++;
    } catch (err) {
      Logger.log('  ❌ Error con transacción ' + tx.id + ': ' + err.message);
    }
  }

  return count;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function obtenerOCrearSubcarpeta(parentFolder, name) {
  const subs = parentFolder.getFoldersByName(name);
  if (subs.hasNext()) return subs.next();
  return parentFolder.createFolder(name);
}

function actualizarCeldaDrive(sheet, txId, driveUrl) {
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(txId)) {
      sheet.getRange(r + 1, 9).setValue(driveUrl);
      return;
    }
  }
}

function formatearEncabezado(sheet, numCols) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2b3d41');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

// ─── TEMPORIZADORES ──────────────────────────────────────────────────────────
function activarRespaldoSemanal() {
  desactivarRespaldoAutomatico();
  ScriptApp.newTrigger('actualizarCampitoJorox')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(4)
    .create();

  SpreadsheetApp.getUi().alert(
    '✅ Respaldo semanal activado.\n' +
    'Se ejecutará todos los lunes a las 04:00 AM.\n' +
    'Incluye datos, imágenes y código fuente.'
  );
}

function desactivarRespaldoAutomatico() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'actualizarCampitoJorox') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('Activadores automáticos desactivados.', '🏕️ Campito Jorox', 4);
  } catch (e) {}
}
