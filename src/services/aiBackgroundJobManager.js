// src/services/aiBackgroundJobManager.js
// Gestor global de trabajos en segundo plano (Background Jobs) para Chat IA, Mapas, Calendario y Gasto-Ingreso.
// Vive fuera del ciclo de vida de React (módulo singleton + localStorage + backend /api/chat-job),
// garantizando que:
// 1. Al cambiar de sección en la app (SPA), la generación sigue corriendo sin interrupciones.
// 2. Al recargar la página (F5 / cerrar y abrir PWA), el backend continúa generando la respuesta
//    y al volver se reanuda el seguimiento automáticamente para mostrar el resultado.

const STORAGE_KEY = 'campito_ai_bg_jobs_v1';
const MAX_JOBS = 20;
const STALE_JOB_MS = 4 * 60 * 1000; // 4 minutos máximo para un job en curso

const sectionListeners = new Map(); // section -> Set<fn>
const globalListeners = new Set(); // Set<fn>
const activeRunners = new Map(); // jobId -> Promise

function readJobsStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJobsStore(jobs) {
  try {
    const now = Date.now();
    const pruned = [...jobs]
      .filter((j) => {
        if (!j || !j.jobId) return false;
        // Conservar trabajos activos, no reconocidos, o completados hace menos de 2 horas
        if (j.status === 'processing' || !j.acknowledged) return true;
        return now - (j.updatedAt || j.createdAt || now) < 2 * 60 * 60 * 1000;
      })
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, MAX_JOBS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch (err) {
    console.warn('[aiBackgroundJobManager] Error guardando estado en localStorage:', err.message);
  }
}

function upsertJobRecord(updatedJob) {
  const jobs = readJobsStore();
  const idx = jobs.findIndex((j) => j.jobId === updatedJob.jobId);
  const next = { ...updatedJob, updatedAt: Date.now() };
  if (idx >= 0) {
    jobs[idx] = { ...jobs[idx], ...next };
  } else {
    jobs.unshift(next);
  }
  writeJobsStore(jobs);
  notifyListeners(next.section);
  return next;
}

function notifyListeners(section) {
  if (section && sectionListeners.has(section)) {
    const snapshot = getSectionJobSnapshot(section);
    for (const cb of sectionListeners.get(section)) {
      try {
        cb(snapshot);
      } catch (e) {
        console.warn('[aiBackgroundJobManager] Error en listener de sección:', e);
      }
    }
  }
  const globalSnap = getGlobalJobsSummary();
  for (const cb of globalListeners) {
    try {
      cb(globalSnap);
    } catch (e) {
      console.warn('[aiBackgroundJobManager] Error en listener global:', e);
    }
  }
}

/**
 * Devuelve el estado de jobs para una sección concreta
 */
function getSectionJobSnapshot(section) {
  const jobs = readJobsStore().filter((j) => j.section === section);
  const processingJobs = jobs.filter((j) => j.status === 'processing');
  const completedUnacked = jobs.filter((j) => j.status === 'completed' && !j.acknowledged);
  const errorUnacked = jobs.filter((j) => j.status === 'error' && !j.acknowledged);
  return {
    isProcessing: processingJobs.length > 0,
    processingJobs,
    completedUnacked,
    errorUnacked,
    latestJob: jobs[0] || null,
  };
}

/**
 * Devuelve resumen global (usado en Layout para indicador visual en navegación)
 */
export function getGlobalJobsSummary() {
  const jobs = readJobsStore();
  const processingBySection = {};
  const unackedBySection = {};
  let totalProcessing = 0;
  let totalUnacked = 0;

  for (const j of jobs) {
    if (j.status === 'processing') {
      totalProcessing++;
      processingBySection[j.section] = (processingBySection[j.section] || 0) + 1;
    } else if ((j.status === 'completed' || j.status === 'error') && !j.acknowledged) {
      totalUnacked++;
      unackedBySection[j.section] = (unackedBySection[j.section] || 0) + 1;
    }
  }

  return {
    totalProcessing,
    totalUnacked,
    processingBySection,
    unackedBySection,
  };
}

/**
 * Suscribirse a cambios de jobs de una sección ('chat-ia' | 'calendario' | 'gasto-ingreso' | 'mapas')
 */
export function subscribeSectionJobs(section, callback) {
  if (!sectionListeners.has(section)) {
    sectionListeners.set(section, new Set());
  }
  sectionListeners.get(section).add(callback);

  // Entregar estado actual inmediatamente y reanudar pendientes si los hubiera
  callback(getSectionJobSnapshot(section));
  resumePendingJobsForSection(section);

  return () => {
    const set = sectionListeners.get(section);
    if (set) {
      set.delete(callback);
      if (set.size === 0) sectionListeners.delete(section);
    }
  };
}

/**
 * Suscribirse al resumen global de background jobs (para Layout / barra superior)
 */
export function subscribeGlobalJobs(callback) {
  globalListeners.add(callback);
  callback(getGlobalJobsSummary());
  resumeAllPendingJobs();
  return () => {
    globalListeners.delete(callback);
  };
}

/**
 * Marca un job como ya leído/mostrado en la UI
 */
export function acknowledgeAiJob(jobId) {
  const jobs = readJobsStore();
  const found = jobs.find((j) => j.jobId === jobId);
  if (!found) return;
  found.acknowledged = true;
  found.updatedAt = Date.now();
  writeJobsStore(jobs);
  notifyListeners(found.section);

  fetch('/api/chat-job', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, acknowledged: true }),
  }).catch(() => {});
}

