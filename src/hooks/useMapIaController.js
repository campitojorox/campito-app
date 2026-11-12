// src/hooks/useMapIaController.js
// Controlador de voz + cámara + documentos + órdenes IA y deshacer (Undo) para FarmSatelliteMap.

import { useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useVoiceGeoTracker } from './useVoiceGeoTracker';
import { useAudioPreview } from './useAudioRecorder';
import {
  insertFarmInventoryItem,
  updateFarmInventoryItem,
  deleteFarmInventoryItem,
  insertFarmPath,
  updateFarmPath,
  deleteFarmPath,
  getItemCategory,
} from '../services/farmInventoryStorage';
import {
  buildMapSystemInstruction,
  parseMapGeminiRawText,
  callGeminiForInventoryAction,
  executeInventoryActions,
  parseStructuredCommands,
} from '../services/mapIaOrchestrator';
import {
  callUnifiedAiBrain,
  executeUnifiedActions,
  parseAllStructuredCommands,
} from '../services/unifiedAiBrain';
import { parseKmlString, parseGeoJsonString, parseGpxString } from '../utils/kmlParser';
import {
  startAiBackgroundJob,
  subscribeSectionJobs,
  acknowledgeAiJob,
  markJobActionsApplied,
} from '../services/aiBackgroundJobManager';
import { syncTextareaHeight } from '../utils/helpers';
import { readFilesAsAttachments } from '../utils/attachmentUtils';
import { indexDocumentForRag, searchRagKnowledge, formatRagContextForPrompt } from '../services/ragDocumentService';
import { extractKmlFromKmz } from '../utils/kmzReader';
import {
  DEFAULT_CENTER,
  isDeleteIntent,
  normalizeLatLngObj,
  normalizeCoordinatesArray,
} from '../components/map/mapUtils';

const mapRuntimeContextMap = new globalThis.Map();

