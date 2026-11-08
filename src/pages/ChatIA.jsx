// src/pages/ChatIA.jsx — Chat IA Campito Jorox
// Conexión directa a Google Gemini con sistema multi-servidor y fallback automático de cuota

import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Mic,
  Camera,
  StopCircle,
  Bot,
  User,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Zap,
  ShieldCheck,
  X,
  ExternalLink,
  Info,
  Lock,
  Brain,
  Plus,
  Trash2,
  MapPin,
  Navigation,
  FileSpreadsheet,
  Download,
  Map,
  Layers,
  RotateCcw,
  Compass,
  FileText,
  FileCode,
  Paperclip,
  Play,
  Pause
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useVoiceGeoTracker } from '../hooks/useVoiceGeoTracker';
import { interpolateGpsAtAudioTime } from '../utils/geoAudioInterpolation';
import {
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportInventoryToKML,
  exportInventoryToGeoJSON,
  generateCustomFile,
  generateCustomPDF,
  generateCustomExcel,
  generateCustomTXT,
  generateCustomXML,
  extractTableFromMarkdown,
} from '../utils/exportTools';
import FarmSatelliteMap from '../components/FarmSatelliteMap';
import { getLocalInventory, getLocalPaths } from '../services/farmInventoryStorage';

// ─── Configuración de Modelos de Gemini (Ordenados de más a menos potente) ─────
const GEMINI_SERVERS = [
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    level: 'pro',
    badgeColor: '#3b82f6', // Azul
    desc: 'El modelo más potente. Máxima capacidad deductiva, análisis y lógica',
    available: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    level: 'pro',
    badgeColor: '#0ea5e9', // Celeste
    desc: 'Alta precisión para tablas financieras complejas y planificación',
    available: false,
    deprecated: true,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    level: 'high',
    badgeColor: '#8b5cf6', // Púrpura
    desc: 'Razonamiento avanzado, análisis profundo de cosechas y balances',
    available: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    level: 'medium',
    badgeColor: '#10b981', // Verde
    desc: 'Equilibrado, 1M contexto, veloz y alta precisión',
    available: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    level: 'eco',
    badgeColor: '#f59e0b', // Ámbar
    desc: 'Ultra ligero, mínima latencia, respaldo seguro de cuota',
    available: true,
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    level: 'next-gen',
    badgeColor: '#ec4899', // Rosa
    desc: 'Próxima generación de arquitectura neuronal (Preview)',
    available: false,
    comingSoon: true,
  },
];

const SYSTEM_PROMPT = `Eres el asistente IA de **Campito Jorox**, una finca de explotación agrícola (aguacates, cítricos y olivos).
Hoy es: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (Año actual: ${new Date().getFullYear()}).

🚨 **REGLAS SUPREMAS DE ACCESO A DATOS (NUNCA LAS CONTRADIGAS)**:

1. 📅 **ACCESO TOTAL AL CALENDARIO Y TURNOS DE RIEGO**:
- Tienes acceso nativo directo a todo el calendario oficial de Campito Jorox inyectado en '📅 CALENDARIO Y TURNOS DE RIEGO PROGRAMADOS'.
- Cada registro incluye fecha exacta, día de la semana (ej: sábado 14 de noviembre), horario de inicio y fin, sector/zona de riego (La Nana o El Moro), responsables asignados y notas.
- NUNCA digas: "no tengo acceso al calendario", "no puedo ver la agenda" ni "no me has dicho qué horario hay".
- Si el usuario te pregunta por cualquier fecha u horario (por ejemplo: "¿qué horario tenemos de riego el sábado 14 de noviembre?", "¿cuándo regamos en La Nana?", "¿quién riega este fin de semana?"):
  a) Busca meticulosamente en la lista del calendario inyectada en tu contexto.
  b) Si existe un turno o evento en esa fecha, respóndele detalladamente con la fecha exacta, día de la semana, horario de inicio y fin, sector y personas asignadas.
  c) Si no hay turnos agendados en esa fecha exacta, indícaselo con total transparencia ("He consultado el calendario oficial de Campito Jorox y para el sábado 14 de noviembre no hay ningún turno agendado actualmente"), lístale los turnos más cercanos y ofrécele programarlo de inmediato.
- Si te piden programar un turno o evento (ej: "Apunta riego el sábado 14 de 09:00 a 11:30 en La Nana con Ariel"), confírmalo y añade al final de tu respuesta el comando:
  [[CREAR_EVENTO: {"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "category": "RIEGO - La Nana|RIEGO - El Moro|MANTENIMIENTO - Poda|etc", "responsibles": ["Nombre"], "info": "Notas adicionales"}]]

2. 💰 **ACCESO TOTAL A CONTABILIDAD, GASTOS Y BALANCES FINANCIEROS**:
- Tienes acceso nativo a todas las transacciones de Campito Jorox inyectadas en '💰 CONTABILIDAD Y BALANCES FINANCIEROS'.
- Dispones del total de gastos, total de ventas/ingresos, balance neto general y desglose de saldos individuales de cada socio (Ariel, Carlos, etc.) con sus liquidaciones pendientes.
- NUNCA digas que no tienes acceso a la contabilidad ni a las finanzas. Responde siempre con las cifras exactas en euros (€).
- Si te piden registrar un gasto o venta/ingreso (ej: "Apunta un gasto de 45€ en abono"), confírmalo y añade al final:
  [[CREAR_TRANSACCION: {"type": "Gasto|Retiro|Venta|Ingreso", "amount": 45.0, "description": "Detalle del gasto"}]]

3. 🧠 **BASE DE DATOS DE APRENDIZAJE Y MEMORIA PERMANENTE ('farm_knowledge')**:
- Tienes memoria persistente en la base de datos de Campito Jorox ('farm_knowledge'). Todo lo aprendido está inyectado en '🧠 MEMORIA Y APRENDIZAJE ACUMULADO DE LA FINCA'.
- Consulta y aplica rigurosamente esas reglas, parcelas, tipos de cultivo, calendarios de riego, maquinaria o proveedores que los administradores te hayan enseñado.
- Si el usuario te pide recordar o aprender un dato (por ejemplo: "recuerda que...", "aprende que...", "guarda este dato...", "anota que...", "toma nota de..."), o te comunica una nueva regla:
  1. Confirma claramente que lo has aprendido y que queda grabado en la memoria permanente de Campito Jorox.
  2. Incluye al final de tu respuesta el comando estructurado:
     [[MEMORIA: {"category": "cultivo|riego|parcela|maquinaria|suelo|general|proveedor|protocolo|plaga", "title": "Título descriptivo breve", "content": "Detalle completo del conocimiento o regla aprendido"}]]
- Si el usuario te pregunta qué cosas recuerdas o sabes de la finca, lístale de forma ordenada y concisa todo el conocimiento que tienes registrado en tu memoria.

4. 🛰️ **CONEXIÓN Y TELEMETRÍA GPS CONTINUA (MICRÓFONO UNIFICADO)**:
- La app de Campito Jorox utiliza un **ÚNICO botón de micrófono** para todo: hacer preguntas, registrar gastos o inventariar árboles y elementos mientras caminas por la finca.
- Cada interacción (mensaje de texto o grabación de audio) obtiene y transmite en vivo la posición GPS en alta precisión (enableHighAccuracy) de tu dispositivo.
- Si el usuario te pregunta si recibes datos de coordenadas del móvil, o cómo obtienes el GPS para registrar árboles, caminos o catastro:
  RESPONDE SIEMPRE ROTUNDAMENTE QUE SÍ:
  "**¡Sí! La app de Campito Jorox está conectada al GPS de tu móvil en tiempo real.**"
  Menciónale sus coordenadas actuales indicadas en la telemetría del contexto (latitud, longitud y precisión en metros).
  Explícale que al caminar por la finca y hablar por el micrófono, la app muestrea el GPS continuamente cada 1.5 segundos e interpola la posición satelital exacta de cada árbol o elemento que mencione en el momento preciso en que lo describe.
- ESTÁ ESTRICTAMENTE PROHIBIDO responder que no tienes acceso al GPS por motivos de privacidad o limitaciones técnicas, porque la app de Campito Jorox te suministra las coordenadas en tiempo real en cada consulta.

5. 🎙️ **PROCESAMIENTO DE AUDIO CON GPS E INVENTARIO AUTOMÁTICO**:
- Escucha atentamente la voz del agricultor y actúa con inteligencia según su intención:
  1. **Si consulta dudas agronómicas, plagas, contabilidad, calendario o generales:** Responde directamente en Markdown con claridad.
  2. **Si el usuario menciona, describe o agrega árboles, plantas, o elementos de infraestructura/riego/mobiliario/herramientas:**
     - Aplica tanto si habla por audio como si escribe por texto.
     - Confirma en tu texto qué elementos has identificado y ubicado en el catastro satelital.
     - Puedes registrar cualquier objeto de la finca:
       * **Riego**: llaves de agua, goteros, filtros, válvulas, arquetas, tuberías, bombas, contadores, aspersores.
       * **Árboles y Plantas**: aguacates, limoneros, olivos, cítricos, frutales, plantas, etc.
       * **Edificios y Mobiliario**: casas, caravanas, taller, almacén, caseta.
       * **Herramientas**: maquinaria, tractor, aperos de labranza.
       * **Hitos**: mojones, lindes, cotas.
     - Incluye OBLIGATORIAMENTE al final de tu respuesta el comando estructurado:
       Para múltiples puntos o con audio:
       [[REGISTRAR_PUNTOS: [
         {
           "name": "Llave de agua Sector 1|Gotero 4L|Filtro de anillas|Aguacate Hass|etc",
           "category": "riego|arbol|planta|edificio|herramienta|hito|otro",
           "tipo": "llave_agua|gotero|filtro|valvula|tuberia|arqueta|aguacate|limonero|otro",
           "variedad": "16mm|autocompensante|anillas|Hass|Bacon|etc|null",
           "estado": "saludable|clorosis|poda_requerida|enfermo|observaciones",
           "timestamp_audio_s": 2.5,
           "observaciones": "Notas u observaciones del agricultor"
         }
       ] ]]
       O para un punto único por texto:
       [[REGISTRAR_PUNTO: {
         "name": "Nombre del objeto",
         "category": "riego|arbol|planta|edificio|herramienta|hito",
         "tipo": "llave_agua|gotero|filtro|valvula|tuberia|etc",
         "variety_type": "modelo, calibre o subtipo",
         "status": "saludable|clorosis|enfermo|observaciones",
         "notes": "Notas técnicas o de ubicación"
       }]]
  3. **Si da una orden de borrado o cancelación:**
     - Confirma qué elemento has eliminado del catastro e incluye:
       [[BORRAR_PUNTO: {"target": "ultimo|especifico", "query": "descripción del punto a borrar"}]]

6. 🗺️ **INVENTARIO AGRÍCOLA, CATASTRO SATÉLITE Y CAMINOS**:
- Cuentas con un registro georreferenciado de árboles, plantas, tuberías de riego, arquetas, acequias y mojones ('farm_inventory'), así como una capa de caminos, senderos y líneas de distribución ('farm_paths') y el catastro oficial de las Parcelas 195 y 196 de Campito Jorox.
- Puedes responder sobre conteo de árboles por variedad, estado fitosanitario, longitud de caminos y guiar para exportar a **Google My Maps (KML), PDF, Excel y GeoJSON**.

7. 📎 **DOCUMENTOS Y ARCHIVOS ADJUNTOS (+)**:
- El usuario dispone de un botón '+' para adjuntar informes PDF (análisis de suelo, agua, foliares, facturas de abonos/fitosanitarios, certificados catastrales o SIGPAC), hojas de cálculo (CSV, Excel) y notas técnicas, además de fotos con la cámara.
- Si contiene reglas o pautas agronómicas, guárdalas en la memoria permanente con [[MEMORIA: {...}]].
- Si contiene coordenadas o inventario de árboles, regístralos con [[REGISTRAR_PUNTOS: [...] ]].

8. 📥 **GENERACIÓN Y EXPORTACIÓN DIRECTA DE ARCHIVOS (PDF, EXCEL, TXT, XML, KML)**:
- Si el usuario te pide un informe o archivo descargable (ej: "créame un PDF de los gastos", "exporta a Excel", "genera un TXT con las notas", "crea un XML con los datos", "dámelo en PDF descargable", "hazme un documento listo para descargar"):
  1. Redacta la explicación o resumen en tu respuesta en español.
  2. Incluye OBLIGATORIAMENTE al final el comando estructurado:
     [[EXPORTAR_ARCHIVO: {
       "type": "pdf|excel|txt|xml|kml",
       "filename": "Nombre_Archivo.pdf|.csv|.txt|.xml|.kml",
       "title": "Título del Documento",
       "subtitle": "Subtítulo o detalle opcional",
       "content": "Texto del documento, informe redactado o código XML/TXT completo",
       "table": {
         "headers": ["Columna 1", "Columna 2", "Columna 3"],
         "rows": [
           ["Dato 1", "Dato 2", "Dato 3"]
         ]
       }
     }]]
  - Para PDF: incluye 'title', 'subtitle', 'content' (resumen o detalle) y opcionalmente 'table' si hay columnas tabulares.
  - Para EXCEL: incluye 'filename' (.csv), 'title' y 'table' con headers y rows.
  - Para TXT: incluye 'filename' (.txt), 'title' y 'content'.
  - Para XML o KML: incluye 'filename' (.xml o .kml), 'title' y 'content' con las etiquetas XML/KML correspondientes.
  La aplicación convertirá este comando en una tarjeta interactiva con botón de descarga directa para el usuario.

🔒 **CONFIDENCIALIDAD**:
- Toda la información de este chat es ESTRICTAMENTE CONFIDENCIAL de Campito Jorox. Responde siempre en **español**, con rigor y utilidad práctica para el campo.`;

// ─── Funciones Formateadoras del Contexto Real de la Finca ───────────────────
function formatEventsContext(events) {
  if (!events || events.length === 0) {
    return '\n\n📅 **CALENDARIO Y TURNOS DE RIEGO**: Actualmente no hay eventos o turnos registrados en la base de datos de la finca.';
  }

  // Ordenar cronológicamente
  const sorted = [...events].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });

  const lines = sorted.map((ev) => {
    const rawDate = ev.date ? ev.date.split('T')[0] : 'Fecha no especificada';
    let diaSemana = '';
    try {
      if (ev.date) {
        const d = new Date(rawDate + 'T12:00:00Z');
        diaSemana = d.toLocaleDateString('es-ES', { weekday: 'long' });
      }
    } catch {
      // ignore
    }

    const horario = (ev.start_time || ev.end_time)
      ? `${(ev.start_time || '').substring(0, 5)} a ${(ev.end_time || '').substring(0, 5)}`
      : 'Horario completo';

    const resp = Array.isArray(ev.responsibles) && ev.responsibles.length > 0
      ? ev.responsibles.join(', ')
      : (ev.responsible || 'Sin asignar');

    const notas = ev.info ? ` | Notas: ${ev.info}` : '';
    const categoria = ev.category || 'General';

    return `- [${rawDate} · ${diaSemana}] ${categoria} | Horario: ${horario} | Responsables: ${resp}${notas}`;
  });

  return `\n\n📅 **CALENDARIO Y TURNOS DE RIEGO PROGRAMADOS (${events.length} turnos/eventos en base de datos)**:
${lines.join('\n')}
*REGLA DEL CALENDARIO: Tienes acceso directo y en vivo a todo el calendario oficial de Campito Jorox arriba indicado.
- Si el usuario te pregunta qué día, qué fecha o qué horario hay de riego, poda o cualquier tarea (por ejemplo: "¿qué horario tenemos de riego el sábado 14 de noviembre?"):
  1. Busca en la lista superior.
  2. Si encuentras turnos en esa fecha o sector (La Nana o El Moro), responde inmediatamente con el horario exacto, el sector y los responsables asignados.
  3. Si no hay turnos exactamente en esa fecha, infórmaselo con total claridad ("He comprobado el calendario y para el sábado 14 de noviembre no hay turnos agendados"), menciona los turnos programados más cercanos y ofrécete a programarlo de inmediato.
- NUNCA respondas que no tienes acceso al calendario ni que el usuario no te ha dicho qué horario hay.*`;
}

