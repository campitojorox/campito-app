/**
 * ====================================================================
 * RESPALDO AUTOMÁTICO CAMPITO JOROX -> GOOGLE DRIVE / GOOGLE SHEETS
 * Cuenta: campitojorox@gmail.com
 * Ubicación: Mi unidad / APP CAMPITO JOROX
 * ====================================================================
 * 
 * INSTRUCCIONES:
 * 1. En Google Drive (con campitojorox@gmail.com), ve a "Mi unidad / APP CAMPITO JOROX".
 * 2. Abre tu archivo de datos (ej. "CAMPITO JOROX DATA") con "Hojas de cálculo de Google" 
 *    (o crea una Hoja de Cálculo nueva con ese nombre).
 * 3. En el menú superior de Google Sheets, ve a: Extensiones > Apps Script.
 * 4. Borra todo lo que haya y pega este código completo.
 * 5. Haz clic en "Guardar" (icono de disquete).
 * 6. En el desplegable de funciones, selecciona "actualizarCampitoJorox" y pulsa "Ejecutar".
 *    (Google te pedirá autorizar los permisos una sola vez).
 * 
 * ¡Y listo! A partir de ese momento aparecerá el menú "🏕️ Campito Jorox" en tu hoja,
 * y puedes programar la actualización automática con 1 clic.
 */

// CREDENCIALES DEL PROYECTO SUPABASE
const SUPABASE_CONFIG = {
  url: 'https://byyqdtcuutfnjdlaewsu.supabase.co',
  serviceKey: 'PEGAR_AQUI_SUPABASE_SERVICE_ROLE_KEY'
};

/**
 * Agrega el menú personalizado en Google Sheets al abrir el archivo
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏕️ Campito Jorox')
    .addItem('🔄 Sincronizar con Supabase ahora', 'actualizarCampitoJorox')
    .addSeparator()
    .addItem('⏰ Activar Respaldo Automático (Cada Lunes)', 'activarRespaldoAutomatico')
    .addItem('❌ Desactivar Respaldo Automático', 'desactivarRespaldoAutomatico')
    .addToUi();
}

/**
 * Función principal: Descarga los datos de Supabase y actualiza las hojas
 */
function actualizarCampitoJorox() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. OBTENER TRANSACCIONES (CONTABILIDAD)
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
    throw new Error('Error al conectar con transacciones de Supabase: ' + txRes.getContentText());
  }

  const transactions = JSON.parse(txRes.getContentText());

  // 2. OBTENER EVENTOS (CALENDARIO)
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
    throw new Error('Error al conectar con eventos de Supabase: ' + evRes.getContentText());
  }

  const events = JSON.parse(evRes.getContentText());

  // 3. ACTUALIZAR HOJA 'CONTABILIDAD'
  let sheetCont = ss.getSheetByName('CONTABILIDAD');
  if (!sheetCont) {
    sheetCont = ss.insertSheet('CONTABILIDAD');
  }
  sheetCont.clearContents();

  const contHeaders = ['TransactionID', 'Date', 'User', 'Category', 'Value', 'Amount', 'Description', 'UserID', 'Imagen'];
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
      Math.abs(tx.amount || 0),
      tx.amount || 0,
      tx.description || '',
      tx.user_id || '',
      tx.image_url || ''
    ]);
  }

  sheetCont.getRange(1, 1, contRows.length, contHeaders.length).setValues(contRows);
  formatearEncabezado(sheetCont, contHeaders.length);

  // 4. ACTUALIZAR HOJA 'CALENDARIO'
  let sheetCal = ss.getSheetByName('CALENDARIO');
  if (!sheetCal) {
    sheetCal = ss.insertSheet('CALENDARIO');
  }
  sheetCal.clearContents();

  const calHeaders = ['EventID', 'Date', 'End Date', 'Start Time', 'End Time', 'Responsible', 'Category', 'Info', 'UserID', 'CalendarID'];
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

  Logger.log('Sincronización completada con éxito.');
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Sincronización completada: ' + transactions.length + ' transacciones y ' + events.length + ' eventos actualizados.',
      'Campito Jorox',
      6
    );
  } catch (e) {
    // Si se corre como trigger silencioso, toast no está disponible
  }
}

/**
 * Da estilo profesional a la fila de cabecera
 */
function formatearEncabezado(sheet, numCols) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2b3d41');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

/**
 * Configura un temporizador para respaldar automáticamente todos los lunes a las 04:00 AM
 */
function activarRespaldoAutomatico() {
  desactivarRespaldoAutomatico(); // Limpia activadores anteriores
  ScriptApp.newTrigger('actualizarCampitoJorox')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(4)
    .create();

  SpreadsheetApp.getUi().alert('✅ Respaldo automático activado. Se ejecutará todos los lunes a las 04:00 AM automáticamente.');
}

/**
 * Desactiva cualquier activador existente
 */
function desactivarRespaldoAutomatico() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'actualizarCampitoJorox') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('Activadores automáticos desactivados.', 'Campito Jorox', 4);
  } catch (e) {}
}
