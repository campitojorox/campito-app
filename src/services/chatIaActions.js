// src/services/chatIaActions.js
// Parsing y ejecución en Supabase/caché de comandos estructurados y persistencia de historial para ChatIA.

import { supabase } from '../supabaseClient';
import { parseStructuredCommands, executeInventoryActions } from './mapIaOrchestrator';
import { deleteCalendarEvent } from './calendarService';
import { extractTableFromMarkdown } from '../utils/exportTools';
import { normalizeAttachments } from '../utils/attachmentUtils';
import {
  parseAllStructuredCommands,
  saveNewCustomTool,
} from './unifiedAiBrain';
import { extractCategoriesFromText, updateAllFarmCategories } from './farmInventoryStorage';

/**
 * Ejecuta comandos estructurados devueltos por Gemini (inventario, caminos, calendario,
 * finanzas, memoria y archivos exportables) y devuelve el contenido limpio + metadatos UI.
 */
export async function processChatResponseActions({
  successResult,
  initialDisplayedContent,
  initialLearnedMemory,
  initialExportFiles = [],
  userText = '',
  aud = null,
  effectivePt = null,
  currentEvents = [],
  currentInventory = [],
  currentPaths = [],
  activeUsers = [],
  currentUserId = null,
  actionsAlreadyApplied = false,
  onInventoryAdded,
  onInventoryDeleted,
  onInventoryUpdated,
  onPathAdded,
  onPathDeleted,
  onPathUpdated,
  onEventAdded,
  onEventDeleted,
  onTransactionAdded,
  onKnowledgeAdded,
  onCategoryAdded,
  onCategoryDeleted,
  refetchEvents,
  refetchTransactions,
}) {
  let displayedContent = initialDisplayedContent || successResult;
  let learnedMemory = initialLearnedMemory || null;
  const newlyAddedBatch = [];

  if (!learnedMemory) {
    const memMatch = successResult.match(/\[\[MEMORIA:\s*(\{.*?\})\s*\]\]/s);
    if (memMatch) {
      try {
        learnedMemory = JSON.parse(memMatch[1]);
        displayedContent = displayedContent.replace(memMatch[0], '').trim();
      } catch (e) {
        console.warn('Error al parsear bloque de memoria:', e);
      }
    }
  }

  const structured = parseStructuredCommands(successResult);
  const uCmds = parseAllStructuredCommands(successResult);

  displayedContent = displayedContent
    .replace(/\[\[REGISTRAR_PUNTOS:\s*(\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[REGISTRAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[BORRAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[REGISTRAR_CAMINO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[EDITAR_CAMINO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[ACTUALIZAR_CAMINO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[MODIFICAR_CAMINO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[BORRAR_CAMINO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[ELIMINAR_CAMINO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[EDITAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[CREAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[BORRAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[ELIMINAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[CREAR_TRANSACCION:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[REGISTRAR_HERRAMIENTA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[CREAR_HERRAMIENTA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[CREAR_CATEGORIA:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[REGISTRAR_CATEGORIA:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[ACTUALIZAR_CATEGORIAS:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[ACTUALIZAR_CATEGORIA:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[REEMPLAZAR_CATEGORIAS:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[GUARDAR_CATEGORIAS:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[SINCRONIZAR_TAXONOMIA:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[SINCRONIZAR_CATEGORIAS:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\]\]/gi, '')
    .replace(/\[\[BORRAR_CATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[ELIMINAR_CATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[RENOMBRAR_CATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[INTEGRAR_CATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[FUSIONAR_CATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[CREAR_SUBCATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[REGISTRAR_SUBCATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[BORRAR_SUBCATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .replace(/\[\[ELIMINAR_SUBCATEGORIA:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
    .trim();

  const actionsToExecute = [
    ...structured.points.map((p) => ({ type: 'ADD_POINT', data: p })),
    ...structured.deletions.map((d) => ({ type: 'DELETE_POINT', data: d })),
    ...structured.paths.map((pth) => ({ type: 'ADD_PATH', data: pth })),
    ...structured.updates.map((u) => ({ type: 'UPDATE_POINT', data: u })),
    ...uCmds.pathUpdates.map((pth) => ({ type: 'UPDATE_PATH', data: pth })),
    ...uCmds.pathDeletions.map((d) => ({ type: 'DELETE_PATH', data: d })),
    ...(structured.categories || uCmds.categories || []).map((c) => ({ type: 'CREATE_CATEGORY', data: c })),
    ...(structured.categoryDeletions || uCmds.categoryDeletions || []).map((c) => ({ type: 'DELETE_CATEGORY', data: c })),
    ...(structured.subcategories || uCmds.subcategories || []).map((s) => ({ type: 'CREATE_SUBCATEGORY', data: s })),
    ...(structured.subcategoryDeletions || uCmds.subcategoryDeletions || []).map((s) => ({ type: 'DELETE_SUBCATEGORY', data: s })),
  ];

  // Detección tolerante de órdenes de renombrar / integrar categorías en lenguaje natural
  if (userText) {
    const uLower = userText.toLowerCase();

    // Renombrar categoría (ej: "Renombrada 'Caminos y Trazados' a 'Trazados'")
    if (uLower.includes('renombr') && (uLower.includes(' a ') || uLower.includes(' por '))) {
      const match = userText.match(/renombr(?:ar|ada|ado|a)?\s*["'«]?([^"'»\n,]+)["'»]?\s*(?:a|por)\s*["'«]?([^"'»\n,.]+)/i);
      if (match) {
        actionsToExecute.push({
          type: 'RENAME_CATEGORY',
          data: { old_name: match[1].trim(), new_name: match[2].trim() },
        });
      }
    }

    // Integrar categoría (ej: "Integrada 'Ríos / Arroyos' como subcategoría dentro de 'Trazados'")
    if (uLower.includes('integr') || uLower.includes('fusion')) {
      const match = userText.match(/integr(?:ar|ada|ado|a)?\s*["'«]?([^"'»\n,]+)["'»]?.*?(?:en|dentro de|a)\s*["'«]?([^"'»\n,.]+)/i);
      if (match) {
        actionsToExecute.push({
          type: 'MERGE_CATEGORY',
          data: {
            source: match[1].trim(),
            target: match[2].trim(),
            delete_subcategories: uLower.includes('elimin') || uLower.includes('borr') ? ['Río', 'Rio'] : [],
          },
        });
      }
    }

    // Eliminar subcategoría (ej: "Eliminada la subcategoría 'Río'")
    if ((uLower.includes('elimin') || uLower.includes('borr')) && uLower.includes('subcategor')) {
      const match = userText.match(/(?:elimin(?:ar|ada|ado|a)?|borr(?:ar|ada|ado|a)?)\s+(?:la\s+)?subcategor[ií]a\s*["'«]?([^"'»\n,.]+)/i);
      if (match) {
        actionsToExecute.push({
          type: 'DELETE_SUBCATEGORY',
          data: { parentCategory: 'Trazados', name: match[1].trim() },
        });
      }
    }

    // Eliminar o borrar categoría (ej: "elimina la categoría Casas", "borra la categoría Casas")
    if ((uLower.includes('elimin') || uLower.includes('borr')) && (uLower.includes('categor') || uLower.includes('casas')) && !uLower.includes('subcategor')) {
      const match = userText.match(/(?:elimin(?:ar|ada|ado|a)?|borr(?:ar|ada|ado|a)?)\s+(?:la\s+)?categor[ií]a\s*["'«]?([^"'»\n,.]+)/i);
      const catToDelete = match ? match[1].trim() : (uLower.includes('casas') ? 'Casas' : null);
      if (catToDelete) {
        actionsToExecute.push({
          type: 'DELETE_CATEGORY',
          data: { name: catToDelete, delete_items: false, reassign_to: 'Sin categoría' },
        });
      }
    }
  }

  // Si el usuario pidió actualizar/sincronizar categorías pero Gemini no emitió la etiqueta estructurada,
  // extraer de forma resiliente la lista de categorías y subcategorías presentes en el texto del usuario o la respuesta.
  if (actionsToExecute.filter((a) => a.type === 'CREATE_CATEGORY' || a.type === 'RENAME_CATEGORY' || a.type === 'MERGE_CATEGORY').length === 0 && userText) {
    const uLower = userText.toLowerCase();
    const isCategoryRequest =
      (uLower.includes('categor') || uLower.includes('subcategor') || uLower.includes('taxonom')) &&
      (uLower.includes('actualiz') || uLower.includes('cambi') || uLower.includes('edit') || uLower.includes('guard') || uLower.includes('reemplaz') || uLower.includes('sincroniz'));

    if (isCategoryRequest) {
      const extractedFromUser = extractCategoriesFromText(userText);
      const extractedFromAi = extractCategoriesFromText(successResult);
      const toApply = extractedFromUser.length > 0 ? extractedFromUser : (extractedFromAi.length > 0 ? extractedFromAi : []);
      if (toApply.length > 0) {
        actionsToExecute.push({ type: 'CREATE_CATEGORY', data: toApply });
      }
    }
  }

  if (userText && actionsToExecute.filter((a) => a.type === 'DELETE_POINT').length === 0) {
    const lower = userText.toLowerCase().trim();
    const isDeleteLast =
      lower.includes('borra el último árbol') ||
      lower.includes('borra el ultimo arbol') ||
      lower.includes('elimina el último árbol') ||
      lower.includes('elimina el ultimo arbol') ||
      lower.includes('borra el último punto') ||
      lower.includes('borra el ultimo punto') ||
      lower.includes('elimina el último punto') ||
      lower.includes('cancela el último');

    if (isDeleteLast && currentInventory.length > 0) {
      actionsToExecute.push({ type: 'DELETE_POINT', data: { target: 'ultimo' } });
    }
  }

  if (actionsToExecute.length > 0) {
    try {
      const execResult = await executeInventoryActions({
        actions: actionsToExecute,
        audio: aud,
        liveGps: effectivePt,
        currentInventory,
        currentPaths,
      });

      if (execResult.addedItems.length > 0) {
        newlyAddedBatch.push(...execResult.addedItems);
        onInventoryAdded?.(execResult.addedItems);
      }
      if (execResult.deletedItems.length > 0) {
        onInventoryDeleted?.(execResult.deletedItems);
      }
      if (execResult.updatedItems.length > 0) {
        onInventoryUpdated?.(execResult.updatedItems);
      }
      if (execResult.addedPaths.length > 0) {
        onPathAdded?.(execResult.addedPaths);
      }
      if (execResult.deletedPaths.length > 0) {
        onPathDeleted?.(execResult.deletedPaths);
      }
      if (execResult.updatedPaths.length > 0) {
        onPathUpdated?.(execResult.updatedPaths);
      }
      if (execResult.addedCategories?.length > 0 || execResult.newCategoriesCreated?.length > 0) {
        onCategoryAdded?.([...(execResult.addedCategories || []), ...(execResult.newCategoriesCreated || [])]);
      }
      if (execResult.deletedCategories?.length > 0) {
        onCategoryDeleted?.(execResult.deletedCategories);
      }
    } catch (e) {
      console.warn('[ChatIA] Error ejecutando acciones de inventario:', e);
    }
  }

  if (!actionsAlreadyApplied) {
    const evMatches = [...successResult.matchAll(/\[\[CREAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi)];
    for (const evMatch of evMatches) {
      try {
        const evData = JSON.parse(evMatch[1]);
        displayedContent = displayedContent.replace(evMatch[0], '').trim();

        const evDate = evData.date ? `${evData.date.split('T')[0]}T00:00:00Z` : new Date().toISOString();
        const evEndDate = evData.end_date ? `${evData.end_date.split('T')[0]}T00:00:00Z` : evDate;
        const evStartTime = evData.start_time ? `${evData.start_time.substring(0, 5)}:00` : '08:00:00';
        const evEndTime = evData.end_time ? `${evData.end_time.substring(0, 5)}:00` : '10:00:00';
        const evCat = evData.category || 'RIEGO - La Nana';
        const evResp = Array.isArray(evData.responsibles)
          ? evData.responsibles
          : evData.responsibles
            ? [evData.responsibles]
            : ['Ariel'];
        const evInfo = evData.info || 'Programado desde Chat IA';

        const { data: newEvRow, error: evInsErr } = await supabase
          .from('events')
          .insert({
            date: evDate,
            end_date: evEndDate,
            start_time: evStartTime,
            end_time: evEndTime,
            category: evCat,
            responsibles: evResp,
            info: evInfo,
          })
          .select()
          .single();

        if (!evInsErr && newEvRow) {
          onEventAdded?.(newEvRow);
          if (refetchEvents) refetchEvents();
        }
      } catch (e) {
        console.warn('Error al procesar bloque CREAR_EVENTO:', e);
      }
    }

    const delEventMatches = [
      ...successResult.matchAll(/\[\[(?:BORRAR_EVENTO|ELIMINAR_EVENTO):\s*(\{[\s\S]*?\})\s*\]\]/gi),
    ];
    for (const delMatch of delEventMatches) {
      try {
        const delData = JSON.parse(delMatch[1]);
        displayedContent = displayedContent.replace(delMatch[0], '').trim();

        const delRes = await deleteCalendarEvent({
          event_id: delData.event_id || delData.id,
          date: delData.date,
          query: delData.query || delData.info || delData.category || delData.description,
          currentEvents,
        });

        if (delRes.success && delRes.deletedId) {
          onEventDeleted?.(delRes.deletedId);
          if (refetchEvents) refetchEvents();
        }
      } catch (e) {
        console.warn('[ChatIA] Error al procesar bloque BORRAR_EVENTO/ELIMINAR_EVENTO:', e);
      }
    }

    const txMatches = [...successResult.matchAll(/\[\[CREAR_TRANSACCION:\s*(\{[\s\S]*?\})\s*\]\]/gi)];
    if (txMatches.length > 0) {
      const { data: authData } = await supabase.auth.getUser();
      const currUser = authData?.user;

      for (const txMatch of txMatches) {
        try {
          const txData = JSON.parse(txMatch[1]);
          displayedContent = displayedContent.replace(txMatch[0], '').trim();

          const rawType = txData.type || 'Gasto';
          const rawAmt = Math.abs(parseFloat(txData.amount || 0));
          if (!rawAmt || Number.isNaN(rawAmt)) continue;
          const isRetiro = ['retiro', 'venta', 'ingreso', 'cobro'].includes(rawType.toLowerCase());
          const finalAmount = isRetiro ? -rawAmt : rawAmt;

          let targetUserId = currUser?.id || null;
          if (txData.user && Array.isArray(activeUsers) && activeUsers.length > 0) {
            const targetName = String(txData.user).toLowerCase().trim();
            const matchedProfile =
              activeUsers.find((u) => (u.name || '').toLowerCase().trim() === targetName) ||
              activeUsers.find((u) => (u.name || '').toLowerCase().includes(targetName));
            if (matchedProfile?.id) {
              targetUserId = matchedProfile.id;
            }
          }

          const { data: newTxRow, error: txInsErr } = await supabase
            .from('transactions')
            .insert({
              date: new Date().toISOString(),
              user_id: targetUserId,
              type: isRetiro ? 'Retiro' : 'Gasto',
              amount: finalAmount,
              description: txData.description || 'Registrado desde Chat IA',
              status: 'ACTIVE',
            })
            .select('*, profiles(name)')
            .single();

          if (!txInsErr && newTxRow) {
            onTransactionAdded?.(newTxRow);
            if (refetchTransactions) await refetchTransactions();
          }
        } catch (e) {
          console.warn('Error al procesar bloque CREAR_TRANSACCION:', e);
        }
      }
    }
  }

  const exportFiles = Array.isArray(initialExportFiles) ? [...initialExportFiles] : [];
  const exportMatches = [...successResult.matchAll(/\[\[EXPORTAR_ARCHIVO:\s*(\{.*?\})\s*\]\]/gs)];
  for (const match of exportMatches) {
    try {
      const fileData = JSON.parse(match[1]);
      if (exportFiles.length === 0) exportFiles.push(fileData);
      displayedContent = displayedContent.replace(match[0], '').trim();
    } catch (e) {
      console.warn('Error al procesar bloque EXPORTAR_ARCHIVO:', e);
    }
  }

  const codeExportMatches = [
    ...successResult.matchAll(/```(?:export_file|download_file|export)\s*(\{.*?\})\s*```/gs),
  ];
  for (const match of codeExportMatches) {
    try {
      const fileData = JSON.parse(match[1]);
      exportFiles.push(fileData);
      displayedContent = displayedContent.replace(match[0], '').trim();
    } catch (e) {
      console.warn('Error al procesar bloque code export_file:', e);
    }
  }

  if (exportFiles.length === 0 && userText) {
    const lowerText = userText.toLowerCase();
    const wantsPdf = lowerText.includes('pdf') || lowerText.includes('informe descargable');
    const wantsExcel =
      lowerText.includes('excel') || lowerText.includes('csv') || lowerText.includes('hoja de cálculo');
    const wantsTxt = lowerText.includes('txt') || lowerText.includes('texto plano');
    const wantsXml = lowerText.includes('xml') || lowerText.includes('kml');

    if (wantsPdf || wantsExcel || wantsTxt || wantsXml) {
      const parsedTable = extractTableFromMarkdown(displayedContent);
      const dateStr = new Date().toISOString().split('T')[0];

      if (wantsPdf) {
        exportFiles.push({
          type: 'pdf',
          filename: `CAMPITO_JOROX_INFORME_${dateStr}.pdf`,
          title: 'Informe Campito Jorox',
          subtitle: 'Generado a petición del usuario',
          content: displayedContent,
          table: parsedTable,
        });
      } else if (wantsExcel) {
        exportFiles.push({
          type: 'excel',
          filename: `CAMPITO_JOROX_DATOS_${dateStr}.csv`,
          title: 'Exportación Campito Jorox',
          table: parsedTable,
          content: displayedContent,
        });
      } else if (wantsTxt) {
        exportFiles.push({
          type: 'txt',
          filename: `CAMPITO_JOROX_NOTAS_${dateStr}.txt`,
          title: 'Notas Campito Jorox',
          content: displayedContent,
        });
      } else if (wantsXml) {
        exportFiles.push({
          type: 'xml',
          filename: `CAMPITO_JOROX_${dateStr}.xml`,
          title: 'Datos Campito Jorox',
          content: displayedContent,
        });
      }
    }
  }

  if (!learnedMemory && userText) {
    const lowerText = userText.toLowerCase().trim();
    const triggers = [
      'recuerda que',
      'recuerda:',
      'aprende que',
      'aprende:',
      'guarda que',
      'guarda este dato:',
      'anota que',
      'toma nota de que',
    ];
    for (const trig of triggers) {
      if (lowerText.startsWith(trig)) {
        const contentToSave = userText.substring(trig.length).replace(/^[:\s]+/, '').trim();
        if (contentToSave.length > 5) {
          learnedMemory = {
            category: 'general',
            title: contentToSave.substring(0, 45) + (contentToSave.length > 45 ? '...' : ''),
            content: contentToSave,
          };
          break;
        }
      }
    }
  }

  if (learnedMemory && learnedMemory.content) {
    const geoTag = effectivePt
      ? ` [📍 GPS: ${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}]`
      : '';
    const enrichedContent = learnedMemory.content.includes('[📍')
      ? learnedMemory.content
      : `${learnedMemory.content}${geoTag}`;

    const memoryEntry = {
      id: 'mem-' + Date.now(),
      category: learnedMemory.category || 'general',
      title: learnedMemory.title || 'Dato aprendido',
      content: enrichedContent,
      source: 'chat',
      created_at: new Date().toISOString(),
      is_active: true,
    };

    onKnowledgeAdded?.(memoryEntry);

    if (!actionsAlreadyApplied) {
      supabase
        .from('farm_knowledge')
        .insert({
          category: memoryEntry.category,
          title: memoryEntry.title,
          content: memoryEntry.content,
          source: 'chat',
          user_id: currentUserId || null,
          is_active: true,
        })
        .then(() => {})
        .catch(() => {});
    }
  }

  if (Array.isArray(uCmds.customTools) && uCmds.customTools.length > 0) {
    for (const tool of uCmds.customTools) {
      saveNewCustomTool(tool, { userId: currentUserId }).catch((e) =>
        console.warn('Error guardando herramienta dinámica:', e)
      );
    }
  }

  return {
    displayedContent,
    learnedMemory,
    newlyAddedBatch,
    exportFiles,
  };
}

/**
 * Sube adjunto/audio opcional a Supabase Storage y guarda turno de conversación en chat_history.
 */
export async function persistChatTurnToHistory({
  userText,
  att,
  atts,
  aud,
  displayedContent,
  serverThatAnswered,
}) {
  try {
    const attList = normalizeAttachments(atts, att);
    const uploadedUrls = [];
    const uploadedPaths = [];

    for (const item of attList) {
      if (!item?.file) continue;
      const fileExt = item.name ? item.name.split('.').pop() : item.isPdf ? 'pdf' : 'jpg';
      const cleanFileName = `chat-ia/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      try {
        const { error: uploadErr } = await supabase.storage
          .from('comprobantes')
          .upload(cleanFileName, item.file, { contentType: item.type || 'application/octet-stream' });

        if (!uploadErr) {
          const { data: pubUrl } = supabase.storage.from('comprobantes').getPublicUrl(cleanFileName);
          if (pubUrl?.publicUrl) uploadedUrls.push(pubUrl.publicUrl);
          uploadedPaths.push(cleanFileName);
        }
      } catch (fileErr) {
        console.warn('[ChatIA] No se pudo subir archivo a storage:', fileErr);
      }
    }

    if (uploadedUrls.length === 0 && aud && aud.blob) {
      const ext = aud.mimeType?.includes('mp4')
        ? 'm4a'
        : aud.mimeType?.includes('ogg')
          ? 'ogg'
          : 'webm';
      const cleanAudioName = `chat-ia/audio-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      try {
        const { error: uploadAudioErr } = await supabase.storage
          .from('comprobantes')
          .upload(cleanAudioName, aud.blob, { contentType: aud.mimeType || 'audio/webm' });
        if (!uploadAudioErr) {
          const { data: pubUrl } = supabase.storage.from('comprobantes').getPublicUrl(cleanAudioName);
          if (pubUrl?.publicUrl) uploadedUrls.push(pubUrl.publicUrl);
          uploadedPaths.push(cleanAudioName);
        }
      } catch (audioUpErr) {
        console.warn('No se pudo subir audio a storage:', audioUpErr);
      }
    }

    const uploadedFileUrl =
      uploadedUrls.length > 1 ? JSON.stringify(uploadedUrls) : uploadedUrls[0] || null;
    const uploadedFileName =
      uploadedPaths.length > 1 ? JSON.stringify(uploadedPaths) : uploadedPaths[0] || null;

    const { data: authData } = await supabase.auth.getUser();
    const u = authData?.user;
    const currentUserName = u?.user_metadata?.name || u?.email?.split('@')[0] || 'Admin';

    const attSummary =
      attList.length > 1
        ? `[${attList.length} archivos adjuntos: ${attList.map((a) => a.name).join(', ')}]`
        : attList.length === 1
          ? `[Archivo adjunto: ${attList[0].name}]`
          : '';

    await supabase.from('chat_history').insert({
      role: 'user',
      content: userText || attSummary || (aud ? `[Audio grabado: ${aud.duration}s]` : ''),
      file_url: uploadedFileUrl,
      file_name: uploadedFileName,
      user_id: u?.id || null,
      user_name: currentUserName,
      model_used: null,
    });

    await supabase.from('chat_history').insert({
      role: 'assistant',
      content: displayedContent,
      file_url: null,
      file_name: null,
      user_id: u?.id || null,
      user_name: 'Asistente IA',
      model_used: `${serverThatAnswered.name} (${serverThatAnswered.level})`,
    });
  } catch (persistErr) {
    console.warn('[ChatIA] Aviso al persistir para backup:', persistErr.message);
  }
}