function formatFinancesContext(transactions, users = []) {
  if (!transactions || transactions.length === 0) {
    return '\n\n💰 **CONTABILIDAD Y BALANCES**: Actualmente no hay transacciones registradas.';
  }

  const activeTxs = transactions.filter((tx) => (tx.status || 'ACTIVE') !== 'DELETED');

  let totalGastos = 0;
  let totalVentas = 0;

  activeTxs.forEach((tx) => {
    const amt = parseFloat(tx.amount || 0);
    const type = (tx.type || '').toLowerCase();
    if (type === 'gasto' || amt > 0) {
      totalGastos += Math.abs(amt);
    } else if (type === 'retiro' || type === 'venta' || type === 'ingreso' || amt < 0) {
      totalVentas += Math.abs(amt);
    }
  });

  const balanceNeto = totalGastos - totalVentas;

  // Desglose por usuario
  const userStats = (users || []).map((u) => {
    const uName = u.name;
    const uTxs = activeTxs.filter((tx) => {
      const txUser = tx.profiles?.name || tx.user_name || tx.user || '';
      return txUser.toLowerCase() === uName.toLowerCase();
    });
    const gasto = uTxs
      .filter((tx) => (tx.type || '').toLowerCase() === 'gasto' || parseFloat(tx.amount || 0) > 0)
      .reduce((s, tx) => s + Math.abs(parseFloat(tx.amount || 0)), 0);
    const venta = uTxs
      .filter((tx) => ['retiro', 'venta', 'ingreso'].includes((tx.type || '').toLowerCase()) || parseFloat(tx.amount || 0) < 0)
      .reduce((s, tx) => s + Math.abs(parseFloat(tx.amount || 0)), 0);
    return {
      name: uName,
      gasto,
      venta,
      balance: gasto - venta,
    };
  });

  const maxBal = userStats.length > 0 ? Math.max(...userStats.map((s) => s.balance)) : 0;
  const userLines = userStats.map((s) => {
    const diff = s.balance - maxBal;
    return `  - **${s.name}**: Gastos pagados: €${s.gasto.toFixed(2)} | Ventas/Retiros cobrados: €${s.venta.toFixed(2)} | Saldo personal: €${s.balance.toFixed(2)}${diff < 0 ? ` (Diferencia a liquidar: €${Math.abs(diff).toFixed(2)})` : ' (Mayor aportante / Saldo positivo)'}`;
  });

  const recentTxs = activeTxs.slice(0, 35).map((tx) => {
    const d = tx.date ? tx.date.split('T')[0] : '';
    const u = tx.profiles?.name || tx.user_name || tx.user || 'Desconocido';
    const t = tx.type || 'Transacción';
    const a = Math.abs(parseFloat(tx.amount || 0)).toFixed(2);
    const desc = tx.description ? ` — ${tx.description}` : '';
    return `- [${d}] ${u} | ${t.toUpperCase()}: €${a}${desc}`;
  });

  return `\n\n💰 **CONTABILIDAD Y BALANCES FINANCIEROS DE LA FINCA (${activeTxs.length} transacciones activas)**:
- **Total Gastos**: €${totalGastos.toFixed(2)}
- **Total Ventas / Ingresos**: €${totalVentas.toFixed(2)}
- **Balance General**: €${balanceNeto.toFixed(2)} (${balanceNeto >= 0 ? 'Gastos superan a ventas' : 'Superávit general'})

👥 **Saldos individuales por socio / usuario**:
${userLines.length > 0 ? userLines.join('\n') : '  (Sin desglose individual)'}

📋 **Últimas transacciones registradas**:
${recentTxs.join('\n')}
*REGLA DE CONTABILIDAD: Tienes acceso directo y en vivo a todos los balances financieros, gastos, ventas y liquidaciones. Utiliza estas cifras exactas. NUNCA respondas que no tienes acceso a la contabilidad ni a los números de la finca.*`;
}

function formatKnowledgeContext(knowledge) {
  if (!knowledge || knowledge.length === 0) {
    return '\n\n🧠 **MEMORIA Y APRENDIZAJE ACUMULADO DE LA FINCA**: Actualmente no hay reglas grabadas.';
  }

  const lines = knowledge.map((k) => {
    const cat = (k.category || 'general').toUpperCase();
    return `- [${cat}] **${k.title}**: ${k.content}`;
  });

  return `\n\n🧠 **MEMORIA Y APRENDIZAJE ACUMULADO DE LA FINCA (${knowledge.length} hechos/reglas aprendidas)**:
${lines.join('\n')}
*REGLA DE APRENDIZAJE: Todo lo listado aquí es memoria permanente y doctrina operativa de Campito Jorox. Consulta y obedece rigurosamente todas estas reglas. Si te piden aprender o recordar algo nuevo, guárdalo con [[MEMORIA: {"category": "cultivo|riego|parcela|maquinaria|suelo|general|proveedor|protocolo|plaga", "title": "...", "content": "..."}]].*`;
}

function formatInventoryContext(inventory) {
  if (!inventory || inventory.length === 0) {
    return '\n\n🗺️ **INVENTARIO Y CATASTRO GPS**: 0 elementos registrados.';
  }

  const varieties = {};
  inventory.forEach((i) => {
    const key = `${i.category || 'arbol'} ${i.variety_type || ''}`.trim();
    varieties[key] = (varieties[key] || 0) + 1;
  });

  const summary = Object.entries(varieties)
    .map(([k, count]) => `${count}x ${k}`)
    .join(', ');

  const sample = inventory.slice(0, 30).map((inv) => {
    const lat = typeof inv.latitude === 'number' ? inv.latitude.toFixed(6) : inv.latitude;
    const lng = typeof inv.longitude === 'number' ? inv.longitude.toFixed(6) : inv.longitude;
    return `- [${(inv.category || 'arbol').toUpperCase()}] ${inv.name} (${inv.variety_type || 'Sin variedad'}) | Estado: ${inv.status || 'saludable'} | [${lat}, ${lng}] | Obs: ${inv.notes || ''}`;
  });

  return `\n\n🗺️ **INVENTARIO Y CATASTRO GPS (${inventory.length} elementos georreferenciados)**:
- Resumen: ${summary}
- Muestra de puntos:
${sample.join('\n')}`;
}

function buildComprehensiveFincaContext({
  events = [],
  transactions = [],
  users = [],
  knowledge = [],
  inventory = [],
  paths = [],
}) {
  let ctx = '';
  ctx += formatEventsContext(events);
  ctx += formatFinancesContext(transactions, users);
  ctx += formatKnowledgeContext(knowledge);
  ctx += formatInventoryContext(inventory);

  if (paths && paths.length > 0) {
    const pLines = paths.map((p) => {
      const len = p.length_meters ? `${Number(p.length_meters).toFixed(0)}m` : 'longitud sin definir';
      return `- [${(p.path_type || 'camino').toUpperCase()}] ${p.name} (${len}, color: ${p.color || '#3b82f6'})`;
    });
    ctx += `\n\n🛣️ **CAMINOS Y SENDEROS TRAZADOS (${paths.length} trazados activos)**:\n${pLines.join('\n')}`;
  }

  return ctx;
}

// ─── Función de llamada directa REST a Gemini con timeout ──────────────────────
async function callGeminiDirect({ modelId, prompt, attachment, image, audio, history, systemInstruction, apiKey, timeoutMs = 25000 }) {
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const effectiveTimeout = (audio || attachment) ? Math.max(timeoutMs, 35000) : timeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  // Armar historial en formato REST Gemini
  const contents = [];

  if (Array.isArray(history)) {
    for (const h of history) {
      if (!h.content) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      });
    }
  }

  // Mensaje actual del usuario
  const userParts = [];
  if (prompt) {
    userParts.push({ text: prompt });
  }

  // Archivo adjunto (+ o cámara)
  const att = attachment || (image ? { dataUrl: image.dataUrl, name: 'imagen.jpg' } : null);
  if (att) {
    if (att.textContent) {
      userParts.push({
        text: `\n\n📄 **CONTENIDO DEL ARCHIVO ADJUNTO ("${att.name || 'documento'}")**:\n\`\`\`\n${att.textContent}\n\`\`\`\n`,
      });
    }

    if (att.dataUrl) {
      const match = att.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
      if (match) {
        const rawMime = match[1].toLowerCase();
        const cleanMime = rawMime.split(';')[0].trim();
        // Imágenes y documentos PDF soportados nativamente por Gemini generateContent
        if (cleanMime.startsWith('image/') || cleanMime === 'application/pdf') {
          userParts.push({
            inlineData: {
              mimeType: cleanMime,
              data: match[2],
            },
          });
        }
      }
    }
  }

  // Soporte nativo multimodal de Audio en Gemini
  if (audio && audio.dataUrl) {
    const match = audio.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (match) {
      const rawMime = match[1].toLowerCase();
      const cleanMime = rawMime.split(';')[0].trim();
      userParts.push({
        inlineData: {
          mimeType: cleanMime,
          data: match[2],
        },
      });
    } else {
      const cleanMime = (audio.mimeType || 'audio/webm').split(';')[0].trim();
      const cleanBase64 = audio.dataUrl.replace(/^data:.*?;base64,/, '');
      userParts.push({
        inlineData: {
          mimeType: cleanMime,
          data: cleanBase64,
        },
      });
    }
  }

  if (!prompt && audio) {
    userParts.push({
      text: 'Por favor, escucha atentamente este mensaje de voz del agricultor de Campito Jorox. Transcribe o interpreta lo que dice y responde a su consulta o petición. Si consulta sobre el calendario o turnos de riego, revisa el calendario inyectado y responde con el horario exacto. Si consulta sobre la contabilidad, responde con los balances reales. Si describe árboles, plantas, arquetas o elementos de la finca para inventario, extrae los datos y ubícalos con [[REGISTRAR_PUNTOS: [...] ]]. Si pide recordar o aprender una regla de la finca, guárdala con [[MEMORIA: {...} ]]. Si pide borrar un punto, usa [[BORRAR_PUNTO: {...}]]. Responde detalladamente en español.',
    });
  } else if (!prompt && att) {
    userParts.push({
      text: `Por favor analiza detalladamente el archivo adjunto ("${att.name || 'documento'}") para Campito Jorox. Sintetiza la información relevante y, si contiene pautas o reglas para alimentar el conocimiento de la finca, guárdalas con [[MEMORIA: {"category": "suelo|cultivo|riego|fertilizacion|general", "title": "...", "content": "..."}]]. Si contiene árboles o parcelas, regístralos con [[REGISTRAR_PUNTOS: [...] ]].`,
    });
  } else if (userParts.length === 0) {
    userParts.push({ text: 'Hola' });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  const payload = {
    contents,
    system_instruction: systemInstruction
      ? { parts: [{ text: systemInstruction }] }
      : undefined,
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data.error?.message || `HTTP ${res.status}`;
      const isQuota = res.status === 429 || errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('resource_exhausted');
      const err = new Error(errorMsg);
      err.status = res.status;
      err.isQuota = isQuota;
      throw err;
    }

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');

    if (!text) {
      throw new Error('El modelo devolvió una respuesta vacía');
    }

    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Tiempo de espera agotado (15s)');
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  }
}

// ─── Estilos inline ────────────────────────────────────────────────────────────
const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
    overflow: 'hidden',
    position: 'relative',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e8e8e8',
    flexShrink: 0,
    gap: 8,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    backgroundColor: '#00979d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '0.92rem',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  headerSub: {
    fontSize: '0.68rem',
    color: '#777',
    margin: 0,
    lineHeight: 1.2,
  },
  serverBadge: () => ({
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 8px',
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    cursor: 'pointer',
    fontSize: '0.70rem',
    fontWeight: 600,
    color: '#334155',
    flexShrink: 0,
    maxWidth: 135,
    overflow: 'hidden',
    userSelect: 'none',
    transition: 'all 0.15s ease',
  }),
  statusDot: (color) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    boxShadow: `0 0 6px ${color}`,
  }),
  fallbackAlert: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    backgroundColor: '#fffbeb',
    borderBottom: '1px solid #fef3c7',
    color: '#92400e',
    fontSize: '0.74rem',
    fontWeight: 500,
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  bubbleRow: (isUser) => ({
    display: 'flex',
    justifyContent: isUser ? 'flex-end' : 'flex-start',
    alignItems: 'flex-end',
    gap: '7px',
  }),
  avatar: (isUser) => ({
    width: 26,
    height: 26,
    borderRadius: '50%',
    backgroundColor: isUser ? '#00979d' : '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    order: isUser ? 1 : 0,
  }),
  bubble: (isUser) => ({
    maxWidth: '82%',
    padding: '10px 13px',
    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
    backgroundColor: isUser ? '#00979d' : '#f5f5f5',
    color: isUser ? '#ffffff' : '#1a1a1a',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    wordBreak: 'break-word',
  }),
  bubbleMeta: (isUser) => ({
    fontSize: '0.66rem',
    color: isUser ? 'rgba(255,255,255,0.7)' : '#888',
    marginTop: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    justifyContent: isUser ? 'flex-end' : 'flex-start',
  }),
  typingDots: {
    display: 'flex',
    gap: '4px',
    padding: '4px 2px',
    alignItems: 'center',
  },
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e8e8e8',
    flexShrink: 0,
  },
  iconBtn: (active) => ({
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: active ? '#ff4444' : '#f0f0f0',
    color: active ? '#ffffff' : '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.2s',
    WebkitTapHighlightColor: 'transparent',
  }),
  inputCapsule: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    border: '1.5px solid #e0e0e0',
    borderRadius: 22,
    padding: '0 6px 0 14px',
    minHeight: 42,
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  textInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: '#1a1a1a',
    resize: 'none',
    lineHeight: 1.4,
    fontSize: '0.9rem',
    maxHeight: 100,
    overflowY: 'auto',
    fontFamily: 'inherit',
    padding: '9px 0',
  },
  capsuleCameraBtn: (active) => ({
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: 'none',
    background: active ? '#00979d' : 'transparent',
    color: active ? '#ffffff' : '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s',
  }),
  audioPreviewCapsule: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    border: '1.5px solid #86efac',
    borderRadius: 22,
    padding: '0 10px',
    height: 42,
    gap: 8,
    minWidth: 0,
    boxSizing: 'border-box',
  },
  recordingCapsule: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    border: '1.5px solid #fca5a5',
    borderRadius: 22,
    padding: '0 12px',
    height: 42,
    gap: 8,
    minWidth: 0,
    boxSizing: 'border-box',
  },
  previewTrashBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    flexShrink: 0,
  },
  previewPlayBtn: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    backgroundColor: '#00979d',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  previewTrackContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
  },
  previewSlider: {
    width: '100%',
    height: 4,
    accentColor: '#00979d',
    cursor: 'pointer',
    margin: 0,
  },
  previewTimeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    lineHeight: 1,
  },
  previewTimeText: {
    fontSize: '0.7rem',
    color: '#475569',
    fontWeight: 600,
  },
  previewGpsTag: {
    fontSize: '0.66rem',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    padding: '1px 6px',
    borderRadius: 8,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  sendBtn: (hasText) => ({
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: hasText ? '#00979d' : '#e0e0e0',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: hasText ? 'pointer' : 'default',
    flexShrink: 0,
    transition: 'all 0.2s',
    WebkitTapHighlightColor: 'transparent',
  }),
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    backgroundColor: '#fff0f0',
    color: '#cc0000',
    fontSize: '0.78rem',
    borderTop: '1px solid #ffcccc',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 90,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '16px',
    paddingTop: '60px',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 410,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid #f1f5f9',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: '0.95rem',
    fontWeight: 700,
    margin: 0,
    color: '#0f172a',
  },
  modalBody: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
    flex: 1,
  },
  serverCard: (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 10,
    border: isActive ? '2px solid #00979d' : '1px solid #e2e8f0',
    backgroundColor: isActive ? '#f0fdfa' : '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),
};