/**
 * Marca que las acciones en BD de este job ya fueron aplicadas (evita duplicados)
 */
export function markJobActionsApplied(jobId) {
  const jobs = readJobsStore();
  const found = jobs.find((j) => j.jobId === jobId);
  if (!found) return;
  found.actionsApplied = true;
  found.updatedAt = Date.now();
  writeJobsStore(jobs);
}

/**
 * Polling contra /api/chat-job hasta completar o fallar
 */
async function pollServerJob(jobRecord) {
  const { jobId, section } = jobRecord;
  const startTime = Date.now();
  let notFoundRetries = 0;

  while (Date.now() - startTime < STALE_JOB_MS) {
    try {
      const res = await fetch(`/api/chat-job?id=${encodeURIComponent(jobId)}`);
      if (res.status === 404) {
        notFoundRetries++;
        // Si tras 2 intentos no está en el servidor (ej: reinicio tras recarga), intentar re-lanzar si es recuperable
        if (notFoundRetries >= 2) {
          if (jobRecord.resumeRequest?.prompt && jobRecord.resumeRequest?.systemInstruction) {
            const reRes = await fetch('/api/chat-job', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId,
                section,
                ...jobRecord.resumeRequest,
              }),
            });
            if (reRes.ok) {
              notFoundRetries = 0;
              await new Promise((r) => setTimeout(r, 900));
              continue;
            }
          }

          return upsertJobRecord({
            ...jobRecord,
            status: 'error',
            error: 'La tarea en segundo plano expiró tras recargar la página.',
          });
        }
        await new Promise((r) => setTimeout(r, 750));
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        const serverJob = data?.job;
        if (serverJob) {
          if (serverJob.status === 'completed') {
            return upsertJobRecord({
              ...jobRecord,
              status: 'completed',
              actionsApplied: Boolean(serverJob.actionsApplied),
              persistedToDb: Boolean(serverJob.persistedToDb),
              result: serverJob.result,
              error: null,
            });
          }
          if (serverJob.status === 'error') {
            return upsertJobRecord({
              ...jobRecord,
              status: 'error',
              error: serverJob.error || 'Error en generación IA.',
            });
          }
        }
      }
    } catch {
      // Reintentar silenciosamente si hay un micro-corte de red
    }

    await new Promise((r) => setTimeout(r, 900));
  }

  return upsertJobRecord({
    ...jobRecord,
    status: 'error',
    error: 'Tiempo máximo de espera superado.',
  });
}

/**
 * Reanuda cualquier job pendiente tras recarga o cambio de ruta
 */
function resumePendingJobsForSection(section) {
  const jobs = readJobsStore().filter((j) => j.section === section && j.status === 'processing');
  for (const job of jobs) {
    if (activeRunners.has(job.jobId)) continue;

    if (Date.now() - (job.createdAt || 0) > STALE_JOB_MS) {
      upsertJobRecord({
        ...job,
        status: 'error',
        error: 'Tiempo de generación excedido.',
      });
      continue;
    }

    const runner = pollServerJob(job).finally(() => {
      activeRunners.delete(job.jobId);
    });
    activeRunners.set(job.jobId, runner);
  }
}

function resumeAllPendingJobs() {
  const jobs = readJobsStore().filter((j) => j.status === 'processing');
  const sections = new Set(jobs.map((j) => j.section));
  for (const sec of sections) {
    resumePendingJobsForSection(sec);
  }
}