export function useMapIaController({
  mapInstanceRef,
  liveUserGpsRef,
  selectedTarget,
  setSelectedTarget,
  localInventory,
  setLocalInventory,
  localPaths,
  setLocalPaths,
  filteredInventory,
  filteredPaths,
  setVisibleCategories,
  setVisibleSubcats,
  onReloadInventory,
  onReloadPaths,
  handleDeleteTarget,
  mapIaInput,
  setMapIaInput,
  isProcessingIa,
  setIsProcessingIa,
  iaFeedback,
  setIaFeedback,
  undoStack,
  setUndoStack,
  pendingAttachments,
  setPendingAttachments,
  mapIaTextareaRef,
  fileInputRef,
  docInputRef,
}) {
  const {
    isRecording: isVoiceRecording,
    elapsedSeconds: voiceRecordingSeconds,
    currentGps: voiceCurrentGps,
    wakeLockActive,
    startTracking: startVoiceTracking,
    stopTracking: stopVoiceTracking,
    cancelTracking: cancelVoiceTracking,
  } = useVoiceGeoTracker();

  const {
    pendingAudio: pendingVoiceAudio,
    setPendingAudio: setPendingVoiceAudio,
    isPreviewPlaying,
    setIsPreviewPlaying,
    previewCurrentTime,
    setPreviewCurrentTime,
    previewDuration,
    setPreviewDuration,
    previewAudioRef,
    togglePlayPreview,
    handleSeekPreview,
    handleDiscardAudio: handleDiscardVoice,
  } = useAudioPreview();

  const handleStartVoiceRecording = async () => {
    try {
      const initialGps = liveUserGpsRef.current || voiceCurrentGps || null;
      await startVoiceTracking({ initialGps });
    } catch (err) {
      console.error('Error iniciando grabación:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert(
          'Permiso de micrófono denegado. Por favor, habilítalo en los ajustes de tu navegador o teléfono para poder grabar notas de voz.'
        );
      } else {
        alert(`No se pudo iniciar el micrófono: ${err.message || 'Comprueba los permisos en tu navegador.'}`);
      }
    }
  };

  const handleCancelVoiceRecording = async () => {
    try {
      if (cancelVoiceTracking) {
        cancelVoiceTracking();
      } else {
        await stopVoiceTracking();
      }
    } catch (e) {
      console.error('Error cancelando grabación:', e);
    }
    setPendingVoiceAudio(null);
  };

  const handleStopVoiceRecording = async () => {
    try {
      const audioResult = await stopVoiceTracking();
      if (audioResult) {
        let dataUrl = audioResult.dataUrl;
        if (!dataUrl && audioResult.audioBlob) {
          dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(audioResult.audioBlob);
          });
        }
        const voiceObj = {
          ...audioResult,
          dataUrl,
          duration: Math.max(1, Math.round(audioResult.durationSeconds || audioResult.duration || 0)),
        };
        setPendingVoiceAudio(voiceObj);
      }
    } catch (err) {
      console.error('Error deteniendo grabación:', err);
      setIaFeedback({ type: 'error', text: 'Error al procesar la grabación de voz.' });
    }
  };

  const handleCameraClick = () => fileInputRef.current?.click();

  const handleCameraChange = async (e) => {
    const items = await readFilesAsAttachments(e.target.files, { forceImage: true });
    if (items.length > 0) {
      setPendingAttachments((prev) => [...prev, ...items]);
    }
    e.target.value = '';
  };

  const handleAttachClick = () => docInputRef.current?.click();

  const handleDocumentChange = async (e) => {
    const items = await readFilesAsAttachments(e.target.files);
    if (items.length > 0) {
      setPendingAttachments((prev) => [...prev, ...items]);
    }
    e.target.value = '';
  };

  useEffect(() => {
    if (!iaFeedback) return;
    const timer = setTimeout(() => {
      setIaFeedback(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [iaFeedback, setIaFeedback]);

  const handleSendMapIaOrder = async () => {
    const textOrder = mapIaInput.trim();
    const audioOrder = pendingVoiceAudio;
    const attsOrder = pendingAttachments;

    if (!textOrder && !audioOrder && attsOrder.length === 0) return;
    if (isProcessingIa) return;

    if (selectedTarget && (isDeleteIntent(textOrder) || (audioOrder && isDeleteIntent(audioOrder.transcription)))) {
      setMapIaInput('');
      syncTextareaHeight(mapIaTextareaRef.current, '');
      setPendingVoiceAudio(null);
      setPendingAttachments([]);
      await handleDeleteTarget();
      return;
    }

    const lowerOrder = textOrder.toLowerCase();

    // ── 1. DETECCIÓN DIRECTA DE RENOMBRADO DE CATEGORÍAS ──
    const isCategoryRename =
      (lowerOrder.includes('cambiar') || lowerOrder.includes('renombrar') || lowerOrder.includes('actualizar') || lowerOrder.includes('modificar')) &&
      (lowerOrder.includes('categor') || lowerOrder.includes('casas'));

    if (isCategoryRename) {
      let oldCat = null;
      let newCat = null;

      const matchQuotes = textOrder.match(/["'«“]([^"'»”]+)["'»”][\s\S]*?(?:por|a|como)\s+["'«“]([^"'»”]+)["'»”]/i);
      if (matchQuotes) {
        oldCat = matchQuotes[1].trim();
        newCat = matchQuotes[2].trim();
      } else if (lowerOrder.includes('casas') && (lowerOrder.includes('edificio') || lowerOrder.includes('casas / edificios'))) {
        oldCat = 'Casas / Edificios';
        newCat = 'Casas';
      }

      if (oldCat && newCat) {
        setMapIaInput('');
        syncTextareaHeight(mapIaTextareaRef.current, '');
        setPendingVoiceAudio(null);
        setPendingAttachments([]);
        setIsProcessingIa(true);
        setIaFeedback({ type: 'info', text: `🔄 Renombrando categoría "${oldCat}" a "${newCat}"...` });

        try {
          const oldNorm = oldCat.toLowerCase().trim();
          const targetItems = (localInventory || []).filter((i) => {
            const c = (i.category || '').toLowerCase().trim();
            const root = getItemCategory(i).toLowerCase().trim();
            return c === oldNorm || root === oldNorm || (oldNorm.includes('edificio') && (c.includes('edificio') || c.includes('casa')));
          });

          for (const item of targetItems) {
            await updateFarmInventoryItem(item.id, { category: newCat });
          }

          setLocalInventory((prev) =>
            prev.map((i) => (targetItems.some((t) => String(t.id) === String(i.id)) ? { ...i, category: newCat } : i))
          );
          if (setVisibleCategories) {
            setVisibleCategories((prev) => {
              const next = new Set(prev);
              next.delete(oldCat);
              next.delete('Edificios');
              next.delete('Casas / Edificios');
              next.add(newCat);
              return next;
            });
          }

          setIaFeedback({
            type: 'success',
            text: `✨ Categoría renombrada: "${oldCat}" ahora es "${newCat}" (${targetItems.length} elementos actualizados en el mapa).`,
          });
          if (onReloadInventory) await onReloadInventory();
        } catch (err) {
          setIaFeedback({ type: 'error', text: `Error renombrando categoría: ${err.message}` });
        } finally {
          setIsProcessingIa(false);
        }
        return;
      }
    }

    // ── 2. DETECCIÓN DIRECTA DE BORRADO DE CAMINOS Y PISTAS ──
    const isDeleteWord = lowerOrder.includes('eliminar') || lowerOrder.includes('borrar') || lowerOrder.includes('quitar') || lowerOrder.includes('suprimir');
    const mentionsPaths = lowerOrder.includes('camino') || lowerOrder.includes('pista') || lowerOrder.includes('sendero') || lowerOrder.includes('trazado') || lowerOrder.includes('recorrido') || lowerOrder.includes('polilinea');
    const mentionsAll = lowerOrder.includes('todo') || lowerOrder.includes('toda') || lowerOrder.includes('todos') || lowerOrder.includes('todas');

    if (isDeleteWord && mentionsPaths) {
      const pathsToDelete = mentionsAll
        ? [...localPaths]
        : localPaths.filter((p) => {
            const pName = (p.name || '').toLowerCase();
            const pType = (p.path_type || '').toLowerCase();
            return (
              lowerOrder.includes(pName) ||
              (lowerOrder.includes('pista') && (pName.includes('pista') || pType.includes('pista') || pType === 'camino')) ||
              (lowerOrder.includes('sendero') && pType === 'sendero') ||
              (lowerOrder.includes('camino') && (pType === 'camino' || pType === 'sendero' || pType === 'carril'))
            );
          });

      if (pathsToDelete.length > 0) {
        setMapIaInput('');
        syncTextareaHeight(mapIaTextareaRef.current, '');
        setPendingVoiceAudio(null);
        setPendingAttachments([]);
        setIsProcessingIa(true);
        setIaFeedback({ type: 'info', text: `🗑️ Eliminando ${pathsToDelete.length} camino(s) y pista(s)...` });

        try {
          const deletedIds = [];
          for (const p of pathsToDelete) {
            await deleteFarmPath(p.id);
            deletedIds.push(p.id);
          }
          const delSet = new Set(deletedIds.map(String));
          setLocalPaths((prev) => prev.filter((p) => !delSet.has(String(p.id))));
          if (selectedTarget && selectedTarget.type === 'path' && delSet.has(String(selectedTarget.id))) {
            setSelectedTarget(null);
          }
          setUndoStack((prev) => [
            ...prev,
            {
              description: `Eliminados ${pathsToDelete.length} camino(s)`,
              reverts: pathsToDelete.map((p) => ({ type: 'ADD_PATH', pathData: p })),
              timestamp: Date.now(),
            },
          ]);
          setIaFeedback({
            type: 'success',
            text: `✨ Se han eliminado ${pathsToDelete.length} camino(s) y pista(s) del mapa.`,
          });
          if (onReloadPaths) await onReloadPaths();
        } catch (err) {
          setIaFeedback({ type: 'error', text: `Error al eliminar caminos: ${err.message}` });
        } finally {
          setIsProcessingIa(false);
        }
        return;
      }
    }

    // ─── IMPORTACIÓN DIRECTA DE ARCHIVOS KML / KMZ / GEOJSON / GPX CON AUTO-INDEXACIÓN RAG ───
    const geoAtt = attsOrder.find(
      (a) =>
        (a.name &&
          (a.name.toLowerCase().endsWith('.kml') ||
            a.name.toLowerCase().endsWith('.kmz') ||
            a.name.toLowerCase().endsWith('.geojson') ||
            a.name.toLowerCase().endsWith('.gpx'))) ||
        (a.textContent &&
          (a.textContent.includes('<kml') ||
            a.textContent.includes('"FeatureCollection"') ||
            a.textContent.includes('<gpx'))) ||
        Boolean(a.isKmz)
    );

    if (geoAtt) {
      let kmlText = geoAtt.textContent;
      if (!kmlText && (geoAtt.isKmz || geoAtt.name?.toLowerCase().endsWith('.kmz')) && geoAtt.file) {
        try {
          const unzipped = await extractKmlFromKmz(geoAtt.file);
          kmlText = unzipped.kmlText;
          geoAtt.textContent = kmlText;
        } catch (unzipErr) {
          console.warn('[MapAI] Error descomprimiendo KMZ:', unzipErr.message);
        }
      }

      if (kmlText) {
        const isGeoJson =
          geoAtt.name?.toLowerCase().endsWith('.geojson') || kmlText.includes('"FeatureCollection"');
        const isGpx = geoAtt.name?.toLowerCase().endsWith('.gpx') || kmlText.includes('<gpx');
        const parsedGeo = isGeoJson
          ? parseGeoJsonString(kmlText)
          : isGpx
            ? parseGpxString(kmlText)
            : parseKmlString(kmlText);

        if (parsedGeo.points.length > 0 || parsedGeo.paths.length > 0) {
          setMapIaInput('');
          syncTextareaHeight(mapIaTextareaRef.current, '');
          setPendingVoiceAudio(null);
          setPendingAttachments([]);
          setIsProcessingIa(true);
          setIaFeedback({
            type: 'info',
            text: `🗺️ Importando e indexando ${parsedGeo.points.length} punto(s) y ${parsedGeo.paths.length} camino(s) desde "${geoAtt.name}"...`,
          });

          // Auto-indexar en el RAG para que quede aprendido en la biblioteca vectorial permanentemente
          indexDocumentForRag({
            file: geoAtt.file,
            name: geoAtt.name,
            textContent: kmlText,
            dataUrl: geoAtt.dataUrl,
            userName: 'Admin',
            apiKey: import.meta.env.VITE_GEMINI_API_KEY,
          }).catch((ragErr) => console.warn('[MapAI] Aviso indexando en RAG:', ragErr.message));

          try {
            const execRes = await executeUnifiedActions({
              parsedCommands: {
                points: parsedGeo.points,
                paths: parsedGeo.paths,
              },
              currentInventory: localInventory,
              currentPaths: localPaths,
            });

            if (execRes.addedPoints.length > 0) {
              setLocalInventory((prev) => [...execRes.addedPoints, ...prev]);
              execRes.addedPoints.forEach((it) => {
                const cat = getItemCategory(it);
                setVisibleCategories((prev) => new Set([...prev, cat]));
              });
            }
            if (execRes.addedPaths.length > 0) {
              setLocalPaths((prev) => [...execRes.addedPaths, ...prev]);
            }

            setIaFeedback({
              type: 'success',
              text: `✨ Archivo ${geoAtt.name.endsWith('.kmz') ? 'KMZ' : 'KML'} importado y aprendido con éxito: ${execRes.addedPoints.length} puntos y ${execRes.addedPaths.length} caminos registrados en el mapa.`,
            });
            if (onReloadInventory) await onReloadInventory();
            if (onReloadPaths) await onReloadPaths();
          } catch (err) {
            setIaFeedback({ type: 'error', text: `Error importando archivo cartográfico: ${err.message}` });
          } finally {
            setIsProcessingIa(false);
          }
          return;
        }
      }
    }

    const directParsed = parseStructuredCommands(textOrder);
    if (directParsed.points.length > 0 || directParsed.deletions.length > 0) {
      setMapIaInput('');
      setPendingVoiceAudio(null);
      setPendingAttachments([]);
      setIsProcessingIa(true);
      setIaFeedback({
        type: 'info',
        text: `📍 Procesando comando estructurado (${directParsed.points.length} punto(s))...`,
      });

      try {
        const center = mapInstanceRef.current
          ? [mapInstanceRef.current.getCenter().lat, mapInstanceRef.current.getCenter().lng]
          : DEFAULT_CENTER;
        const gpsPos = liveUserGpsRef.current || voiceCurrentGps || null;

        const actions = [
          ...directParsed.points.map((p) => ({ type: 'ADD_POINT', data: p })),
          ...directParsed.deletions.map((d) => ({ type: 'DELETE_POINT', data: d })),
        ];

        const execResult = await executeInventoryActions({
          actions,
          liveGps: gpsPos,
          mapCenter: center,
          selectedTarget,
          currentInventory: localInventory,
          currentPaths: localPaths,
        });

        if (execResult.addedItems.length > 0) {
          setLocalInventory((prev) => [
            ...execResult.addedItems,
            ...prev.filter((i) => !execResult.addedItems.some((a) => String(a.id) === String(i.id))),
          ]);
          const newCats = new Set(execResult.addedItems.map((it) => getItemCategory(it)).filter(Boolean));
          if (newCats.size > 0) {
            setVisibleCategories((prev) => new Set([...prev, ...newCats]));
          }
          const lastOne = execResult.addedItems[execResult.addedItems.length - 1];
          if (mapInstanceRef.current && lastOne.latitude && lastOne.longitude) {
            mapInstanceRef.current.panTo([lastOne.latitude, lastOne.longitude]);
          }
          setSelectedTarget({
            type: 'point',
            id: lastOne.id,
            title: lastOne.name,
            category: getItemCategory(lastOne),
            variety: lastOne.variety_type,
            status: lastOne.status,
            notes: lastOne.notes,
            lat: lastOne.latitude,
            lng: lastOne.longitude,
            photo_url: lastOne.photo_url,
            raw: lastOne,
          });
        }

        if (execResult.deletedItems.length > 0) {
          const deletedSet = new Set(execResult.deletedItems.map((id) => String(id)));
          setLocalInventory((prev) => prev.filter((i) => !deletedSet.has(String(i.id))));
          if (selectedTarget && deletedSet.has(String(selectedTarget.id))) {
            setSelectedTarget(null);
          }
        }

        if (execResult.reverts.length > 0) {
          setUndoStack((prev) => [
            ...prev,
            {
              description: `Registrado(s) ${execResult.addedItems.length} punto(s)`,
              reverts: execResult.reverts,
              timestamp: Date.now(),
            },
          ]);
        }

        setIaFeedback({
          type: 'success',
          text: `✨ Registrado(s) ${execResult.addedItems.length} punto(s) en el mapa`,
        });
        if (onReloadInventory) await onReloadInventory();
      } catch (err) {
        setIaFeedback({ type: 'error', text: `Error registrando puntos: ${err.message}` });
      } finally {
        setIsProcessingIa(false);
      }
      return;
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setIaFeedback({
        type: 'error',
        text: 'API Key de Gemini no configurada en las variables de entorno.',
      });
      return;
    }

    setIsProcessingIa(true);
    setIaFeedback({ type: 'info', text: '🤖 Analizando orden y ejecutando cambios en el mapa...' });

    let uploadedPhotoUrl = null;
    const firstImageAtt = attsOrder.find((a) => a?.file && a.isImage) || null;
    if (firstImageAtt) {
      try {
        const fileExt = firstImageAtt.name ? firstImageAtt.name.split('.').pop() : 'jpg';
        const cleanFileName = `map-photos/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: upErr } = await supabase.storage
          .from('comprobantes')
          .upload(cleanFileName, firstImageAtt.file, { contentType: firstImageAtt.type || 'image/jpeg' });
        if (!upErr) {
          const { data: pubData } = supabase.storage.from('comprobantes').getPublicUrl(cleanFileName);
          uploadedPhotoUrl = pubData?.publicUrl || null;
        }
      } catch (upEx) {
        console.warn('[MapAI] Error subiendo foto a Supabase storage:', upEx);
      }
      if (!uploadedPhotoUrl && firstImageAtt.dataUrl) {
        uploadedPhotoUrl = firstImageAtt.dataUrl;
      }
    }

    setMapIaInput('');
    syncTextareaHeight(mapIaTextareaRef.current, '');
    setPendingVoiceAudio(null);
    setPendingAttachments([]);

    const center = mapInstanceRef.current
      ? [mapInstanceRef.current.getCenter().lat, mapInstanceRef.current.getCenter().lng]
      : DEFAULT_CENTER;
    const firstGpsTrackPt = audioOrder?.gpsTrack?.length > 0 ? normalizeLatLngObj(audioOrder.gpsTrack[0]) : null;
    const gpsPos =
      firstGpsTrackPt ||
      (liveUserGpsRef.current ? normalizeLatLngObj(liveUserGpsRef.current) : null) ||
      (voiceCurrentGps ? normalizeLatLngObj(voiceCurrentGps) : null);

    // Recuperación vectorial RAG previa a invocar a Gemini
    let ragSnippet = '';
    try {
      const ragQuery = textOrder || (audioOrder?.transcription || 'elementos cartográficos KML y puntos de la finca');
      const ragResults = await searchRagKnowledge(ragQuery, {
        matchThreshold: 0.32,
        matchCount: 6,
        apiKey,
      });
      if (ragResults.length > 0) {
        ragSnippet = formatRagContextForPrompt(ragResults);
      }
    } catch (ragSearchErr) {
      console.warn('[MapAI] Error buscando en RAG:', ragSearchErr.message);
    }

    const systemInstruction = buildMapSystemInstruction({
      selectedTarget,
      visibleInventory: filteredInventory,
      visiblePaths: filteredPaths,
      mapCenter: center,
      currentGps: gpsPos,
      audio: audioOrder,
    }) + (ragSnippet ? '\n\n' + ragSnippet : '');

    let effectivePrompt = textOrder;
    if (!effectivePrompt && audioOrder) {
      effectivePrompt = selectedTarget
        ? `Escucha atentamente este audio del agricultor para el elemento seleccionado "${selectedTarget.title}" (${selectedTarget.type} en lat ${selectedTarget.lat}, lng ${selectedTarget.lng}). Transcribe en "transcription", interpreta la orden (añadir pin, renombrar, cambiar estado, notas o borrar) y genera el JSON con la acción correspondiente.`
        : 'Escucha atentamente este audio de campo. Transcribe en "transcription", extrae los elementos descritos y genera las acciones correspondientes (ADD_POINT, ADD_PATH, etc.) indicando timestamp_audio_s para cada uno.';
    }

    const slimAudioMeta = audioOrder
      ? {
          t0: audioOrder.t0,
          duration: audioOrder.duration || 1,
          gpsTrack: Array.isArray(audioOrder.gpsTrack)
            ? audioOrder.gpsTrack.slice(0, 200).map((p) => ({
                timestamp: p.timestamp,
                lat: p.lat,
                lng: p.lng,
                accuracy: p.accuracy,
                altitude: p.altitude ?? null,
              }))
            : [],
        }
      : null;

    const { jobId } = startAiBackgroundJob({
      section: 'mapas',
      prompt: effectivePrompt,
      systemInstruction,
      attachment: attsOrder[0] || null,
      attachments: attsOrder,
      audio: audioOrder,
      responseMimeType: 'application/json',
      uiMeta: {
        textOrder,
        audioMeta: slimAudioMeta,
        gpsPos,
        targetSnapshot: selectedTarget || null,
      },
      directFallbackFn: async () => {
        try {
          const brainRes = await callUnifiedAiBrain({
            prompt: textOrder,
            section: 'mapas',
            audio: audioOrder,
            attachments: attsOrder,
            selectedTarget,
            visibleInventory: filteredInventory,
            visiblePaths: filteredPaths,
            mapCenter: center,
            currentGps: gpsPos,
            apiKey,
          });
          const parsed = parseMapGeminiRawText(brainRes.rawText, audioOrder);
          return { parsed, rawText: brainRes.rawText, unifiedCommands: brainRes.parsedCommands };
        } catch (brainErr) {
          console.warn('[MapAI] Fallback a orquestador legacy:', brainErr.message);
          const directParsed = await callGeminiForInventoryAction({
            prompt: textOrder,
            audio: audioOrder,
            attachment: attsOrder[0] || null,
            attachments: attsOrder,
            selectedTarget,
            visibleInventory: filteredInventory,
            visiblePaths: filteredPaths,
            mapCenter: center,
            currentGps: gpsPos,
            apiKey,
          });
          return { parsed: directParsed };
        }
      },
    });

    mapRuntimeContextMap.set(jobId, {
      textOrder,
      audioOrder,
      uploadedPhotoUrl,
      center,
      gpsPos,
      targetSnapshot: selectedTarget,
    });
  };

  const consumedMapJobsRef = useRef(new Set());
  const applyCompletedMapJobRef = useRef(null);

  const applyCompletedMapJob = async (job) => {
    if (!job || consumedMapJobsRef.current.has(job.jobId)) return;
    consumedMapJobsRef.current.add(job.jobId);
    acknowledgeAiJob(job.jobId);

    const ctx = mapRuntimeContextMap.get(job.jobId) || {};
    mapRuntimeContextMap.delete(job.jobId);

    const textOrder = ctx.textOrder ?? job.uiMeta?.textOrder ?? '';
    const audioOrder = ctx.audioOrder || job.uiMeta?.audioMeta || null;
    const uploadedPhotoUrl = ctx.uploadedPhotoUrl || null;
    const center =
      ctx.center ||
      (mapInstanceRef.current
        ? [mapInstanceRef.current.getCenter().lat, mapInstanceRef.current.getCenter().lng]
        : DEFAULT_CENTER);
    const gpsPos = ctx.gpsPos || job.uiMeta?.gpsPos || liveUserGpsRef.current || voiceCurrentGps || null;
    const targetSnap =
      ctx.targetSnapshot !== undefined ? ctx.targetSnapshot : (job.uiMeta?.targetSnapshot ?? selectedTarget);

    try {
      let result = job.result?.parsed || null;
      if (!result && job.result?.rawText) {
        result = parseMapGeminiRawText(job.result.rawText, audioOrder);
      }
      if (result && (!result.actions || result.actions.length === 0) && job.result?.rawText) {
        result = parseMapGeminiRawText(job.result.rawText, audioOrder) || result;
      }
      if (!result) {
        setIaFeedback({ type: 'info', text: 'Respuesta procesada.' });
        return;
      }

      if (job.result?.rawText) {
        const uCmds = job.result.unifiedCommands || parseAllStructuredCommands(job.result.rawText);
        if (
          (uCmds.memories && uCmds.memories.length > 0) ||
          (uCmds.customTools && uCmds.customTools.length > 0) ||
          (uCmds.events && uCmds.events.length > 0) ||
          (uCmds.transactions && uCmds.transactions.length > 0)
        ) {
          executeUnifiedActions({
            parsedCommands: uCmds,
            currentInventory: localInventory,
            currentPaths: localPaths,
          }).catch((err) => console.warn('[MapAI] Error ejecutando acciones complementarias:', err));
        }
      }

      if (!result.actions || result.actions.length === 0) {
        if (targetSnap?.type === 'point' && (uploadedPhotoUrl || textOrder || audioOrder)) {
          const prevItem = localInventory.find((i) => String(i.id) === String(targetSnap.id));
          const updatePayload = { updated_at: new Date().toISOString() };
          if (uploadedPhotoUrl) updatePayload.photo_url = uploadedPhotoUrl;
          const noteToAdd = textOrder || (result.transcription ? `Audio: "${result.transcription}"` : null);
          if (noteToAdd) {
            updatePayload.notes = prevItem?.notes ? `${prevItem.notes}\n${noteToAdd}` : noteToAdd;
          }

          await updateFarmInventoryItem(targetSnap.id, updatePayload);
          markJobActionsApplied(job.jobId);

          setUndoStack((prev) => [
            ...prev,
            {
              description: `Actualizado ${targetSnap.title}`,
              reverts: [
                {
                  type: 'UPDATE_POINT',
                  target_id: targetSnap.id,
                  prevData: {
                    photo_url: prevItem?.photo_url || null,
                    notes: prevItem?.notes || '',
                  },
                },
              ],
              timestamp: Date.now(),
            },
          ]);
          setSelectedTarget((prev) => (prev ? { ...prev, ...updatePayload } : prev));
          setLocalInventory((prev) =>
            prev.map((i) => (String(i.id) === String(targetSnap.id) ? { ...i, ...updatePayload } : i))
          );
          setIaFeedback({ type: 'success', text: `✨ Datos guardados en ${targetSnap.title}` });
          if (onReloadInventory) await onReloadInventory();
          return;
        }

        if (targetSnap?.type === 'path' && (uploadedPhotoUrl || textOrder || audioOrder)) {
          const prevPath = localPaths.find((p) => String(p.id) === String(targetSnap.id));
          const updatePayload = {};
          const noteToAdd = textOrder || (result.transcription ? `Audio: "${result.transcription}"` : null);
          if (noteToAdd) {
            updatePayload.notes = prevPath?.notes ? `${prevPath.notes}\n${noteToAdd}` : noteToAdd;
          }

          await updateFarmPath(targetSnap.id, updatePayload);
          markJobActionsApplied(job.jobId);
          setSelectedTarget((prev) => (prev ? { ...prev, ...updatePayload } : prev));
          setLocalPaths((prev) =>
            prev.map((p) => (String(p.id) === String(targetSnap.id) ? { ...p, ...updatePayload } : p))
          );
          setIaFeedback({ type: 'success', text: `✨ Notas actualizadas en ${targetSnap.title}` });
          if (onReloadPaths) await onReloadPaths();
          return;
        }

        if ((targetSnap?.type === 'catastro' || targetSnap?.type === 'coord') && (uploadedPhotoUrl || textOrder || audioOrder)) {
          let rawName = textOrder || result.transcription || '';
          if (!rawName && result.description && !result.description.toLowerCase().includes('no se')) {
            rawName = result.description;
          }
          if (!rawName) rawName = targetSnap.title || 'Punto registrado';
          if (rawName.length > 35) rawName = rawName.slice(0, 32) + '...';
          const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

          let category = targetSnap.type === 'catastro' ? 'hito' : 'riego';
          const lowerName = formattedName.toLowerCase();
          if (
            lowerName.includes('casa') ||
            lowerName.includes('casita') ||
            lowerName.includes('cueva') ||
            lowerName.includes('edificio') ||
            lowerName.includes('almacen') ||
            lowerName.includes('caseta') ||
            lowerName.includes('taller') ||
            lowerName.includes('caravana')
          ) {
            category = 'edificio';
          } else if (
            lowerName.includes('arbol') ||
            lowerName.includes('aguacate') ||
            lowerName.includes('olivo') ||
            lowerName.includes('limon') ||
            lowerName.includes('naranjo')
          ) {
            category = 'arbol';
          } else if (
            lowerName.includes('riego') ||
            lowerName.includes('llave') ||
            lowerName.includes('arqueta') ||
            lowerName.includes('pozo') ||
            lowerName.includes('deposito')
          ) {
            category = 'riego';
          }

          const notes = textOrder
            ? targetSnap.notes
              ? `${targetSnap.notes}\n${textOrder}`
              : textOrder
            : result.transcription
              ? `Audio: "${result.transcription}"`
              : targetSnap.notes || 'Registrado con Agente IA';

          const newItem = {
            name: formattedName,
            category,
            variety_type: targetSnap.type === 'catastro' ? 'Cota Catastral' : null,
            status: 'saludable',
            latitude: targetSnap.lat,
            longitude: targetSnap.lng,
            notes,
            photo_url: uploadedPhotoUrl || null,
            is_active: true,
          };
          const inserted = await insertFarmInventoryItem(newItem);
          markJobActionsApplied(job.jobId);
          if (inserted) {
            setSelectedTarget({
              type: 'point',
              id: inserted.id,
              title: inserted.name,
              category: getItemCategory(inserted),
              variety: inserted.variety_type,
              status: inserted.status,
              notes: inserted.notes,
              lat: inserted.latitude,
              lng: inserted.longitude,
              photo_url: inserted.photo_url,
              raw: inserted,
            });
            if (mapInstanceRef.current) {
              mapInstanceRef.current.panTo([inserted.latitude, inserted.longitude]);
            }
            setIaFeedback({ type: 'success', text: `✨ Registrado en inventario: ${inserted.name}` });
            if (onReloadInventory) await onReloadInventory();
            return;
          }
        }

        setIaFeedback({
          type: 'info',
          text: result.description || result.transcription || 'No se requirieron cambios en el mapa.',
        });
        return;
      }

      const execResult = await executeInventoryActions({
        actions: result.actions,
        audio: audioOrder,
        liveGps: gpsPos,
        mapCenter: center,
        selectedTarget: targetSnap,
        currentInventory: localInventory,
        currentPaths: localPaths,
        uploadedPhotoUrl,
      });
      markJobActionsApplied(job.jobId);

      if (execResult.deletedItems.length > 0) {
        const deletedSet = new Set(execResult.deletedItems.map((id) => String(id)));
        setLocalInventory((prev) => prev.filter((i) => !deletedSet.has(String(i.id))));
        if (selectedTarget && deletedSet.has(String(selectedTarget.id))) {
          setSelectedTarget(null);
        }
      }
      if (execResult.deletedPaths.length > 0) {
        const deletedPathSet = new Set(execResult.deletedPaths.map((id) => String(id)));
        setLocalPaths((prev) => prev.filter((p) => !deletedPathSet.has(String(p.id))));
        if (selectedTarget && deletedPathSet.has(String(selectedTarget.id))) {
          setSelectedTarget(null);
        }
      }
      if (execResult.updatedItems.length > 0) {
        setLocalInventory((prev) =>
          prev.map((i) => {
            const upd = execResult.updatedItems.find((u) => String(u.id) === String(i.id));
            return upd ? { ...i, ...upd } : i;
          })
        );
        if (selectedTarget && selectedTarget.type === 'point') {
          const upd = execResult.updatedItems.find((u) => String(u.id) === String(selectedTarget.id));
          if (upd) setSelectedTarget((prev) => ({ ...prev, ...upd }));
        }
      }
      if (execResult.updatedPaths.length > 0) {
        setLocalPaths((prev) =>
          prev.map((p) => {
            const upd = execResult.updatedPaths.find((u) => String(u.id) === String(p.id));
            return upd ? { ...p, ...upd } : p;
          })
        );
        if (selectedTarget && selectedTarget.type === 'path') {
          const upd = execResult.updatedPaths.find((u) => String(u.id) === String(selectedTarget.id));
          if (upd) setSelectedTarget((prev) => ({ ...prev, ...upd }));
        }
      }
      if (execResult.addedItems.length > 0) {
        setLocalInventory((prev) => [
          ...execResult.addedItems,
          ...prev.filter((i) => !execResult.addedItems.some((a) => String(a.id) === String(i.id))),
        ]);
        const newCats = new Set(execResult.addedItems.map((it) => getItemCategory(it)).filter(Boolean));
        if (newCats.size > 0) {
          setVisibleCategories((prev) => new Set([...prev, ...newCats]));
        }
        const newSubs = execResult.addedItems
          .map((it) => it.variety_type || it.category || it.tipo || '')
          .filter(Boolean);
        if (newSubs.length > 0) {
          setVisibleSubcats((prev) => (prev === null ? prev : new Set([...prev, ...newSubs])));
        }
        const lastOne = execResult.addedItems[execResult.addedItems.length - 1];
        if (mapInstanceRef.current && lastOne.latitude && lastOne.longitude) {
          mapInstanceRef.current.panTo([lastOne.latitude, lastOne.longitude]);
        }
        setSelectedTarget({
          type: 'point',
          id: lastOne.id,
          title: lastOne.name,
          category: getItemCategory(lastOne),
          variety: lastOne.variety_type,
          status: lastOne.status,
          notes: lastOne.notes,
          lat: lastOne.latitude,
          lng: lastOne.longitude,
          photo_url: lastOne.photo_url,
          raw: lastOne,
        });
      }
      if (execResult.addedPaths.length > 0) {
        setLocalPaths((prev) => [
          ...execResult.addedPaths,
          ...prev.filter((p) => !execResult.addedPaths.some((a) => String(a.id) === String(p.id))),
        ]);
        const lastPath = execResult.addedPaths[execResult.addedPaths.length - 1];
        if (mapInstanceRef.current && lastPath?.coordinates) {
          const normCoords = normalizeCoordinatesArray(lastPath.coordinates);
          if (normCoords.length > 0) {
            mapInstanceRef.current.panTo(normCoords[0]);
          }
        }
        setSelectedTarget({
          type: 'path',
          id: lastPath.id,
          title: lastPath.name,
          path_type: lastPath.path_type,
          color: lastPath.color,
          notes: lastPath.notes,
          coordinates: lastPath.coordinates,
          raw: lastPath,
        });
      }

      if (execResult.reverts.length > 0) {
        setUndoStack((prev) => [
          ...prev,
          {
            description: result.description || 'Cambios en el mapa',
            reverts: execResult.reverts,
            timestamp: Date.now(),
          },
        ]);
        setIaFeedback({
          type: 'success',
          text: `✨ ${result.description || 'Cambios aplicados en el mapa'} (Pulsa ↩️ para revertir)`,
        });
      } else {
        setIaFeedback({ type: 'info', text: result.description || 'No se realizaron modificaciones.' });
      }

      if (onReloadInventory) await onReloadInventory();
      if (onReloadPaths) await onReloadPaths();
    } catch (err) {
      console.error('[MapAI] Error aplicando respuesta en mapa:', err);
      setIaFeedback({ type: 'error', text: `Error al ejecutar: ${err.message}` });
    }
  };

  useEffect(() => {
    applyCompletedMapJobRef.current = applyCompletedMapJob;
  });

  useEffect(() => {
    const unsubscribe = subscribeSectionJobs('mapas', (snap) => {
      setIsProcessingIa(snap.isProcessing);
      if (snap.isProcessing) {
        setIaFeedback({ type: 'info', text: '🤖 Analizando orden en segundo plano...' });
      }
      if (Array.isArray(snap.errorUnacked) && snap.errorUnacked.length > 0) {
        const errJob = snap.errorUnacked[0];
        if (errJob && !consumedMapJobsRef.current.has(errJob.jobId)) {
          consumedMapJobsRef.current.add(errJob.jobId);
          acknowledgeAiJob(errJob.jobId);
          setIaFeedback({ type: 'error', text: `Error al ejecutar: ${errJob.error || 'Error desconocido'}` });
        }
      }
      for (const finishedJob of snap.completedUnacked) {
        applyCompletedMapJobRef.current?.(finishedJob);
      }
    });
    return unsubscribe;
  }, [setIaFeedback, setIsProcessingIa]);

  const handleUndoMapAction = async () => {
    if (undoStack.length === 0 || isProcessingIa) return;
    const lastAction = undoStack[undoStack.length - 1];

    setIsProcessingIa(true);
    setIaFeedback({ type: 'info', text: `↩️ Revirtiendo: "${lastAction.description}"...` });

    try {
      for (const rev of lastAction.reverts) {
        if (rev.type === 'RESTORE_POINT') {
          await insertFarmInventoryItem(rev.itemData);
          setLocalInventory((prev) => [
            rev.itemData,
            ...prev.filter((i) => String(i.id) !== String(rev.itemData.id)),
          ]);
        } else if (rev.type === 'RESTORE_PATH') {
          await insertFarmPath(rev.pathData);
          setLocalPaths((prev) => [
            rev.pathData,
            ...prev.filter((p) => String(p.id) !== String(rev.pathData.id)),
          ]);
        } else if (rev.type === 'UPDATE_POINT') {
          await updateFarmInventoryItem(rev.target_id, rev.prevData);
          setLocalInventory((prev) =>
            prev.map((i) => (String(i.id) === String(rev.target_id) ? { ...i, ...rev.prevData } : i))
          );
        } else if (rev.type === 'UPDATE_PATH') {
          await updateFarmPath(rev.target_id, rev.prevData);
          setLocalPaths((prev) =>
            prev.map((p) => (String(p.id) === String(rev.target_id) ? { ...p, ...rev.prevData } : p))
          );
        } else if (rev.type === 'DELETE_POINT') {
          setLocalInventory((prev) => prev.filter((i) => String(i.id) !== String(rev.target_id)));
          await deleteFarmInventoryItem(rev.target_id);
        } else if (rev.type === 'DELETE_PATH') {
          setLocalPaths((prev) => prev.filter((p) => String(p.id) !== String(rev.target_id)));
          await deleteFarmPath(rev.target_id);
        }
      }

      setUndoStack((prev) => prev.slice(0, -1));
      setIaFeedback({ type: 'success', text: `↩️ Acción deshecha con éxito: ${lastAction.description}` });
      if (onReloadInventory) onReloadInventory();
      if (onReloadPaths) onReloadPaths();
    } catch (err) {
      console.error('Error deshaciendo acción:', err);
      setIaFeedback({ type: 'error', text: `Error al deshacer: ${err.message}` });
    } finally {
      setIsProcessingIa(false);
    }
  };

  return {
    isVoiceRecording,
    voiceRecordingSeconds,
    voiceCurrentGps,
    wakeLockActive,
    pendingVoiceAudio,
    isPreviewPlaying,
    setIsPreviewPlaying,
    previewCurrentTime,
    setPreviewCurrentTime,
    previewDuration,
    setPreviewDuration,
    previewAudioRef,
    togglePlayPreview,
    handleSeekPreview,
    handleDiscardVoice,
    handleStartVoiceRecording,
    handleCancelVoiceRecording,
    handleStopVoiceRecording,
    handleCameraClick,
    handleCameraChange,
    handleAttachClick,
    handleDocumentChange,
    handleSendMapIaOrder,
    handleUndoMapAction,
  };
}