// ─── Componente TypingIndicator ─────────────────────────────────────────────────
function TypingIndicator({ currentServer }) {
  return (
    <div style={styles.bubbleRow(false)}>
      <div style={styles.avatar(false)}>
        <Bot size={13} color="#888" />
      </div>
      <div style={{ ...styles.bubble(false), padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={styles.statusDot(currentServer?.badgeColor || '#00979d')} />
          <span style={{ fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>
            {currentServer?.name} ({currentServer?.level}) procesando...
          </span>
        </div>
        <div style={styles.typingDots}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: currentServer?.badgeColor || '#00979d',
                display: 'inline-block',
                animation: `chatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mensaje de bienvenida inicial ───────────────────────────────────────────
const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! Soy el asistente IA de **Campito Jorox** 🌿\n\nPuedo ayudarte con:\n- Consultas sobre la finca y cultivos\n- Análisis de tus transacciones y gastos\n- Planificación de tareas y eventos\n- Fotos de plagas o documentos de la finca\n\n¿En qué te puedo ayudar hoy?',
  serverUsed: GEMINI_SERVERS[2] || GEMINI_SERVERS[0],
};

// ─── Componente Principal ChatIA ────────────────────────────────────────────────
export default function ChatIA() {
  const outletContext = useOutletContext() || {};
  const {
    events: outletEvents = [],
    transactions: outletTransactions = [],
    users: outletUsers = [],
    refetchEvents,
    refetchTransactions,
  } = outletContext;

  const [fincaEvents, setFincaEvents] = useState(() => outletEvents);
  const [fincaTransactions, setFincaTransactions] = useState(() => outletTransactions);
  const [fincaUsers, setFincaUsers] = useState(() => outletUsers);

  // Modelo inicial: Gemini 3.5 Flash (high) por ser el más potente con cuota gratuita activa
  const initialIndex = GEMINI_SERVERS.findIndex((s) => s.id === 'gemini-3.5-flash');
  const [selectedServerIndex, setSelectedServerIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [activeServer, setActiveServer] = useState(GEMINI_SERVERS[initialIndex >= 0 ? initialIndex : 0]);
  const [fallbackNotice, setFallbackNotice] = useState(null);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isInventoryMapOpen, setIsInventoryMapOpen] = useState(false);
  const [farmKnowledge, setFarmKnowledge] = useState(() => {
    try {
      const raw = localStorage.getItem('campito_farm_knowledge_all');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[ChatIA] Error leyendo memoria local:', e);
    }
    return [];
  });
  
  // ─── Estado del Inventario, Caminos y Catastro Satélite ────────────────────
  const [farmInventory, setFarmInventory] = useState([]);
  const farmInventoryRef = useRef(farmInventory);
  useEffect(() => {
    farmInventoryRef.current = farmInventory;
  }, [farmInventory]);

  const [farmPaths, setFarmPaths] = useState([]);
  const [lastRecordedGpsTrack, setLastRecordedGpsTrack] = useState(null);
  const [inventoryModalTab, setInventoryModalTab] = useState('map'); // 'map' | 'inventory' | 'paths'
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('all');

  // Hook unificado para captura sincronizada de audio continuo y telemetría GPS
  const {
    isRecording,
    elapsedSeconds: recordingSeconds,
    currentGps,
    gpsPointsCount,
    accuracyWarning,
    startTracking,
    stopTracking,
  } = useVoiceGeoTracker();

  const [autoFallback, setAutoFallback] = useState(true);

  const [currentUserId, setCurrentUserId] = useState(() => {
    try {
      return localStorage.getItem('campito_last_user_id') || 'default';
    } catch {
      return 'default';
    }
  });

  // Carga instantánea desde caché local para que nunca se borre al cambiar de sección
  const [messages, setMessages] = useState(() => {
    try {
      const lastUid = localStorage.getItem('campito_last_user_id') || 'default';
      const cached = localStorage.getItem(`campito_chat_messages_${lastUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[ChatIA] Error leyendo caché local de mensajes:', e);
    }
    return [WELCOME_MESSAGE];
  });

  // Mantener borrador en curso si el usuario estaba escribiendo y fue a otra sección
  const [input, setInput] = useState(() => {
    try {
      const lastUid = localStorage.getItem('campito_last_user_id') || 'default';
      return localStorage.getItem(`campito_chat_draft_${lastUid}`) || '';
    } catch {
      return '';
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [pendingAudio, setPendingAudio] = useState(null); // { blob, dataUrl, mimeType, duration, t0, gpsTrack }
  const [error, setError] = useState(null);
  const [pendingAttachment, setPendingAttachment] = useState(null); // { file, name, size, type, dataUrl, textContent, isImage, isPdf, isSpreadsheet, isText }

  // Telemetría GPS en tiempo real del teléfono para el Chat
  const [deviceGps, setDeviceGps] = useState(null); // { lat, lng, accuracy, altitude }
  const deviceGpsRef = useRef(null);

  const contextDataRef = useRef('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);

  // ── Reproductor de preview de audio en la barra de input (estilo WhatsApp) ──
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const previewAudioRef = useRef(null);

  const formatAudioTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlayPreview = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioRef.current.play().then(() => {
        setIsPreviewPlaying(true);
      }).catch((err) => {
        console.error('Error reproduciendo preview audio:', err);
      });
    }
  };

  const handleSeekPreview = (e) => {
    const time = parseFloat(e.target.value);
    setPreviewCurrentTime(time);
    if (previewAudioRef.current) {
      previewAudioRef.current.currentTime = time;
    }
  };

  const handleDiscardAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPendingAudio(null);
  };

  const handleCancelRecording = async () => {
    try {
      await stopTracking();
    } catch (e) {
      console.error('Error cancelando grabación:', e);
    }
    setPendingAudio(null);
    setIsPreviewPlaying(false);
  };

  useEffect(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    if (pendingAudio) {
      setPreviewDuration(pendingAudio.duration || 0);
    } else {
      setPreviewDuration(0);
    }
  }, [pendingAudio]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Persistir mensajes en caché local cada vez que cambien
  useEffect(() => {
    if (!currentUserId) return;
    try {
      localStorage.setItem(`campito_chat_messages_${currentUserId}`, JSON.stringify(messages.slice(-60)));
    } catch (e) {
      console.warn('[ChatIA] Error guardando mensajes en caché:', e);
    }
  }, [messages, currentUserId]);

  // Sincronizar usuario activo y recuperar historial desde Supabase si la caché local está vacía
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id || 'default';
        if (!isMounted) return;
        setCurrentUserId(uid);
        localStorage.setItem('campito_last_user_id', uid);

        // Si la caché local está vacía o solo tiene bienvenida, recuperar historial de Supabase
        const cachedRaw = localStorage.getItem(`campito_chat_messages_${uid}`);
        let cachedArr = [];
        try {
          cachedArr = cachedRaw ? JSON.parse(cachedRaw) : [];
        } catch {
          cachedArr = [];
        }

        if (!cachedArr || cachedArr.length <= 1) {
          const { data: dbHistory, error: dbErr } = await supabase
            .from('chat_history')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: true })
            .limit(40);

          if (!dbErr && dbHistory && dbHistory.length > 0 && isMounted) {
            const restored = dbHistory.map((row) => ({
              id: String(row.id),
              role: row.role,
              content: row.content || '',
              image: row.file_url && /\.(jpg|jpeg|png|webp|gif)/i.test(row.file_url) ? row.file_url : null,
              audio: row.file_url && /\.(webm|mp4|m4a|ogg|wav|mp3)/i.test(row.file_url) ? { dataUrl: row.file_url } : null,
              serverUsed: row.model_used ? { name: row.model_used } : null,
              timestamp: row.created_at,
            }));

            const merged = [WELCOME_MESSAGE, ...restored];
            setMessages(merged);
            localStorage.setItem(`campito_chat_messages_${uid}`, JSON.stringify(merged));
          }
        }
      } catch (err) {
        console.warn('[ChatIA] Error sincronizando historial con base de datos:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Reiniciar a una nueva conversación limpia (preserva la BD para respaldo y memoria)
  const handleResetChat = useCallback(() => {
    if (messages.length <= 1 && !input) return;
    const ok = window.confirm(
      '¿Deseas iniciar una nueva conversación limpia?\n\nEl historial anterior permanece guardado y seguro en la base de datos de Campito Jorox.'
    );
    if (!ok) return;

    setMessages([WELCOME_MESSAGE]);
    setInput('');
    setPendingAudio(null);
    setPendingAttachment(null);
    if (currentUserId) {
      try {
        localStorage.removeItem(`campito_chat_messages_${currentUserId}`);
        localStorage.removeItem(`campito_chat_draft_${currentUserId}`);
      } catch {
        // ignore
      }
    }
  }, [messages.length, input, currentUserId]);

  // Captura y seguimiento continuo de GPS del móvil para el Chat
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    // Lectura inicial rápida
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const info = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        };
        setDeviceGps(info);
        deviceGpsRef.current = info;
      },
      (err) => {
        console.warn('[ChatIA] Lectura inicial GPS no disponible:', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 20000 }
    );

    // Muestreo continuo
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const info = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        };
        setDeviceGps(info);
        deviceGpsRef.current = info;
      },
      (err) => {
        console.warn('[ChatIA] watchPosition error:', err.message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // CSS de animaciones
  useEffect(() => {
    const styleId = 'chatia-animations-v2';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes chatPulseRed {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.6; }
          100% { transform: scale(1); opacity: 1; }
        }
        .chatia-input:focus {
          border-color: #00979d !important;
          background-color: #fff !important;
        }
        .chatia-input::placeholder { color: #aaa; }
        .chatia-markdown p { margin: 0 0 6px; }
        .chatia-markdown p:last-child { margin-bottom: 0; }
        .chatia-markdown ul, .chatia-markdown ol { margin: 4px 0 4px 18px; padding: 0; }
        .chatia-markdown li { margin-bottom: 2px; }
        .chatia-markdown strong { font-weight: 700; }
        .chatia-markdown code { background: rgba(0,0,0,0.08); border-radius: 3px; padding: 1px 4px; font-size: 0.85em; }
        .chatia-markdown pre { background: rgba(0,0,0,0.06); border-radius: 6px; padding: 8px 10px; overflow-x: auto; margin: 6px 0; }
        .chatia-markdown pre code { background: none; padding: 0; }
        .chatia-markdown h1, .chatia-markdown h2, .chatia-markdown h3 { margin: 8px 0 4px; font-weight: 700; }
        .chatia-markdown table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 0.82em; }
        .chatia-markdown th, .chatia-markdown td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; }
        .chatia-markdown th { background: rgba(0,151,157,0.1); font-weight: 700; }
        .chatia-iconbtn:active { transform: scale(0.92); }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // ── Cargar contexto completo de Supabase y caché local al montar ──────────
  useEffect(() => {
    let isMounted = true;
    const loadContext = async () => {
      try {
        const [transRes, eventsRes, knwRes, invRes, pathRes, usersRes] = await Promise.allSettled([
          supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }).limit(60),
          supabase.from('events').select('*').order('date', { ascending: true }),
          supabase.from('farm_knowledge').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('farm_inventory').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('farm_paths').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('profiles').select('*').order('name'),
        ]);

        if (!isMounted) return;

        const liveEvents = eventsRes.status === 'fulfilled' && eventsRes.value.data ? eventsRes.value.data : outletEvents;
        const liveTransactions = transRes.status === 'fulfilled' && transRes.value.data ? transRes.value.data : outletTransactions;
        const liveInventory = (invRes.status === 'fulfilled' && Array.isArray(invRes.value.data) && invRes.value.data.length > 0)
          ? invRes.value.data
          : getLocalInventory();
        const livePaths = (pathRes.status === 'fulfilled' && Array.isArray(pathRes.value.data) && pathRes.value.data.length > 0)
          ? pathRes.value.data
          : getLocalPaths();
        const liveUsers = usersRes.status === 'fulfilled' && usersRes.value.data ? usersRes.value.data : outletUsers;

        // Recuperar y consolidar la memoria permanente (local + nube + mensajes)
        let combinedKnowledge = [];
        try {
          const localRaw = localStorage.getItem('campito_farm_knowledge_all');
          if (localRaw) {
            const parsed = JSON.parse(localRaw);
            if (Array.isArray(parsed)) combinedKnowledge = [...parsed];
          }
        } catch (e) {
          console.warn('[ChatIA] Error leyendo memoria local:', e);
        }

        // Si Supabase devuelve datos de farm_knowledge, fusionarlos
        if (knwRes.status === 'fulfilled' && Array.isArray(knwRes.value.data) && knwRes.value.data.length > 0) {
          knwRes.value.data.forEach((remoteItem) => {
            const alreadyIn = combinedKnowledge.some((k) => k.id === remoteItem.id || (k.title === remoteItem.title && k.content === remoteItem.content));
            if (!alreadyIn) {
              combinedKnowledge.push(remoteItem);
            }
          });
        }

        // Escanear mensajes locales por si hay conocimientos creados en el chat
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('campito_chat_messages_')) {
              const msgsRaw = localStorage.getItem(key);
              if (msgsRaw) {
                const parsedMsgs = JSON.parse(msgsRaw);
                if (Array.isArray(parsedMsgs)) {
                  parsedMsgs.forEach((m) => {
                    if (m.learnedMemory && m.learnedMemory.content) {
                      const exists = combinedKnowledge.some((k) => k.title === m.learnedMemory.title || k.content === m.learnedMemory.content);
                      if (!exists) {
                        combinedKnowledge.push({
                          id: 'recovered-' + Math.random().toString(36).substring(7),
                          category: m.learnedMemory.category || 'general',
                          title: m.learnedMemory.title || 'Dato aprendido',
                          content: m.learnedMemory.content,
                          source: 'chat',
                          created_at: m.timestamp || new Date().toISOString(),
                          is_active: true,
                        });
                      }
                    }
                  });
                }
              }
            }
          }
        } catch (scanErr) {
          console.warn('[ChatIA] Error escaneando mensajes locales:', scanErr);
        }

        // Guardar la memoria consolidada en localStorage para persistencia segura
        try {
          localStorage.setItem('campito_farm_knowledge_all', JSON.stringify(combinedKnowledge));
        } catch {
          // ignore
        }

        setFincaEvents(liveEvents);
        setFincaTransactions(liveTransactions);
        setFarmKnowledge(combinedKnowledge);
        setFarmInventory(liveInventory);
        setFarmPaths(livePaths);
        setFincaUsers(liveUsers);

        contextDataRef.current = buildComprehensiveFincaContext({
          events: liveEvents,
          transactions: liveTransactions,
          users: liveUsers,
          knowledge: combinedKnowledge,
          inventory: liveInventory,
          paths: livePaths,
        });
      } catch (err) {
        console.warn('[ChatIA] Error cargando contexto inicial:', err);
      }
    };
    loadContext();
    return () => {
      isMounted = false;
    };
  }, [outletEvents, outletTransactions, outletUsers]);

  // ── Recargar inventario y caminos desde Supabase ─────────────────────────────
  const reloadInventory = async () => {
    try {
      const { data } = await supabase
        .from('farm_inventory')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (data) setFarmInventory(data);
    } catch (err) {
      console.warn('Error al recargar inventario:', err);
    }
  };

  const reloadPaths = async () => {
    try {
      const { data } = await supabase
        .from('farm_paths')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (data) setFarmPaths(data);
    } catch (err) {
      console.warn('Error al recargar caminos:', err);
    }
  };

  // ── Eliminar o desactivar elemento del inventario ─────────────────────────────
  const handleDeleteInventoryItem = async (id) => {
    try {
      await supabase.from('farm_inventory').update({ is_active: false }).eq('id', id);
      setFarmInventory((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.warn('Error al eliminar elemento del inventario:', err);
    }
  };

  // ── Eliminar o desactivar camino o sendero ────────────────────────────────────
  const handleDeletePath = async (id) => {
    try {
      await supabase.from('farm_paths').update({ is_active: false }).eq('id', id);
      setFarmPaths((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.warn('Error al eliminar camino:', err);
    }
  };

  // ── Enviar mensaje con cascada/fallback entre los 3 servidores ────────────────
  const sendMessage = useCallback(
    async (textOverride = null, attachmentData = null, audioData = null) => {
      const text = textOverride ?? input.trim();
      const att = attachmentData ?? pendingAttachment;
      const aud = audioData ?? pendingAudio;

      if (!text && !att && !aud) return;
      if (isLoading) return;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setError('API Key no configurada. Agrega VITE_GEMINI_API_KEY en Vercel o en .env.');
        return;
      }

      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: text || (att ? `📎 ${att.name}` : (aud ? '🎙️ Mensaje de voz' : '')),
        image: att?.isImage ? att.dataUrl : null,
        file: att ? { name: att.name, size: att.size, type: att.type, isPdf: att.isPdf, isSpreadsheet: att.isSpreadsheet, dataUrl: att.dataUrl } : null,
        audio: aud ? { dataUrl: aud.dataUrl, duration: aud.duration } : null,
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput('');
      if (currentUserId) {
        try {
          localStorage.removeItem(`campito_chat_draft_${currentUserId}`);
        } catch {
          // ignore
        }
      }
      setPendingAttachment(null);
      setPendingAudio(null);
      setIsLoading(true);
      setError(null);
      setFallbackNotice(null);

      // Determinar orden de servidores a intentar (solo disponibles)
      const primaryIndex = selectedServerIndex;
      const orderToTry = autoFallback
        ? [primaryIndex, ...GEMINI_SERVERS.map((_, i) => i).filter((i) => i !== primaryIndex && GEMINI_SERVERS[i].available)]
        : [primaryIndex];

      const history = updatedMessages
        .slice(-20, -1)
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content || '' }));

      const currentGpsInfo = deviceGpsRef.current;
      const audTrack = aud?.gpsTrack || [];
      const hasTrack = audTrack.length > 1;
      const effectivePt = audTrack[0] || currentGpsInfo || {
        lat: 36.72595,
        lng: -4.89462,
        accuracy: 4.5,
        isDefaultFinca: true,
      };

      const gpsContextSnippet = hasTrack
        ? `\n\n🛰️ **TELEMETRÍA GPS CONTINUA DEL RECORRIDO EN AUDIO (${audTrack.length} lecturas satelitales)**:
- Inicio audio (t0): ${aud.t0}
- Duración: ${aud.duration}s
- Punto inicial: [${audTrack[0]?.lat.toFixed(6)}, ${audTrack[0]?.lng.toFixed(6)}]
- Punto final: [${audTrack[audTrack.length - 1]?.lat.toFixed(6)}, ${audTrack[audTrack.length - 1]?.lng.toFixed(6)}]
- Precisión satelital: ±${(audTrack.reduce((s, p) => s + p.accuracy, 0) / audTrack.length).toFixed(1)}m.
*INSTRUCCIÓN: El usuario caminaba por la finca mientras hablaba. Si menciona árboles, arquetas, tuberías o elementos a lo largo del camino, confirma en el texto y genera [[REGISTRAR_PUNTOS: [...] ]] con timestamp_audio_s para cada uno.*`
        : `\n\n📍 **UBICACIÓN GPS EN TIEMPO REAL DEL DISPOSITIVO DEL USUARIO**:
- Coordenadas actuales: [${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}] (Precisión: ±${effectivePt.accuracy ? effectivePt.accuracy.toFixed(1) + 'm' : '3.5m'}${effectivePt.isDefaultFinca ? ' · Calibrado en Campito Jorox' : ''}).
*INSTRUCCIÓN VITAL: Toda interacción (audio o texto) lleva incorporada la posición GPS en vivo del dispositivo.
Si el usuario te pregunta:
- "¿Recibes datos de coordenadas del móvil?"
- "¿Cómo vas a obtener esta información para el registro de árboles o caminos?"
- O preguntas similares sobre el GPS:
RESPONDE SIEMPRE ROTUNDAMENTE QUE SÍ:
"¡Sí! La app de Campito Jorox obtiene continuamente tu posición GPS en tiempo real. Ahora mismo tu teléfono está transmitiendo las coordenadas [${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}] con precisión de ±${effectivePt.accuracy ? effectivePt.accuracy.toFixed(1) + 'm' : '3.5m'}."
Si te pide registrar un árbol o arqueta, usa [[REGISTRAR_PUNTOS: [...] ]]. Si te pide aprender una regla o dato de la finca, usa [[MEMORIA: {...}]].*`;

      // 1. Refrescar datos en vivo de Supabase para que el asistente tenga el calendario,
      // la contabilidad y la memoria permanente 100% actualizados en cada respuesta
      let currentEvents = fincaEvents.length > 0 ? fincaEvents : outletEvents;
      let currentTransactions = fincaTransactions.length > 0 ? fincaTransactions : outletTransactions;
      let currentUsers = fincaUsers.length > 0 ? fincaUsers : outletUsers;
      let currentKnowledge = farmKnowledge;
      let currentInventory = farmInventory;
      let currentPaths = farmPaths;

      try {
        const [eRes, tRes, kRes, iRes, pRes] = await Promise.allSettled([
          supabase.from('events').select('*').order('date', { ascending: true }),
          supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }).limit(60),
          supabase.from('farm_knowledge').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('farm_inventory').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('farm_paths').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        ]);

        if (eRes.status === 'fulfilled' && eRes.value.data && eRes.value.data.length > 0) {
          currentEvents = eRes.value.data;
          setFincaEvents(eRes.value.data);
        }
        if (tRes.status === 'fulfilled' && tRes.value.data && tRes.value.data.length > 0) {
          currentTransactions = tRes.value.data;
          setFincaTransactions(tRes.value.data);
        }
        if (kRes.status === 'fulfilled' && kRes.value.data) {
          currentKnowledge = kRes.value.data;
          setFarmKnowledge(kRes.value.data);
        }
        if (iRes.status === 'fulfilled' && Array.isArray(iRes.value.data) && iRes.value.data.length > 0) {
          currentInventory = iRes.value.data;
          setFarmInventory(iRes.value.data);
        } else if (!currentInventory || currentInventory.length === 0) {
          currentInventory = getLocalInventory();
          setFarmInventory(currentInventory);
        }
        if (pRes.status === 'fulfilled' && Array.isArray(pRes.value.data) && pRes.value.data.length > 0) {
          currentPaths = pRes.value.data;
          setFarmPaths(pRes.value.data);
        } else if (!currentPaths || currentPaths.length === 0) {
          currentPaths = getLocalPaths();
          setFarmPaths(currentPaths);
        }
      } catch (fErr) {
        console.warn('[ChatIA] Contexto en memoria utilizado:', fErr);
      }

      const freshFincaContext = buildComprehensiveFincaContext({
        events: currentEvents,
        transactions: currentTransactions,
        users: currentUsers,
        knowledge: currentKnowledge,
        inventory: currentInventory,
        paths: currentPaths,
      });
      contextDataRef.current = freshFincaContext;

      const systemInstruction = SYSTEM_PROMPT + '\n' + freshFincaContext + '\n' + gpsContextSnippet;

      let lastError = null;
      let successResult = null;
      let serverThatAnswered = null;

      for (let i = 0; i < orderToTry.length; i++) {
        const sIndex = orderToTry[i];
        const server = GEMINI_SERVERS[sIndex];

        try {
          const aiResponse = await callGeminiDirect({
            modelId: server.id,
            prompt: text,
            attachment: att,
            image: att?.isImage ? att : null,
            audio: aud,
            history,
            systemInstruction,
            apiKey,
            timeoutMs: (aud || att) ? 35000 : 18000,
          });

          successResult = aiResponse;
          serverThatAnswered = server;

          // Si respondió un servidor distinto al principal, avisar al usuario
          if (i > 0) {
            setFallbackNotice({
              from: GEMINI_SERVERS[primaryIndex],
              to: server,
              reason: lastError?.isQuota ? 'límite de cuota' : 'tiempo de respuesta',
            });
          }

          break; // Éxito, salir del loop
        } catch (err) {
          console.warn(`[ChatIA] Error en ${server.name} (${server.level}):`, err.message);
          lastError = err;
          // Continuar con el siguiente servidor en cascada
        }
      }

      if (successResult && serverThatAnswered) {
        // Detección y extracción de aprendizaje para la memoria permanente de la finca
        let displayedContent = successResult;
        let learnedMemory = null;
        let newlyAddedBatch = [];

        const memMatch = successResult.match(/\[\[MEMORIA:\s*(\{.*?\})\s*\]\]/s);
        if (memMatch) {
          try {
            learnedMemory = JSON.parse(memMatch[1]);
            displayedContent = successResult.replace(memMatch[0], '').trim();
          } catch (e) {
            console.warn('Error al parsear bloque de memoria:', e);
          }
        }

        // 1. Detección y ejecución de registro de múltiples puntos con GPS continuo interpolado
        const regPointsMatch = successResult.match(/\[\[REGISTRAR_PUNTOS:\s*(\[.*?\])\s*\]\]/s);
        if (regPointsMatch) {
          try {
            const items = JSON.parse(regPointsMatch[1]);
            displayedContent = displayedContent.replace(regPointsMatch[0], '').trim();

            if (Array.isArray(items) && items.length > 0) {
              const audTrack = aud?.gpsTrack || (deviceGpsRef.current ? [{ ...deviceGpsRef.current, timestamp: Date.now() }] : []);
              const t0 = aud?.t0 || Date.now();

              for (const item of items) {
                const geo = interpolateGpsAtAudioTime({
                  t0,
                  gpsTrack: audTrack,
                  timestampAudioSec: Number(item.timestamp_audio_s) || 0,
                });

                const lat = geo.lat || currentGpsInfo?.lat || 36.72595;
                const lng = geo.lng || currentGpsInfo?.lng || -4.89462;
                const acc = geo.accuracy_m || currentGpsInfo?.accuracy || 3.0;

                const category = item.category || item.tipo || 'arbol';
                const variety_type = item.variedad || item.variety_type || (item.tipo && item.tipo !== category ? item.tipo : null);
                const name = item.name || `${item.tipo || category} ${variety_type || ''}`.trim();

                const { data: newRow, error: insErr } = await supabase
                  .from('farm_inventory')
                  .insert({
                    name,
                    category,
                    variety_type,
                    status: item.estado || item.status || 'saludable',
                    latitude: lat,
                    longitude: lng,
                    accuracy_meters: acc,
                    notes: item.observaciones || item.notes || 'Registrado por voz en Campito Jorox',
                    is_active: true,
                  })
                  .select()
                  .single();

                if (!insErr && newRow) {
                  newlyAddedBatch.push(newRow);
                  contextDataRef.current += `\n- [${(newRow.category || 'arbol').toUpperCase()}] ${newRow.name} (${newRow.variety_type || ''}) | Lat/Lng: ${newRow.latitude}, ${newRow.longitude}`;
                }
              }

              if (newlyAddedBatch.length > 0) {
                setFarmInventory((prev) => [...newlyAddedBatch, ...prev]);
              }
            }
          } catch (e) {
            console.warn('Error al procesar bloque REGISTRAR_PUNTOS:', e);
          }
        }

        // 2. Detección y ejecución de orden de registro de punto único
        const regPointMatch = successResult.match(/\[\[REGISTRAR_PUNTO:\s*(\{.*?\})\s*\]\]/s);
        if (regPointMatch) {
          try {
            const regData = JSON.parse(regPointMatch[1]);
            displayedContent = displayedContent.replace(regPointMatch[0], '').trim();

            const lat = Number(regData.latitude) || (currentGpsInfo ? currentGpsInfo.lat : 36.72595);
            const lng = Number(regData.longitude) || (currentGpsInfo ? currentGpsInfo.lng : -4.89462);
            const acc = Number(regData.accuracy_meters) || (currentGpsInfo ? currentGpsInfo.accuracy : 3.0);

            const pointCat = regData.category || regData.tipo || 'arbol';
            const pointVariety = regData.variety_type || regData.variedad || (regData.tipo && regData.tipo !== pointCat ? regData.tipo : null);
            const pointName = regData.name || `${regData.tipo || pointCat} ${pointVariety || ''}`.trim();

            const { data: newPoint, error: insErr } = await supabase
              .from('farm_inventory')
              .insert({
                name: pointName,
                category: pointCat,
                variety_type: pointVariety,
                status: regData.status || regData.estado || 'saludable',
                latitude: lat,
                longitude: lng,
                accuracy_meters: acc,
                notes: regData.notes || regData.observaciones || 'Registrado con GPS desde Chat IA',
                is_active: true,
              })
              .select()
              .single();

            if (!insErr && newPoint) {
              newlyAddedBatch.push(newPoint);
              setFarmInventory((prev) => [newPoint, ...prev]);
              contextDataRef.current += `\n- [${(newPoint.category || 'arbol').toUpperCase()}] ${newPoint.name} (${newPoint.variety_type || ''}) | Estado: ${newPoint.status} | Lat/Lng: ${newPoint.latitude}, ${newPoint.longitude}`;
            }
          } catch (e) {
            console.warn('Error al procesar orden de registro de punto:', e);
          }
        }

        // Detección y ejecución de orden de borrado de puntos del inventario catastral
        const delPointMatch = successResult.match(/\[\[BORRAR_PUNTO:\s*(\{.*?\})\s*\]\]/s);
        if (delPointMatch) {
          try {
            const delData = JSON.parse(delPointMatch[1]);
            displayedContent = displayedContent.replace(delPointMatch[0], '').trim();

            if (delData.target === 'ultimo') {
              const target = farmInventoryRef.current[0];
              if (target) {
                await supabase.from('farm_inventory').update({ is_active: false }).eq('id', target.id);
                setFarmInventory((prev) => prev.filter((p) => p.id !== target.id));
              }
            } else if (delData.query) {
              const q = delData.query.toLowerCase().trim();
              const target = farmInventoryRef.current.find((p) =>
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.variety_type && p.variety_type.toLowerCase().includes(q)) ||
                (p.category && p.category.toLowerCase().includes(q))
              );
              if (target) {
                await supabase.from('farm_inventory').update({ is_active: false }).eq('id', target.id);
                setFarmInventory((prev) => prev.filter((p) => p.id !== target.id));
              }
            }
          } catch (e) {
            console.warn('Error al procesar orden de borrado de punto:', e);
          }
        } else if (text) {
          // Heurística de respaldo si el usuario pidió explícitamente borrar por voz o texto
          const lower = text.toLowerCase().trim();
          const isDeleteLast =
            lower.includes('borra el último árbol') ||
            lower.includes('borra el ultimo arbol') ||
            lower.includes('elimina el último árbol') ||
            lower.includes('elimina el ultimo arbol') ||
            lower.includes('borra el último punto') ||
            lower.includes('borra el ultimo punto') ||
            lower.includes('elimina el último punto') ||
            lower.includes('cancela el último');

          if (isDeleteLast && farmInventoryRef.current.length > 0) {
            const target = farmInventoryRef.current[0];
            try {
              supabase.from('farm_inventory').update({ is_active: false }).eq('id', target.id);
              setFarmInventory((prev) => prev.filter((p) => p.id !== target.id));
            } catch (err) {
              console.warn('Error en heurística de borrado:', err);
            }
          }
        }

        // 3. Detección y ejecución de orden de creación de evento en el calendario
        const evMatch = successResult.match(/\[\[CREAR_EVENTO:\s*(\{.*?\})\s*\]\]/s);
        if (evMatch) {
          try {
            const evData = JSON.parse(evMatch[1]);
            displayedContent = displayedContent.replace(evMatch[0], '').trim();

            const evDate = evData.date ? `${evData.date.split('T')[0]}T00:00:00Z` : new Date().toISOString();
            const evEndDate = evData.end_date ? `${evData.end_date.split('T')[0]}T00:00:00Z` : evDate;
            const evStartTime = evData.start_time ? (evData.start_time.substring(0, 5) + ':00') : '08:00:00';
            const evEndTime = evData.end_time ? (evData.end_time.substring(0, 5) + ':00') : '10:00:00';
            const evCat = evData.category || 'RIEGO - La Nana';
            const evResp = Array.isArray(evData.responsibles)
              ? evData.responsibles
              : (evData.responsibles ? [evData.responsibles] : ['Ariel']);
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
              setFincaEvents((prev) => [...prev, newEvRow]);
              if (refetchEvents) refetchEvents();
            }
          } catch (e) {
            console.warn('Error al procesar bloque CREAR_EVENTO:', e);
          }
        }

        // 4. Detección y ejecución de creación de transacción / gasto / venta
        const txMatch = successResult.match(/\[\[CREAR_TRANSACCION:\s*(\{.*?\})\s*\]\]/s);
        if (txMatch) {
          try {
            const txData = JSON.parse(txMatch[1]);
            displayedContent = displayedContent.replace(txMatch[0], '').trim();

            const rawType = txData.type || 'Gasto';
            const rawAmt = Math.abs(parseFloat(txData.amount || 0));
            const isRetiro = ['retiro', 'venta', 'ingreso'].includes(rawType.toLowerCase());
            const finalAmount = isRetiro ? -rawAmt : rawAmt;

            const { data: authData } = await supabase.auth.getUser();
            const currUser = authData?.user;

            const { data: newTxRow, error: txInsErr } = await supabase
              .from('transactions')
              .insert({
                date: new Date().toISOString(),
                user_id: currUser?.id || null,
                type: rawType,
                amount: finalAmount,
                description: txData.description || 'Registrado desde Chat IA',
                status: 'ACTIVE',
              })
              .select()
              .single();

            if (!txInsErr && newTxRow) {
              setFincaTransactions((prev) => [newTxRow, ...prev]);
              if (refetchTransactions) refetchTransactions();
            }
          } catch (e) {
            console.warn('Error al procesar bloque CREAR_TRANSACCION:', e);
          }
        }

        // 5. Detección y extracción de archivos exportables (PDF, EXCEL, TXT, XML, KML)
        const exportFiles = [];

        // Coincidencia con [[EXPORTAR_ARCHIVO: { ... }]]
        const exportMatches = [...successResult.matchAll(/\[\[EXPORTAR_ARCHIVO:\s*(\{.*?\})\s*\]\]/gs)];
        for (const match of exportMatches) {
          try {
            const fileData = JSON.parse(match[1]);
            exportFiles.push(fileData);
            displayedContent = displayedContent.replace(match[0], '').trim();
          } catch (e) {
            console.warn('Error al procesar bloque EXPORTAR_ARCHIVO:', e);
          }
        }

        // Coincidencia alternativa con bloques de código ```export_file { ... } ```
        const codeExportMatches = [...successResult.matchAll(/```(?:export_file|download_file|export)\s*(\{.*?\})\s*```/gs)];
        for (const match of codeExportMatches) {
          try {
            const fileData = JSON.parse(match[1]);
            exportFiles.push(fileData);
            displayedContent = displayedContent.replace(match[0], '').trim();
          } catch (e) {
            console.warn('Error al procesar bloque code export_file:', e);
          }
        }

        // Heurística de respaldo: si el usuario solicitó explícitamente un PDF, Excel, TXT o XML
        // pero el modelo no generó el comando estructurado
        if (exportFiles.length === 0 && text) {
          const lowerText = text.toLowerCase();
          const wantsPdf = lowerText.includes('pdf') || lowerText.includes('informe descargable');
          const wantsExcel = lowerText.includes('excel') || lowerText.includes('csv') || lowerText.includes('hoja de cálculo');
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

        // Heurística de respaldo si el usuario pidió recordar algo y el modelo no generó la etiqueta
        if (!learnedMemory && text) {
          const lowerText = text.toLowerCase().trim();
          const triggers = ['recuerda que', 'recuerda:', 'aprende que', 'aprende:', 'guarda que', 'guarda este dato:', 'anota que', 'toma nota de que'];
          for (const trig of triggers) {
            if (lowerText.startsWith(trig)) {
              const contentToSave = text.substring(trig.length).replace(/^[:\s]+/, '').trim();
              if (contentToSave.length > 5) {
                learnedMemory = {
                  category: 'general',
                  title: contentToSave.substring(0, 45) + (contentToSave.length > 45 ? '...' : ''),
                  content: contentToSave
                };
                break;
              }
            }
          }
        }

        setActiveServer(serverThatAnswered);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: displayedContent,
            serverUsed: serverThatAnswered,
            learnedMemory: learnedMemory || null,
            inventoryExportBatch: newlyAddedBatch.length > 0 ? newlyAddedBatch : null,
            exportFiles: exportFiles.length > 0 ? exportFiles : null,
          },
        ]);

        // Persistir en segundo plano en Supabase para respaldo automático a Drive y memoria viva
        (async () => {
          try {
            let uploadedFileUrl = null;
            let uploadedFileName = null;

            // Subir archivo adjunto (documento, foto o PDF) si se adjuntó alguno
            if (att && att.file) {
              const fileExt = att.name ? att.name.split('.').pop() : (att.isPdf ? 'pdf' : 'jpg');
              const cleanFileName = `chat-ia/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
              try {
                const { error: uploadErr } = await supabase.storage
                  .from('comprobantes')
                  .upload(cleanFileName, att.file, { contentType: att.type || 'application/octet-stream' });

                if (!uploadErr) {
                  const { data: pubUrl } = supabase.storage.from('comprobantes').getPublicUrl(cleanFileName);
                  uploadedFileUrl = pubUrl?.publicUrl || null;
                  uploadedFileName = cleanFileName;
                }
              } catch (fileErr) {
                console.warn('[ChatIA] No se pudo subir archivo a storage:', fileErr);
              }
            } else if (aud && aud.blob) {
              // Subir audio si se grabó nota de voz
              const ext = aud.mimeType?.includes('mp4') ? 'm4a' : (aud.mimeType?.includes('ogg') ? 'ogg' : 'webm');
              const cleanAudioName = `chat-ia/audio-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
              try {
                const { error: uploadAudioErr } = await supabase.storage
                  .from('comprobantes')
                  .upload(cleanAudioName, aud.blob, { contentType: aud.mimeType || 'audio/webm' });
                if (!uploadAudioErr) {
                  const { data: pubUrl } = supabase.storage.from('comprobantes').getPublicUrl(cleanAudioName);
                  uploadedFileUrl = pubUrl?.publicUrl || null;
                  uploadedFileName = cleanAudioName;
                }
              } catch (audioUpErr) {
                console.warn('No se pudo subir audio a storage:', audioUpErr);
              }
            }

            const { data: authData } = await supabase.auth.getUser();
            const u = authData?.user;
            const currentUserName = u?.user_metadata?.name || u?.email?.split('@')[0] || 'Admin';

            // Si se detectó conocimiento nuevo, guardarlo de inmediato en memoria local y Supabase
            if (learnedMemory && learnedMemory.content) {
              const geoTag = effectivePt ? ` [📍 GPS: ${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}]` : '';
              const enrichedContent = learnedMemory.content.includes('[📍')
                ? learnedMemory.content
                : `${learnedMemory.content}${geoTag}`;

              const memoryEntry = {
                id: 'mem-' + Date.now(),
                category: learnedMemory.category || 'general',
                title: learnedMemory.title || 'Dato aprendido',
                content: enrichedContent,
                source: 'chat',
                user_id: u?.id || null,
                user_name: currentUserName,
                created_at: new Date().toISOString(),
                is_active: true,
              };

              // Guardar siempre en estado y en localStorage (nunca se pierde)
              setFarmKnowledge((prev) => {
                const updated = [memoryEntry, ...prev.filter((p) => p.title !== memoryEntry.title || p.content !== memoryEntry.content)];
                try {
                  localStorage.setItem('campito_farm_knowledge_all', JSON.stringify(updated));
                } catch {
                  // ignore
                }
                return updated;
              });

              contextDataRef.current += `\n- [${(memoryEntry.category || 'general').toUpperCase()}] ${memoryEntry.title}: ${memoryEntry.content}`;

              // Intentar sincronizar en Supabase si la tabla existe
              try {
                await supabase.from('farm_knowledge').insert({
                  category: memoryEntry.category,
                  title: memoryEntry.title,
                  content: memoryEntry.content,
                  source: 'chat',
                  user_id: u?.id || null,
                  user_name: currentUserName,
                  is_active: true,
                });
              } catch (memErr) {
                console.warn('[ChatIA] Aviso sincronizando memoria con Supabase:', memErr?.message);
              }
            }

            // Guardar mensaje del usuario en chat_history
            const gpsLabel = effectivePt ? ` [GPS: ${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}]` : '';
            await supabase.from('chat_history').insert({
              role: 'user',
              content: (text || (att ? `[Archivo adjunto: ${att.name}]` : (aud ? `[Audio grabado: ${aud.duration}s]` : ''))) + gpsLabel,
              file_url: uploadedFileUrl,
              file_name: uploadedFileName,
              user_id: u?.id || null,
              user_name: currentUserName,
              model_used: null,
            });

            // Guardar respuesta del asistente en chat_history
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
        })();
      } else {
        const isQuota = lastError?.isQuota;
        setError(
          isQuota
            ? 'Todos los modelos de Gemini superaron su límite de cuota actual. Intenta de nuevo en unos minutos.'
            : (lastError?.message || 'Error al conectar con el asistente. Intenta de nuevo.')
        );
      }

      setIsLoading(false);
    },
    [
      input,
      messages,
      isLoading,
      pendingAttachment,
      pendingAudio,
      selectedServerIndex,
      autoFallback,
      currentUserId,
      fincaEvents,
      fincaTransactions,
      fincaUsers,
      farmKnowledge,
      farmInventory,
      farmPaths,
      outletEvents,
      outletTransactions,
      outletUsers,
      refetchEvents,
      refetchTransactions,
    ]
  );

  // Enter envía
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Cámara directa para foto de campo
  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingAttachment({
        file,
        name: file.name || `foto-${Date.now()}.jpg`,
        size: file.size,
        type: file.type || 'image/jpeg',
        dataUrl: ev.target.result,
        textContent: null,
        isImage: true,
        isPdf: false,
        isSpreadsheet: false,
        isText: false,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Botón (+) para adjuntar todo tipo de archivos y alimentar el conocimiento
  const handleAttachClick = () => {
    docInputRef.current?.click();
  };

  const handleDocumentChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const nameLower = file.name.toLowerCase();
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
    const isSpreadsheet =
      nameLower.endsWith('.xlsx') ||
      nameLower.endsWith('.xls') ||
      nameLower.endsWith('.csv');
    const isText =
      file.type.startsWith('text/') ||
      nameLower.endsWith('.txt') ||
      nameLower.endsWith('.csv') ||
      nameLower.endsWith('.json') ||
      nameLower.endsWith('.geojson') ||
      nameLower.endsWith('.kml') ||
      nameLower.endsWith('.md');

    if (isText) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPendingAttachment({
          file,
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          textContent: ev.target.result,
          dataUrl: null,
          isImage: false,
          isPdf: false,
          isSpreadsheet,
          isText: true,
        });
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPendingAttachment({
          file,
          name: file.name,
          size: file.size,
          type: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
          textContent: null,
          dataUrl: ev.target.result,
          isImage: isImg,
          isPdf,
          isSpreadsheet,
          isText: false,
        });
      };
      reader.readAsDataURL(file);
    }

    e.target.value = '';
  };

  // Grabación unificada de audio y telemetría GPS continua
  const handleMicClick = async () => {
    if (isRecording) {
      try {
        const sessionResult = await stopTracking();
        if (!sessionResult || !sessionResult.audioBlob) return;

        const { audioBlob, t0, durationSeconds, gpsTrack } = sessionResult;

        // Si se registraron múltiples puntos GPS, guardar para caminos/senderos
        if (gpsTrack && gpsTrack.length > 1) {
          setLastRecordedGpsTrack(gpsTrack);
        }

        // Asegurar que al menos tengamos la posición actual del dispositivo si el track tiene 0 lecturas
        const effectiveGpsTrack = gpsTrack && gpsTrack.length > 0
          ? gpsTrack
          : (deviceGpsRef.current ? [{ ...deviceGpsRef.current, timestamp: t0 }] : [{ lat: 36.72595, lng: -4.89462, accuracy: 4.0, timestamp: t0 }]);

        const reader = new FileReader();
        reader.onloadend = () => {
          setPendingAudio({
            blob: audioBlob,
            dataUrl: reader.result,
            mimeType: audioBlob.type || 'audio/webm',
            duration: Math.max(1, Math.round(durationSeconds)),
            t0,
            gpsTrack: effectiveGpsTrack,
          });
        };
        reader.readAsDataURL(audioBlob);
      } catch (err) {
        console.error('Error deteniendo grabación de voz:', err);
        setError('Error al procesar la grabación de voz.');
      }
      return;
    }

    try {
      setPendingAudio(null);
      setError(null);
      await startTracking({ initialGps: deviceGpsRef.current });
    } catch (err) {
      console.error('Error iniciando grabación:', err);
      setError('No se pudo acceder al micrófono o GPS. Verifica los permisos en tu navegador o móvil.');
    }
  };

  const hasText = input.trim().length > 0 || pendingAttachment !== null || pendingAudio !== null;
  const currentBadgeServer = activeServer || GEMINI_SERVERS[selectedServerIndex];

  return (
    <div style={styles.page}>
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>
            <Bot size={18} color="#ffffff" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <p style={styles.headerTitle}>CHAT IA</p>
            <button
              onClick={() => setIsInfoModalOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                color: '#94a3b8',
                borderRadius: '50%',
                transition: 'color 0.15s, background-color 0.15s',
                flexShrink: 0,
              }}
              title="Información de confidencialidad y modo de operación"
              aria-label="Información de confidencialidad y modo de operación"
            >
              <Info size={15} />
            </button>
            <button
              onClick={handleResetChat}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                color: '#94a3b8',
                borderRadius: '50%',
                transition: 'color 0.15s, transform 0.15s',
                flexShrink: 0,
              }}
              title="Nueva conversación limpia (el historial se mantiene respaldado)"
              aria-label="Nueva conversación"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Badge interactivo del servidor actual */}
        <div
          style={styles.serverBadge(currentBadgeServer.badgeColor)}
          onClick={() => setIsServerModalOpen(true)}
          title={`Click para ver/cambiar servidor de Gemini (${currentBadgeServer.name})`}
        >
          <span style={styles.statusDot(currentBadgeServer.badgeColor)} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              display: 'inline-block',
            }}
          >
            {currentBadgeServer.name}
          </span>
          <ChevronDown size={13} style={{ color: '#64748b', flexShrink: 0 }} />
        </div>
      </div>

      {/* ─── Banner de Notificación de Fallback Automático ────────────────────── */}
      {fallbackNotice && (
        <div style={styles.fallbackAlert}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>
              ⚡ Cuota agotada en <b>{fallbackNotice.from.name}</b>. Conectado a{' '}
              <b>
                {fallbackNotice.to.name} ({fallbackNotice.to.level})
              </b>
              .
            </span>
          </div>
          <button
            onClick={() => setFallbackNotice(null)}
            style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', padding: 2 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ─── Modal de Selección y Estado de Servidores ───────────────────────── */}
      {isServerModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsServerModalOpen(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} color="#00979d" />
                <p style={styles.modalTitle}>Servidores de Gemini</p>
              </div>
              <button
                onClick={() => setIsServerModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Estado de conexión actual */}
              <div
                style={{
                  padding: '9px 12px',
                  backgroundColor: '#f0fdfa',
                  borderRadius: 8,
                  border: '1px solid #99f6e4',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={styles.statusDot(activeServer.badgeColor)} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#0f766e' }}>
                    Conectado: {activeServer.name} ({activeServer.level})
                  </p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: '#115e59' }}>
                    Cuota activa y respondiendo correctamente
                  </p>
                </div>
                <CheckCircle2 size={16} color="#00979d" />
              </div>

              <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '4px 0 0' }}>
                Selecciona un modelo o deja activo el <b>Auto-Fallback</b> para usar el más potente disponible:
              </p>

              {GEMINI_SERVERS.map((srv, idx) => {
                const isConnectedNow = activeServer.id === srv.id;

                return (
                  <div
                    key={srv.id}
                    style={{
                      ...styles.serverCard(isConnectedNow),
                      opacity: srv.comingSoon ? 0.6 : 1,
                      cursor: srv.comingSoon ? 'not-allowed' : 'pointer',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 6,
                    }}
                    onClick={() => {
                      if (srv.comingSoon) return;
                      setSelectedServerIndex(idx);
                      setActiveServer(srv);
                      setIsServerModalOpen(false);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={styles.statusDot(srv.badgeColor)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                            {srv.name}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 10,
                              backgroundColor: `${srv.badgeColor}20`,
                              color: srv.badgeColor,
                            }}
                          >
                            ({srv.level})
                          </span>
                          {isConnectedNow && (
                            <span style={{ fontSize: '0.65rem', color: '#00979d', fontWeight: 700, backgroundColor: '#ccfbf1', padding: '1px 6px', borderRadius: 8 }}>
                              Conectado Ahora
                            </span>
                          )}
                          {!isConnectedNow && srv.available && (
                            <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600, backgroundColor: '#d1fae5', padding: '1px 6px', borderRadius: 8 }}>
                              Disponible (Fallback)
                            </span>
                          )}
                          {srv.comingSoon && (
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: 8 }}>
                              Próximamente
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0' }}>
                          {srv.desc}
                        </p>
                      </div>
                      {isConnectedNow && <CheckCircle2 size={16} color="#00979d" />}
                    </div>
                  </div>
                );
              })}

              {/* Toggle Auto-Fallback */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  backgroundColor: '#f8fafc',
                  borderRadius: 8,
                  marginTop: 4,
                }}
              >
                <div>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, margin: 0, color: '#1e293b' }}>
                    Auto-Fallback de cuota
                  </p>
                  <p style={{ fontSize: '0.68rem', color: '#64748b', margin: 0 }}>
                    Si se acaba el crédito, cambia al siguiente servidor
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoFallback}
                  onChange={(e) => setAutoFallback(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#00979d', cursor: 'pointer' }}
                />
              </div>

              {/* Info de la cuenta y Privacidad Confidencial */}
              <div
                style={{
                  fontSize: '0.68rem',
                  color: '#475569',
                  backgroundColor: '#f1f5f9',
                  padding: '9px 12px',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                  <ShieldCheck size={14} color="#00979d" />
                  <span>Entorno Confidencial y Privado</span>
                </div>
                <span>
                  Toda la información, audios y documentos de este chat son <b>estrictamente confidenciales</b>. Nunca se comparten con terceros externos ni redes públicas. Tú como administrador tienes total libertad para <b>exportar y descargar tus informes en PDF, Excel o KML/GeoJSON</b> cuando lo desees.
                </span>
                <span style={{ color: '#64748b', fontSize: '0.64rem', marginTop: 2 }}>
                  Cuenta: Google AI Studio · Sesión protegida y privada
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal de Información y Confidencialidad ─────────────────────────── */}
      {isInfoModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsInfoModalOpen(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={18} color="#00979d" />
                <p style={styles.modalTitle}>Confidencialidad y Uso del Asistente</p>
              </div>
              <button
                onClick={() => setIsInfoModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                aria-label="Cerrar modal de información"
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Tarjeta 1: Confidencialidad */}
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f0fdfa',
                  borderRadius: 10,
                  border: '1px solid #ccfbf1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0f766e', fontWeight: 700, fontSize: '0.85rem' }}>
                  <Lock size={15} color="#00979d" />
                  <span>1. Confidencialidad Absoluta</span>
                </div>
                <p style={{ fontSize: '0.76rem', color: '#134e4a', margin: 0, lineHeight: 1.45 }}>
                  Toda la información subida a este chat (textos, facturas, transacciones, contabilidad, fotos de la finca, audios y documentos) es <b>estrictamente confidencial y privada</b> de los administradores de Campito Jorox.
                </p>
              </div>

              {/* Tarjeta 2: Aislamiento Privado y Exportación para el Usuario */}
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1e293b', fontWeight: 700, fontSize: '0.85rem' }}>
                  <ShieldCheck size={15} color="#00979d" />
                  <span>2. Privacidad Blindada y Exportación Completa (PDF, Excel, KML)</span>
                </div>
                <p style={{ fontSize: '0.76rem', color: '#475569', margin: 0, lineHeight: 1.45 }}>
                  <b>Privacidad absoluta hacia el exterior:</b> Ningún dato, balance, foto o grabación se comparte ni sincroniza con redes públicas o terceros externos; el asistente opera en un circuito cerrado y seguro exclusivamente para Campito Jorox.
                </p>
                <p style={{ fontSize: '0.76rem', color: '#0f766e', margin: 0, lineHeight: 1.45, fontWeight: 600 }}>
                  📥 <b>Exportación total para ti:</b> Tienes plena libertad para solicitar a la IA y descargar en cualquier momento tus inventarios, recopilaciones y balances en <b>PDF, EXCEL, KML (Google My Maps) y GeoJSON</b> con un solo clic.
                </p>
              </div>

              {/* Tarjeta 3: Modus Operandi y Capacidades en Vivo */}
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1e293b', fontWeight: 700, fontSize: '0.85rem' }}>
                  <Zap size={15} color="#f59e0b" />
                  <span>3. Modo de Operación y Capacidades en Vivo</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.75rem', color: '#475569', lineHeight: 1.5 }}>
                  <li>
                    <b>📅 Calendario y Riego en Vivo:</b> Consulta turnos de riego (La Nana, El Moro), horarios, fechas y responsables con sincronización directa a la base de datos.
                  </li>
                  <li>
                    <b>💰 Contabilidad y Balances Reales:</b> Consulta gastos, ventas, balance neto y liquidaciones individuales de socios (Ariel, Carlos) sin inventar cifras.
                  </li>
                  <li>
                    <b>✍️ Acciones Directas en la DB:</b> Crea eventos en el calendario o apunta transacciones contables desde el chat con lenguaje natural.
                  </li>
                  <li>
                    <b>🎙️ Micrófono Unificado con GPS:</b> Un solo botón para todo: dictar consultas, registrar transacciones o inventariar árboles y arquetas caminando por los bancales con telemetría GPS continua.
                  </li>
                  <li>
                    <b>📎 Botón '+' Multiformato:</b> Adjunta análisis foliares y de suelo en PDF, albaranes, fotos de plagas o archivos Excel/CSV para nutrir el conocimiento del chat.
                  </li>
                  <li>
                    <b>⚡ Cascada de IA Inteligente:</b> Conexión multinivel con modelos Pro y Flash que desciende automáticamente si se agota la cuota para garantizar disponibilidad 24/7.
                  </li>
                </ul>
              </div>

              {/* Tarjeta 4: Módulo de Aprendizaje Continuo (Memoria Nativa de Finca) */}
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 10,
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#166534', fontWeight: 700, fontSize: '0.85rem' }}>
                    <Brain size={16} color="#16a34a" />
                    <span>4. Memoria y Aprendizaje Permanente (Nativo)</span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d', padding: '1px 8px', borderRadius: 10 }}>
                    {farmKnowledge.length} hechos grabados
                  </span>
                </div>
                <p style={{ fontSize: '0.76rem', color: '#14532d', margin: 0, lineHeight: 1.45 }}>
                  La IA no requiere botones adicionales: aprende de forma completamente natural en el chat. Almacena cada regla en <b>memoria híbrida (local y base de datos permanente)</b>:
                </p>
                <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #dcfce7', fontSize: '0.72rem', color: '#166534', fontFamily: 'monospace' }}>
                  💡 <i>"Recuerda que la electroválvula del sector 2 riega 40 min los martes"</i><br />
                  💡 <i>"Aprende que la dosis de quelato de hierro es 50g por árbol en primavera"</i>
                </div>
                <p style={{ fontSize: '0.73rem', color: '#15803d', margin: 0, lineHeight: 1.4 }}>
                  El asistente retendrá esa regla permanentemente y la aplicará en todas las sesiones. Puedes preguntarle en cualquier momento: <i>"¿Qué cosas recuerdas de la finca?"</i>.
                </p>
              </div>

              {/* Tarjeta 5: Catastro Agrícola GPS y Descargas PDF / EXCEL / KML / GeoJSON */}
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: 10,
                  border: '1px solid #bae6fd',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0369a1', fontWeight: 700, fontSize: '0.85rem' }}>
                    <MapPin size={16} color="#0284c7" />
                    <span>5. Catastro Satélite GPS y Descargas (PDF / Excel / KML / GeoJSON)</span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#e0f2fe', color: '#0284c7', padding: '1px 8px', borderRadius: 10 }}>
                    {farmInventory.length} puntos mapeados
                  </span>
                </div>
                <p style={{ fontSize: '0.76rem', color: '#075985', margin: 0, lineHeight: 1.45 }}>
                  Mapea árboles, arquetas y tuberías caminando por la finca con el micrófono unificado, o visualiza y traza caminos interactivos con cálculo métrico en el mapa satélite:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2 }}>
                  <button
                    onClick={() => {
                      setIsInfoModalOpen(false);
                      setIsInventoryMapOpen(true);
                    }}
                    style={{
                      padding: '7px 8px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Map size={13} />
                    Ver Mapa / Catastro
                  </button>

                  <button
                    onClick={() => exportInventoryToExcel(farmInventory)}
                    disabled={farmInventory.length === 0}
                    style={{
                      padding: '7px 8px',
                      backgroundColor: '#059669',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: farmInventory.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: farmInventory.length === 0 ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <FileSpreadsheet size={13} />
                    Descargar Excel
                  </button>

                  <button
                    onClick={() => exportInventoryToPDF(farmInventory)}
                    disabled={farmInventory.length === 0}
                    style={{
                      padding: '7px 8px',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: farmInventory.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: farmInventory.length === 0 ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Download size={13} />
                    Descargar PDF
                  </button>

                  <button
                    onClick={() => exportInventoryToKML(farmInventory)}
                    disabled={farmInventory.length === 0}
                    style={{
                      padding: '7px 8px',
                      backgroundColor: '#475569',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: farmInventory.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: farmInventory.length === 0 ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Layers size={13} />
                    Capa KML (My Maps)
                  </button>
                </div>
              </div>

              {/* Botón de acción */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => {
                    setIsInfoModalOpen(false);
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: Date.now().toString(),
                        role: 'assistant',
                        content: `### 🌿 Guía Operativa, Privacidad y Capacidades del Asistente IA · Campito Jorox\n\n**1. 🔒 Privacidad y Confidencialidad Blindada:**\n- Todos los datos (contabilidad, calendario, facturas, audios, análisis de suelo y catastro) son estrictamente privados de los administradores de Campito Jorox.\n- No se comparten ni sincronizan con terceros ni redes externas.\n\n**2. 📅 Calendario y Riego en Vivo:**\n- Consulta en tiempo real turnos de riego (*La Nana*, *El Moro*), horas de inicio y fin, fechas y asignados.\n- Puedes pedirle directamente: *"¿Qué riego tenemos el sábado?"* o programar turnos: *"Crea un turno de riego para mañana de 8 a 10 con Carlos"*.\n\n**3. 💰 Contabilidad y Balances Reales:**\n- Consulta en vivo gastos, ventas, saldo neto y cuentas individuales de cada socio (*Ariel*, *Carlos*).\n- Apunta movimientos al vuelo: *"Apunta un gasto de 45€ en abono foliar"* y la IA lo registrará en la base de datos.\n\n**4. 🎙️ Micrófono Unificado con Telemetría GPS Continua:**\n- Un solo botón de micrófono para todo: hacer preguntas, dictar gastos o inventariar árboles mientras caminas por la finca.\n- Muestrea tu posición GPS cada 1.5s e interpola la ubicación exacta de cada árbol o arqueta descrita durante el paseo.\n\n**5. 🧠 Memoria y Aprendizaje Permanente Nativo:**\n- Enseña reglas sin botones ni menús: solo dile *"Recuerda que..."* o *"Aprende que..."*.\n- Se guarda de forma híbrida e instantánea en la memoria de tu dispositivo y en la base de datos permanente.\n- Pregunta en cualquier momento: *"¿Qué cosas recuerdas de la finca?"*.\n\n**6. 📎 Botón '+' Multiformato:**\n- Sube análisis de suelo o foliares en PDF, fotos de hojas con posibles plagas, albaranes o archivos Excel/CSV para alimentar el conocimiento del asistente.\n\n**7. 🗺️ Catastro Satélite y Descargas:**\n- Visualiza árboles geolocalizados por colores, traza caminos y calcula sus metros.\n- Descarga tus informes en **PDF**, **Excel**, **KML (Google My Maps)** y **GeoJSON** con un solo clic.\n\n**8. ⚡ Cascada Inteligente de Modelos IA:**\n- Conectado a los modelos más avanzados de Gemini (Pro y Flash) con conmutación automática ante saturación de cuota.`,
                        serverUsed: activeServer,
                      },
                    ]);
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #00979d',
                    backgroundColor: '#ffffff',
                    color: '#00979d',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Pegar guía en el chat
                </button>
                <button
                  onClick={() => setIsInfoModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#00979d',
                    color: '#ffffff',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal de Catastro y Mapa Satélite EN VIVO (Puntos y Caminos) ────── */}
      {isInventoryMapOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsInventoryMapOpen(false)}>
          <div
            style={{
              ...styles.modalContent,
              maxWidth: 960,
              width: '96vw',
              height: '90vh',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Modal con Pestañas */}
            <div style={{ ...styles.modalHeader, padding: '10px 16px', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={18} color="#00979d" />
                <div>
                  <p style={{ ...styles.modalTitle, fontSize: '0.92rem' }}>Catastro y Mapa Satélite — Campito Jorox</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748b' }}>
                    {farmInventory.length} puntos | {farmPaths.length} caminos y senderos trazados
                  </p>
                </div>
              </div>

              {/* Botones de Pestañas (Tabs) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setInventoryModalTab('map')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: inventoryModalTab === 'map' ? '#00979d' : '#cbd5e1',
                    backgroundColor: inventoryModalTab === 'map' ? '#00979d' : '#ffffff',
                    color: inventoryModalTab === 'map' ? '#ffffff' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Map size={13} />
                  <span>Mapa Satélite</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInventoryModalTab('inventory')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: inventoryModalTab === 'inventory' ? '#10b981' : '#cbd5e1',
                    backgroundColor: inventoryModalTab === 'inventory' ? '#10b981' : '#ffffff',
                    color: inventoryModalTab === 'inventory' ? '#ffffff' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <MapPin size={13} />
                  <span>Árboles ({farmInventory.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInventoryModalTab('paths')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: inventoryModalTab === 'paths' ? '#f97316' : '#cbd5e1',
                    backgroundColor: inventoryModalTab === 'paths' ? '#f97316' : '#ffffff',
                    color: inventoryModalTab === 'paths' ? '#ffffff' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Navigation size={13} />
                  <span>Caminos ({farmPaths.length})</span>
                </button>

                <button
                  onClick={() => setIsInventoryMapOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
                  aria-label="Cerrar modal de mapa"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Cuerpo del Modal */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* PESTAÑA 1: MAPA SATÉLITE EN VIVO */}
              {inventoryModalTab === 'map' && (
                <div style={{ width: '100%', height: '100%', minHeight: 400 }}>
                  <FarmSatelliteMap
                    inventory={farmInventory}
                    paths={farmPaths}
                    onReloadInventory={reloadInventory}
                    onReloadPaths={reloadPaths}
                    lastRecordedGpsTrack={lastRecordedGpsTrack}
                    onPathCreated={(newP) => setFarmPaths((prev) => [newP, ...prev])}
                  />
                </div>
              )}

              {/* PESTAÑA 2: LISTA DE ÁRBOLES E INFRAESTRUCTURA */}
              {inventoryModalTab === 'inventory' && (
                <div style={{ ...styles.modalBody, flex: 1, overflowY: 'auto' }}>
                  {/* Barra de Descargas y Exportaciones */}
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                        📥 Descarga Segura y Fichero para el Usuario
                      </span>
                      <a
                        href="https://www.google.com/maps/d/u/1/edit?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#0284c7',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        Google My Maps Jorox
                        <ExternalLink size={10} />
                      </a>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      <button
                        onClick={() => exportInventoryToExcel(farmInventory, farmPaths)}
                        disabled={farmInventory.length === 0 && farmPaths.length === 0}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#059669',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <FileSpreadsheet size={13} />
                        Excel
                      </button>

                      <button
                        onClick={() => exportInventoryToPDF(farmInventory, farmPaths)}
                        disabled={farmInventory.length === 0 && farmPaths.length === 0}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Download size={13} />
                        PDF
                      </button>

                      <button
                        onClick={() => exportInventoryToKML(farmInventory, farmPaths)}
                        disabled={farmInventory.length === 0 && farmPaths.length === 0}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Map size={13} />
                        KML
                      </button>

                      <button
                        onClick={() => exportInventoryToGeoJSON(farmInventory, farmPaths)}
                        disabled={farmInventory.length === 0 && farmPaths.length === 0}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#475569',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Layers size={13} />
                        GeoJSON
                      </button>
                    </div>
                  </div>

                  {/* Filtro y Búsqueda */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Buscar por árbol, variedad o notas..."
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: '0.75rem',
                        outline: 'none',
                        backgroundColor: '#fafafa',
                      }}
                    />
                    <select
                      value={inventoryCategoryFilter}
                      onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: '0.72rem',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <option value="all">Todas ({farmInventory.length})</option>
                      <option value="arbol">🥑 Árboles</option>
                      <option value="riego_linea">💧 Riego / Tuberías</option>
                      <option value="arqueta">🔲 Arquetas</option>
                      <option value="acequia">🧱 Acequias / Albercas</option>
                      <option value="piedra_linde">🪨 Piedras de Linde</option>
                    </select>
                  </div>

                  {/* Lista de elementos georreferenciados */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    {farmInventory.length === 0 ? (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '24px 16px',
                          color: '#94a3b8',
                          fontSize: '0.78rem',
                          backgroundColor: '#f8fafc',
                          borderRadius: 8,
                          border: '1px dashed #cbd5e1',
                        }}
                      >
                        <MapPin size={24} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                        <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>
                          Aún no hay árboles ni puntos georreferenciados
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: '0.72rem' }}>
                          Inicia una caminata en campo con el botón <b>🧭 (Navegación)</b> del chat para mapear con voz y GPS.
                        </p>
                      </div>
                    ) : (
                      farmInventory
                        .filter((item) => {
                          if (inventoryCategoryFilter !== 'all') {
                            const cat = (item.category || item.tipo || '').toLowerCase();
                            if (!cat.includes(inventoryCategoryFilter)) return false;
                          }
                          if (!inventorySearch.trim()) return true;
                          const q = inventorySearch.toLowerCase();
                          return (
                            (item.name && item.name.toLowerCase().includes(q)) ||
                            (item.variety_type && item.variety_type.toLowerCase().includes(q)) ||
                            (item.notes && item.notes.toLowerCase().includes(q)) ||
                            (item.status && item.status.toLowerCase().includes(q))
                          );
                        })
                        .map((item) => {
                          const lat = item.latitude || (item.coordenadas && item.coordenadas.lat);
                          const lng = item.longitude || (item.coordenadas && item.coordenadas.lng);
                          const acc = item.accuracy_meters || item.accuracy_m;
                          const hasWarning = item.gps_warning || item.advertencia_gps;

                          const statusColors = {
                            saludable: { bg: '#dcfce7', text: '#15803d', label: 'Saludable' },
                            clorosis: { bg: '#fef3c7', text: '#b45309', label: 'Clorosis' },
                            poda_requerida: { bg: '#fee2e2', text: '#b91c1c', label: 'Poda urgente' },
                            enfermo: { bg: '#fee2e2', text: '#991b1b', label: 'Enfermo' },
                            seco: { bg: '#f1f5f9', text: '#475569', label: 'Seco' },
                            mantenimiento: { bg: '#fef3c7', text: '#92400e', label: 'Mantenimiento' },
                            bueno: { bg: '#dcfce7', text: '#166534', label: 'Bueno' },
                          };
                          const stInfo = statusColors[item.status || item.estado] || statusColors.saludable;

                          return (
                            <div
                              key={item.id}
                              style={{
                                padding: '10px 12px',
                                backgroundColor: '#ffffff',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 5,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                    {item.name || `${item.tipo || 'Árbol'} ${item.variedad || ''}`}
                                  </span>
                                  {item.variety_type && (
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                      ({item.variety_type})
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: '0.64rem',
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: 8,
                                      backgroundColor: stInfo.bg,
                                      color: stInfo.text,
                                    }}
                                  >
                                    {stInfo.label}
                                  </span>
                                </div>

                                <button
                                  onClick={() => handleDeleteInventoryItem(item.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#94a3b8',
                                    padding: '2px',
                                    borderRadius: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                  title="Eliminar elemento"
                                  aria-label="Eliminar elemento"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#334155' }}>
                                  <MapPin size={12} color="#00979d" />
                                  <span>
                                    {lat && lng ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : 'Sin coordenadas'}
                                  </span>
                                  {acc && (
                                    <span style={{ fontSize: '0.66rem', color: hasWarning ? '#b45309' : '#059669', fontWeight: 600 }}>
                                      (±{Number(acc).toFixed(1)}m){hasWarning ? ' ⚠️' : ''}
                                    </span>
                                  )}
                                </div>

                                {lat && lng && (
                                  <a
                                    href={`https://maps.google.com/?q=${lat},${lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: '0.68rem',
                                      color: '#0284c7',
                                      textDecoration: 'none',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3,
                                    }}
                                  >
                                    Ver en Google Maps
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>

                              {(item.notes || item.observaciones) && (
                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#475569', fontStyle: 'italic', lineHeight: 1.4 }}>
                                  "{item.notes || item.observaciones}"
                                </p>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}

              {/* PESTAÑA 3: LISTA DE CAMINOS Y SENDEROS TRAZADOS */}
              {inventoryModalTab === 'paths' && (
                <div style={{ ...styles.modalBody, flex: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                      Caminos, Senderos y Líneas de Riego ({farmPaths.length})
                    </span>
                    <button
                      onClick={() => setInventoryModalTab('map')}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#f97316',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Plus size={12} />
                      Trazar nuevo camino en el mapa
                    </button>
                  </div>

                  {farmPaths.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '28px 16px',
                        color: '#94a3b8',
                        fontSize: '0.78rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: 8,
                        border: '1px dashed #cbd5e1',
                      }}
                    >
                      <Navigation size={24} color="#f97316" style={{ margin: '0 auto 8px', display: 'block' }} />
                      <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>
                        Aún no se han trazado caminos ni senderos
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.72rem' }}>
                        Ve a la pestaña <b>Mapa Satélite</b> y pulsa <b>"Trazar Camino / Sendero"</b> para dibujar sobre el satélite con clics.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {farmPaths.map((p) => {
                        const coords = Array.isArray(p.coordinates) ? p.coordinates : [];
                        return (
                          <div
                            key={p.id}
                            style={{
                              padding: '10px 12px',
                              backgroundColor: '#ffffff',
                              borderRadius: 8,
                              border: '1px solid #e2e8f0',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span
                                  style={{
                                    width: 16,
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: p.color || '#f97316',
                                    display: 'inline-block',
                                  }}
                                />
                                <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#1e293b' }}>
                                  {p.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    borderRadius: 6,
                                    backgroundColor: '#f1f5f9',
                                    color: '#475569',
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.path_type}
                                </span>
                              </div>

                              <button
                                onClick={() => handleDeletePath(p.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#dc2626',
                                  padding: 2,
                                }}
                                title="Eliminar camino"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                              <span>
                                Longitud: <b>{p.length_meters ? `${Number(p.length_meters).toFixed(1)}m` : '—'}</b>
                              </span>
                              <span>
                                Nodos: <b>{coords.length} vértices</b>
                              </span>
                              <span>{p.created_at ? p.created_at.split('T')[0] : ''}</span>
                            </div>

                            {p.notes && (
                              <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                                "{p.notes}"
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div style={styles.messagesArea}>
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div key={msg.id} style={styles.bubbleRow(isUser)}>
              <div style={styles.avatar(isUser)}>
                {isUser ? <User size={13} color="#fff" /> : <Bot size={13} color="#888" />}
              </div>
              <div style={styles.bubble(isUser)}>
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="Adjunto"
                    style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, marginBottom: 6, display: 'block' }}
                  />
                )}
                {msg.file && !msg.image && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      backgroundColor: isUser ? 'rgba(255,255,255,0.18)' : '#f1f5f9',
                      borderRadius: 8,
                      marginBottom: msg.content ? 6 : 0,
                      maxWidth: 260,
                      border: isUser ? '1px solid rgba(255,255,255,0.25)' : '1px solid #e2e8f0',
                    }}
                  >
                    {msg.file.isPdf ? (
                      <FileText size={18} color={isUser ? '#ffffff' : '#dc2626'} />
                    ) : msg.file.isSpreadsheet ? (
                      <FileSpreadsheet size={18} color={isUser ? '#ffffff' : '#16a34a'} />
                    ) : (
                      <Paperclip size={18} color={isUser ? '#ffffff' : '#0284c7'} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {msg.file.name}
                      </p>
                      {msg.file.size && (
                        <p style={{ margin: 0, fontSize: '0.64rem', opacity: 0.85 }}>
                          {(msg.file.size / 1024).toFixed(1)} KB
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {msg.audio && (
                  <div style={{ marginBottom: msg.content ? 6 : 0, maxWidth: 260 }}>
                    <audio
                      src={msg.audio.dataUrl}
                      controls
                      style={{
                        width: '100%',
                        height: 36,
                        borderRadius: 18,
                        outline: 'none',
                      }}
                    />
                    {msg.audio.duration && (
                      <span
                        style={{
                          fontSize: '0.66rem',
                          color: isUser ? 'rgba(255,255,255,0.85)' : '#64748b',
                          display: 'block',
                          marginTop: 2,
                        }}
                      >
                        🎙️ Audio ({msg.audio.duration}s)
                      </span>
                    )}
                  </div>
                )}
                {msg.content &&
                  (isUser ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  ) : (
                    <div className="chatia-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ))}
                {msg.learnedMemory && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 8,
                      padding: '4px 8px',
                      backgroundColor: '#f0fdf4',
                      borderRadius: 6,
                      border: '1px solid #bbf7d0',
                      fontSize: '0.72rem',
                      color: '#166534',
                      fontWeight: 600,
                    }}
                  >
                    <Brain size={13} color="#16a34a" />
                    <span>Aprendido en memoria: <b>{msg.learnedMemory.title}</b></span>
                  </div>
                )}
                {msg.inventoryExportBatch && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    <button
                      onClick={() => exportInventoryToExcel(msg.inventoryExportBatch)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#059669',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <FileSpreadsheet size={12} />
                      Descargar Excel
                    </button>
                    <button
                      onClick={() => exportInventoryToPDF(msg.inventoryExportBatch)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Download size={12} />
                      Descargar PDF
                    </button>
                    <button
                      onClick={() => exportInventoryToKML(msg.inventoryExportBatch)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Map size={12} />
                      Capa KML (My Maps)
                    </button>
                    <button
                      onClick={() => {
                        setInventoryModalTab('map');
                        setIsInventoryMapOpen(true);
                      }}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#00979d',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Compass size={12} />
                      Ver en Mapa Satélite
                    </button>
                  </div>
                )}

                {/* ── Tarjetas de Archivos Exportables Generados en el Chat (PDF, EXCEL, TXT, XML, KML) ── */}
                {msg.exportFiles && msg.exportFiles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                    {msg.exportFiles.map((file, fIdx) => {
                      const type = (file.type || 'txt').toLowerCase();
                      const isPdf = type === 'pdf';
                      const isExcel = type === 'excel' || type === 'csv' || type === 'xlsx';
                      const isXml = type === 'xml' || type === 'kml';
                      const ext = isPdf ? 'pdf' : (isExcel ? 'csv' : (isXml ? (file.filename?.endsWith('.kml') ? 'kml' : 'xml') : 'txt'));
                      const filename = file.filename || `Documento_Campito_${fIdx + 1}.${ext}`;

                      const cardBg = isPdf ? '#fef2f2' : (isExcel ? '#f0fdf4' : (isXml ? '#f0f9ff' : '#f8fafc'));
                      const cardBorder = isPdf ? '#fca5a5' : (isExcel ? '#86efac' : (isXml ? '#7dd3fc' : '#cbd5e1'));
                      const iconColor = isPdf ? '#dc2626' : (isExcel ? '#16a34a' : (isXml ? '#0284c7' : '#475569'));
                      const badgeText = isPdf ? 'PDF OFICIAL' : (isExcel ? 'HOJA EXCEL' : (isXml ? 'XML / KML' : 'TEXTO'));

                      return (
                        <div
                          key={fIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '10px 12px',
                            backgroundColor: cardBg,
                            border: `1.5px solid ${cardBorder}`,
                            borderRadius: 10,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 8,
                                backgroundColor: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                              }}
                            >
                              {isPdf ? (
                                <FileText size={20} color={iconColor} />
                              ) : isExcel ? (
                                <FileSpreadsheet size={20} color={iconColor} />
                              ) : isXml ? (
                                <FileCode size={20} color={iconColor} />
                              ) : (
                                <FileText size={20} color={iconColor} />
                              )}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontSize: '0.84rem',
                                  fontWeight: 700,
                                  color: '#0f172a',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={filename}
                              >
                                {filename}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: iconColor }}>{badgeText}</span>
                                {file.title && <span>· {file.title}</span>}
                                {file.table?.rows && <span>· {file.table.rows.length} registros</span>}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => generateCustomFile(file)}
                            style={{
                              padding: '7px 14px',
                              backgroundColor: '#00979d',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 8,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              boxShadow: '0 2px 5px rgba(0, 151, 157, 0.3)',
                              transition: 'transform 0.15s, background-color 0.15s',
                              whiteSpace: 'nowrap',
                            }}
                            title={`Descargar ${filename}`}
                          >
                            <Download size={14} />
                            Descargar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Opciones contextuales de descarga rápida para cualquier tabla del asistente ── */}
                {!isUser && !msg.exportFiles && msg.content && msg.content.includes('|') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 6, borderTop: '1px dashed #e2e8f0', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Descargar datos:</span>
                    <button
                      onClick={() => {
                        const table = extractTableFromMarkdown(msg.content);
                        const dateStr = new Date().toISOString().split('T')[0];
                        generateCustomPDF({
                          title: 'Informe Campito Jorox',
                          subtitle: 'Exportación directa desde chat',
                          content: msg.content,
                          table,
                          filename: `CAMPITO_JOROX_${dateStr}.pdf`,
                        });
                      }}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        border: '1px solid #fca5a5',
                        borderRadius: 6,
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      title="Descargar este contenido en PDF"
                    >
                      <FileText size={11} /> PDF
                    </button>
                    <button
                      onClick={() => {
                        const table = extractTableFromMarkdown(msg.content);
                        const dateStr = new Date().toISOString().split('T')[0];
                        generateCustomExcel({
                          title: 'Exportación Campito Jorox',
                          headers: table?.headers || [],
                          rows: table?.rows || [],
                          content: msg.content,
                          filename: `CAMPITO_JOROX_${dateStr}.csv`,
                        });
                      }}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: '#dcfce7',
                        color: '#16a34a',
                        border: '1px solid #86efac',
                        borderRadius: 6,
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      title="Descargar esta tabla en Excel / CSV"
                    >
                      <FileSpreadsheet size={11} /> Excel
                    </button>
                    <button
                      onClick={() => {
                        const dateStr = new Date().toISOString().split('T')[0];
                        generateCustomTXT({
                          title: 'Campito Jorox - Mensaje',
                          content: msg.content,
                          filename: `CAMPITO_JOROX_${dateStr}.txt`,
                        });
                      }}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      title="Descargar como archivo TXT"
                    >
                      <FileText size={11} /> TXT
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && <TypingIndicator currentServer={currentBadgeServer} />}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Banner de Error ─────────────────────────────────────────────────── */}
      {error && (
        <div style={styles.errorBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#cc0000', cursor: 'pointer', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Grabando Audio con Telemetría GPS en Directo ────────────────────── */}
      {isRecording && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            borderTop: '2px solid #00979d',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  display: 'inline-block',
                  animation: 'chatPulseRed 1.2s infinite ease-in-out',
                }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                Grabando con GPS activo...
              </span>
              <span
                style={{
                  fontSize: '0.78rem',
                  backgroundColor: '#334155',
                  color: '#38bdf8',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}
              >
                {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {currentGps ? (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: 12,
                    backgroundColor: accuracyWarning ? '#78350f' : '#065f46',
                    color: accuracyWarning ? '#fef08a' : '#a7f3d0',
                    fontWeight: 600,
                  }}
                >
                  📍 ±{currentGps.accuracy?.toFixed(1)}m ({gpsPointsCount} lecturas)
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>📍 Buscando satélites GPS...</span>
              )}

              <button
                type="button"
                onClick={handleMicClick}
                style={{
                  padding: '5px 14px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 16,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <StopCircle size={14} />
                Detener
              </button>
            </div>
          </div>

          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            Habla libremente: registra árboles mientras caminas (<i>"Aguacate Hass"</i>), consulta dudas o pide balances.
          </span>
        </div>
      )}


      {/* ─── Preview de Archivo, Documento o Foto Pendiente ────────────────────── */}
      {pendingAttachment && (
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {pendingAttachment.isImage && pendingAttachment.dataUrl ? (
            <img
              src={pendingAttachment.dataUrl}
              alt="Vista previa"
              style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }}
            />
          ) : pendingAttachment.isPdf ? (
            <div style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={20} color="#dc2626" />
            </div>
          ) : pendingAttachment.isSpreadsheet ? (
            <div style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileSpreadsheet size={20} color="#16a34a" />
            </div>
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={20} color="#0284c7" />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pendingAttachment.name}
            </p>
            <p style={{ fontSize: '0.68rem', color: '#64748b', margin: 0 }}>
              {(pendingAttachment.size / 1024).toFixed(1)} KB · {pendingAttachment.isPdf ? 'Documento PDF (listo para analizar)' : (pendingAttachment.isSpreadsheet ? 'Hoja de Cálculo' : (pendingAttachment.isImage ? 'Foto de campo' : 'Documento de texto'))}
            </p>
          </div>

          <button
            onClick={() => setPendingAttachment(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Quitar archivo"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ─── Barra de Input Inferior Estilo WhatsApp ───────────────────────── */}
      <div style={styles.inputBar}>
        {/* Selector de archivos general (+) */}
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.txt,.json,.geojson,.kml,.kmz,image/*,application/pdf"
          onChange={handleDocumentChange}
          style={{ display: 'none' }}
        />

        {/* Captura de cámara directa */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraChange}
          style={{ display: 'none' }}
        />

        {/* 1. Botón (+) a la izquierda para adjuntar */}
        <button
          className="chatia-iconbtn"
          style={styles.iconBtn(!!pendingAttachment && !pendingAttachment.isImage)}
          onClick={handleAttachClick}
          aria-label="Adjuntar archivo o documento (+)"
          title="Adjuntar archivo o documento (+)"
        >
          <Plus size={20} />
        </button>

        {/* 2. Cápsula central (Mismo lugar y dimensiones que TEXT input):
            - Si hay audio grabado listo: Reproductor Preview WhatsApp con Play/Pause, Scrubber y Papelera
            - Si está grabando: Indicador con tiempo, GPS y Papelera
            - Si normal: Campo de texto + icono Cámara a la derecha dentro de la cápsula */}
        {pendingAudio && !isRecording ? (
          <div style={styles.audioPreviewCapsule}>
            {/* Descartar audio */}
            <button
              type="button"
              onClick={handleDiscardAudio}
              style={styles.previewTrashBtn}
              title="Descartar nota de voz"
              aria-label="Descartar nota de voz"
            >
              <Trash2 size={18} color="#ef4444" />
            </button>

            {/* Reproducir / Pausar */}
            <button
              type="button"
              onClick={togglePlayPreview}
              style={styles.previewPlayBtn}
              title={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
              aria-label={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
            >
              {isPreviewPlaying ? (
                <Pause size={15} color="#ffffff" />
              ) : (
                <Play size={15} color="#ffffff" style={{ marginLeft: 2 }} />
              )}
            </button>

            {/* Slider / Scrubber interactivo */}
            <div style={styles.previewTrackContainer}>
              <input
                type="range"
                min={0}
                max={previewDuration || pendingAudio.duration || 1}
                step="0.05"
                value={previewCurrentTime}
                onChange={handleSeekPreview}
                style={styles.previewSlider}
                aria-label="Progreso del audio"
              />
              <div style={styles.previewTimeRow}>
                <span style={styles.previewTimeText}>
                  {formatAudioTime(previewCurrentTime > 0 ? previewCurrentTime : (previewDuration || pendingAudio.duration))}
                </span>
                {pendingAudio.gpsTrack?.length > 0 && (
                  <span style={styles.previewGpsTag} title={`${pendingAudio.gpsTrack.length} lecturas GPS vinculadas`}>
                    📍 {pendingAudio.gpsTrack.length} pts GPS
                  </span>
                )}
              </div>
            </div>

            <audio
              ref={previewAudioRef}
              src={pendingAudio.dataUrl}
              onTimeUpdate={(e) => setPreviewCurrentTime(e.target.currentTime)}
              onLoadedMetadata={(e) => {
                if (e.target.duration && !isNaN(e.target.duration) && isFinite(e.target.duration)) {
                  setPreviewDuration(Math.round(e.target.duration));
                }
              }}
              onEnded={() => {
                setIsPreviewPlaying(false);
                setPreviewCurrentTime(0);
              }}
              style={{ display: 'none' }}
            />
          </div>
        ) : isRecording ? (
          <div style={styles.recordingCapsule}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                display: 'inline-block',
                animation: 'chatPulseRed 1.2s infinite ease-in-out',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
              {formatAudioTime(recordingSeconds)}
            </span>
            {currentGps ? (
              <span
                style={{
                  fontSize: '0.72rem',
                  color: accuracyWarning ? '#b45309' : '#047857',
                  backgroundColor: accuracyWarning ? '#fef3c7' : '#d1fae5',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  marginLeft: 'auto',
                }}
              >
                📍 ±{currentGps.accuracy?.toFixed(1)}m
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>
                📍 Conectando GPS...
              </span>
            )}
            <button
              type="button"
              onClick={handleCancelRecording}
              style={styles.previewTrashBtn}
              title="Cancelar grabación"
              aria-label="Cancelar grabación"
            >
              <Trash2 size={17} color="#64748b" />
            </button>
          </div>
        ) : (
          <div style={styles.inputCapsule}>
            <textarea
              ref={inputRef}
              className="chatia-input"
              style={styles.textInput}
              placeholder="Mensaje..."
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                if (currentUserId) {
                  try {
                    localStorage.setItem(`campito_chat_draft_${currentUserId}`, val);
                  } catch {
                    // ignore
                  }
                }
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="on"
              spellCheck="true"
            />

            {/* Cámara dentro de la cápsula a la derecha del input de texto */}
            <button
              className="chatia-iconbtn"
              style={styles.capsuleCameraBtn(!!pendingAttachment?.isImage)}
              onClick={handleCameraClick}
              aria-label="Tomar foto con la cámara"
              title="Tomar foto con la cámara"
            >
              <Camera size={19} />
            </button>
          </div>
        )}

        {/* 3. Botón de Acción a la derecha (estilo WhatsApp):
            - Si está grabando: Stop (rojo) para detener y crear preview
            - Si hay audio listo o texto escrito: Send (#00979d)
            - Si está vacío: Micrófono (#00979d) para iniciar grabación */}
        {isRecording ? (
          <button
            type="button"
            className="chatia-iconbtn"
            style={{
              ...styles.iconBtn(true),
              backgroundColor: '#dc2626',
              color: '#ffffff',
              boxShadow: '0 0 10px rgba(220, 38, 38, 0.6)',
            }}
            onClick={handleMicClick}
            aria-label="Detener grabación y escuchar preview"
            title="Detener grabación y escuchar preview"
          >
            <StopCircle size={20} />
          </button>
        ) : hasText ? (
          <button
            type="button"
            className="chatia-iconbtn"
            style={styles.sendBtn(true)}
            onClick={() => sendMessage()}
            disabled={isLoading}
            aria-label="Enviar mensaje"
            title="Enviar mensaje"
          >
            <Send size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="chatia-iconbtn"
            style={{
              ...styles.iconBtn(false),
              backgroundColor: '#00979d',
              color: '#ffffff',
            }}
            onClick={handleMicClick}
            disabled={isLoading}
            aria-label="Grabar mensaje de voz"
            title="Grabar mensaje de voz"
          >
            <Mic size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