/**
 * Lanza un nuevo trabajo de IA en segundo plano.
 * - Registra el job inmediatamente en localStorage y notifica suscriptores.
 * - Envía la petición al servidor (/api/chat-job) para sobrevivir recargas de página (F5).
 * - Si el servidor no está disponible, ejecuta directFallbackFn en el contexto global JS
 *   para sobrevivir cambios de ruta SPA sin interrupción.
 */
export function startAiBackgroundJob({
  section,
  prompt = '',
  systemInstruction = '',
  history = [],
  attachment = null,
  audio = null,
  models = null,
  responseMimeType = null,
  userMeta = null,
  meta = null,
  persistToChatHistory = false,
  uiMeta = {},
  directFallbackFn = null,
}) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Guardar copia ligera para poder recuperar si hace falta tras recarga (sin blobs pesados)
  const serializedPayload = {
    prompt,
    systemInstruction,
    history: Array.isArray(history) ? history.slice(-16) : [],
    models,
    responseMimeType,
    userMeta,
    meta,
    persistToChatHistory,
  };

  // Si el payload completo es pequeño, guardar también en resumeRequest (para auto-recuperación)
  const canPersistResumePayload = JSON.stringify(serializedPayload).length < 40000;

  const jobRecord = upsertJobRecord({
    jobId,
    section,
    status: 'processing',
    acknowledged: false,
    actionsApplied: false,
    persistedToDb: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    uiMeta,
    resumeRequest: canPersistResumePayload ? serializedPayload : { prompt, models, responseMimeType, userMeta, meta },
    result: null,
    error: null,
  });

  const fullBody = {
    jobId,
    section,
    prompt,
    systemInstruction,
    history,
    attachment: attachment
      ? {
          name: attachment.name,
          type: attachment.type,
          dataUrl: attachment.dataUrl || null,
          textContent: attachment.textContent || null,
          isImage: Boolean(attachment.isImage),
          isPdf: Boolean(attachment.isPdf),
        }
      : null,
    audio: audio
      ? {
          dataUrl: audio.dataUrl || null,
          mimeType: audio.mimeType || 'audio/webm',
          duration: audio.duration || 1,
        }
      : null,
    models,
    responseMimeType,
    userMeta,
    meta,
    persistToChatHistory,
  };

  const runnerPromise = (async () => {
    try {
      const bodyStr = JSON.stringify(fullBody);
      // Si el payload supera ~3.8 MB (límite serverless 4.5 MB en Vercel), usar ejecución directa sin fallar por HTTP 413
      if (bodyStr.length > 3800000 && typeof directFallbackFn === 'function') {
        const directResult = await directFallbackFn();
        return upsertJobRecord({
          ...jobRecord,
          status: 'completed',
          actionsApplied: Boolean(directResult?.actionsApplied),
          persistedToDb: Boolean(directResult?.persistedToDb),
          result: directResult,
          error: null,
        });
      }

      // keepalive: true permite que el navegador complete el envío incluso si el usuario pulsa F5 inmediatamente (límite 60KB)
      const useKeepalive = bodyStr.length < 55000;

      const postRes = await fetch('/api/chat-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
        keepalive: useKeepalive,
      });

      if (postRes.ok) {
        return await pollServerJob(jobRecord);
      }

      throw new Error(`Servidor devolvió HTTP ${postRes.status}`);
    } catch (serverErr) {
      // Respaldo: ejecutar directamente en el worker singleton JS (sobrevive cambios de ruta SPA)
      if (typeof directFallbackFn === 'function') {
        try {
          const directResult = await directFallbackFn();
          return upsertJobRecord({
            ...jobRecord,
            status: 'completed',
            actionsApplied: Boolean(directResult?.actionsApplied),
            persistedToDb: Boolean(directResult?.persistedToDb),
            result: directResult,
            error: null,
          });
        } catch (fallbackErr) {
          return upsertJobRecord({
            ...jobRecord,
            status: 'error',
            error: fallbackErr.message || serverErr.message || 'Error al procesar solicitud IA.',
          });
        }
      }

      return upsertJobRecord({
        ...jobRecord,
        status: 'error',
        error: serverErr.message || 'Error conectando con el procesador IA.',
      });
    } finally {
      activeRunners.delete(jobId);
    }
  })();

  activeRunners.set(jobId, runnerPromise);
  return { jobId, promise: runnerPromise };
}

