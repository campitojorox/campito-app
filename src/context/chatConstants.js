// src/context/chatConstants.js
import { GEMINI_SERVERS } from '../services/geminiDirectClient';

export function stripLegacyGpsTag(text) {
  return (text || '').replace(/\s*\[GPS:\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\]$/i, '');
}

export const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! Soy el **Cerebro IA Unificado** de **Campito Jorox** 🌿\n\nTengo acceso completo en tiempo real y puedo ayudarte con:\n- 🗺️ **Catastro y Caminos:** Consultar o modificar trazados de pistas, mangueras, aguacates y arquetas de la sección Mapas.\n- 📐 **Planos Técnicos y Esquemas:** Dibujos vectoriales acotados (SVG) y diagramas hidráulicos (Mermaid) con descarga e impresión.\n- 👁️ **Fotos y Documentos:** Diagnóstico de plagas en hojas, OCR de facturas de abono o lectura de contadores de agua.\n- 📅 **Calendario y Riego:** Consultar y agendar turnos en La Nana o El Moro.\n- 💰 **Finanzas y Gastos:** Balances, gastos, ventas y liquidaciones.\n- 🛠️ **Crear Nuevas Herramientas:** Pídeme inventar herramientas dinámicas para el equipo.\n\n¿En qué te puedo ayudar hoy?',
  serverUsed: GEMINI_SERVERS.find((s) => s.id === 'gemini-2.5-flash') || GEMINI_SERVERS[0],
};
