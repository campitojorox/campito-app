/**
 * ====================================================================
 * RESPALDO AUTOMÁTICO CAMPITO JOROX -> GOOGLE DRIVE / GOOGLE SHEETS
 * Cuenta: campitojorox@gmail.com
 * Ubicación: Mi unidad / APP CAMPITO JOROX
 *            └── Comprobantes/   ← imágenes de transacciones
 * ====================================================================
 *
 * INSTRUCCIONES:
 * 1. En Google Drive (con campitojorox@gmail.com), ve a "Mi unidad / APP CAMPITO JOROX".
 * 2. Abre tu archivo de datos "CAMPITO JOROX DATA" con "Hojas de cálculo de Google".
 * 3. En el menú superior ve a: Extensiones > Apps Script.
 * 4. Borra todo lo que haya y pega este código completo.
 * 5. Sustituye 'PEGAR_AQUI_SUPABASE_SERVICE_ROLE_KEY' por la key real.
 * 6. Haz clic en "Guardar".
 * 7. Selecciona la función "actualizarCampitoJorox" y pulsa "Ejecutar".
 *    (Google te pedirá autorizar los permisos una sola vez).
 *
 * Las imágenes se guardarán en:
 *   Mi unidad / APP CAMPITO JOROX / Comprobantes / [año-mes] /
 *     [fecha]-[ID]-comprobante.jpg
 *
 * ¡A partir de ese momento aparecerá el menú "🏕️ Campito Jorox" en tu hoja!
 */

// ─── CREDENCIALES ────────────────────────────────────────────────────────────
const SUPABASE_CONFIG = {
  url: 'https://byyqdtcuutfnjdlaewsu.supabase.co',
  serviceKey: 'PEGAR_AQUI_SUPABASE_SERVICE_ROLE_KEY'
};

// Nombre de la carpeta raíz en Drive (debe existir ya en tu Mi unidad)
const DRIVE_FOLDER_NAME = 'APP CAMPITO JOROX';

// Nombre de la subcarpeta donde se guardarán las imágenes
const IMAGES_SUBFOLDER_NAME = 'Comprobantes';

// ─── MENÚ ─────────────────────────────────────────────────────────────────────
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏕️ Campito Jorox')
    .addItem('🔄 Sincronizar datos + imágenes ahora', 'actualizarCampitoJorox')
    .addItem('🖼️ Respaldar imágenes solamente', 'respaldarImagenes')
    .addSeparator()
    .addItem('⏰ Activar Respaldo Automático Semanal (Lunes 04:00 AM)', 'activarRespaldoSemanal')
    .addSeparator()
    .addItem('❌ Desactivar Respaldo Automático', 'desactivarRespaldoAutomatico')
    .addToUi();
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
/**
 * Sincroniza datos de Supabase → Sheets Y descarga imágenes → Drive
 */
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

  const contHeaders = ['TransactionID', 'Fecha', 'Usuario', 'Categoría', 'Monto', 'Descripción', 'UserID', 'URL Imagen', 'Archivo en Drive'];
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
      ''  // columna "Archivo en Drive" se llena después
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

  // 5. DESCARGAR IMÁGENES A DRIVE
  Logger.log('Descargando imágenes a Google Drive...');
  const imagenesGuardadas = respaldarImagenesInterno(transactions, sheetCont);

  // Resumen final
  const msg = '✅ Sincronización completada:\n' +
    '• ' + transactions.length + ' transacciones\n' +
    '• ' + events.length + ' eventos\n' +
    '• ' + imagenesGuardadas + ' imágenes guardadas en Drive';
  Logger.log(msg);

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, '🏕️ Campito Jorox', 8);
  } catch (e) {}
}

// ─── BACKUP DE IMÁGENES ───────────────────────────────────────────────────────
/**
 * Descarga imágenes de transacciones desde Supabase Storage → Drive
 * También puede ejecutarse de forma independiente desde el menú.
 */
function respaldarImagenes() {
  // Obtener transacciones con imágenes
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

/**
 * Función interna que hace la descarga real de imágenes.
 * Organiza las imágenes por subcarpeta año-mes.
 * Evita duplicados: si ya existe un archivo con ese nombre, lo salta.
 * @param {Array} transactions - Lista de transacciones
 * @param {Sheet|null} sheet - Hoja CONTABILIDAD para actualizar columna "Archivo en Drive"
 * @returns {number} Cantidad de imágenes nuevas guardadas
 */
function respaldarImagenesInterno(transactions, sheet) {
  // Obtener carpeta raíz en Drive
  const rootFolders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (!rootFolders.hasNext()) {
    Logger.log('❌ No se encontró la carpeta "' + DRIVE_FOLDER_NAME + '" en Google Drive.');
    return 0;
  }
  const rootFolder = rootFolders.next();

  // Obtener o crear subcarpeta "Comprobantes"
  const compFolder = obtenerOCrearSubcarpeta(rootFolder, IMAGES_SUBFOLDER_NAME);

  let count = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx.image_url) continue;

    try {
      // Nombre del archivo: fecha-id-comprobante.jpg
      const datePrefix = tx.date ? tx.date.split('T')[0] : 'sin-fecha';
      const monthFolder = datePrefix.substring(0, 7); // "YYYY-MM"
      const fileName = datePrefix + '-' + tx.id + '-comprobante.jpg';

      // Subcarpeta por mes: Comprobantes / 2025-03 /
      const mesFolder = obtenerOCrearSubcarpeta(compFolder, monthFolder);

      // Verificar si ya existe (evita duplicados en cada sync semanal)
      const existing = mesFolder.getFilesByName(fileName);
      if (existing.hasNext()) {
        Logger.log('  Saltando (ya existe): ' + fileName);
        // Actualizar columna Drive en la hoja aunque ya exista
        if (sheet) {
          const driveUrl = existing.next().getUrl();
          actualizarCeldaDrive(sheet, tx.id, driveUrl);
        }
        continue;
      }

      // Descargar imagen desde Supabase Storage (URL pública)
      const imgRes = UrlFetchApp.fetch(tx.image_url, { muteHttpExceptions: true });
      if (imgRes.getResponseCode() !== 200) {
        Logger.log('  ⚠️ No se pudo descargar: ' + tx.image_url);
        continue;
      }

      // Detectar tipo MIME desde cabeceras
      const contentType = imgRes.getHeaders()['Content-Type'] || 'image/jpeg';

      // Guardar en Drive
      const blob = imgRes.getBlob().setName(fileName).setContentType(contentType);
      const file = mesFolder.createFile(blob);

      Logger.log('  ✅ Guardada: ' + fileName);

      // Actualizar columna "Archivo en Drive" en la hoja CONTABILIDAD
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

/**
 * Busca o crea una subcarpeta dentro de una carpeta padre
 */
function obtenerOCrearSubcarpeta(parentFolder, name) {
  const subs = parentFolder.getFoldersByName(name);
  if (subs.hasNext()) return subs.next();
  return parentFolder.createFolder(name);
}

/**
 * Actualiza la celda "Archivo en Drive" (columna 9) para la fila con el ID dado
 */
function actualizarCeldaDrive(sheet, txId, driveUrl) {
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(txId)) {
      sheet.getRange(r + 1, 9).setValue(driveUrl);
      return;
    }
  }
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────
function formatearEncabezado(sheet, numCols) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2b3d41');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

// ─── TRIGGERS ─────────────────────────────────────────────────────────────────
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
    'Incluye datos + imágenes.'
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
