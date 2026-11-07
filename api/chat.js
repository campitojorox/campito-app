// api/chat.js — Endpoint Chat IA Campito Jorox
// Vercel Serverless Function
// Usa Gemini 2.0 Flash con contexto de Supabase (transacciones y eventos)

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// System prompt especializado para Campito Jorox
const SYSTEM_PROMPT = `Eres el asistente IA de **Campito Jorox**, una finca de explotación agrícola.

Tu función es ayudar con:
- 🌿 **Gestión agrícola**: planificación de cultivos, mantenimiento de la finca, control de plagas, riego, poda, cosecha
- 💰 **Contabilidad y finanzas**: análisis de transacciones, gastos, ingresos, resúmenes económicos
- 📅 **Planificación**: organización de tareas, eventos, temporadas
- 📊 **Análisis de datos**: interpretar los datos de la app, tendencias, estadísticas
- 📝 **Documentación**: ayudar a registrar información sobre la finca
- 🗺️ **Gestión territorial**: orientación sobre mapas, parcelas, zonas de la finca

Cuando tengas datos de transacciones o eventos del contexto, úsalos para dar respuestas precisas y basadas en datos reales.

Responde siempre en **español**, de forma clara, concisa y útil. Puedes usar formato markdown para organizar la información.

Si te muestran una imagen, analízala en detalle relacionándola con el contexto de la finca.

Hoy es: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, includeContext = true } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de mensajes' });
    }

    // Obtener contexto de Supabase si se solicita
    let contextData = '';
    if (includeContext) {
      try {
        // Obtener últimas 50 transacciones
        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .limit(50);

        // Obtener eventos próximos y recientes
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .gte('start_date', thirtyDaysAgo.toISOString().split('T')[0])
          .order('start_date', { ascending: true })
          .limit(30);

        if (transactions && transactions.length > 0) {
          // Calcular resumen financiero
          const ingresos = transactions
            .filter(t => t.type === 'ingreso')
            .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
          const gastos = transactions
            .filter(t => t.type === 'gasto')
            .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

          contextData += `\n\n📊 **DATOS REALES DE LA FINCA** (últimas ${transactions.length} transacciones):\n`;
          contextData += `- Total Ingresos: €${ingresos.toFixed(2)}\n`;
          contextData += `- Total Gastos: €${gastos.toFixed(2)}\n`;
          contextData += `- Balance: €${(ingresos - gastos).toFixed(2)}\n\n`;
          contextData += `**Transacciones recientes:**\n`;
          transactions.slice(0, 15).forEach(t => {
            contextData += `- [${t.date}] ${t.type?.toUpperCase()}: €${t.amount} — ${t.description || t.category || 'Sin descripción'}\n`;
          });
        }

        if (events && events.length > 0) {
          contextData += `\n**Eventos/Tareas:**\n`;
          events.slice(0, 10).forEach(e => {
            contextData += `- [${e.start_date}] ${e.title} ${e.category ? `(${e.category})` : ''}\n`;
          });
        }
      } catch (dbError) {
        console.warn('No se pudo obtener datos de Supabase:', dbError.message);
        // Continúa sin contexto de datos
      }
    }

    // Preparar historial de mensajes para Gemini
    // El último mensaje es el del usuario actual
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    const userInput = lastMessage.content;

    // Crear modelo Gemini
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_PROMPT + (contextData ? contextData : ''),
    });

    // Iniciar chat con historial
    const chat = model.startChat({ history });

    // Enviar mensaje y obtener respuesta
    const result = await chat.sendMessage(userInput);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({
      message: text,
      role: 'assistant',
    });

  } catch (error) {
    console.error('Error en Chat IA:', error);
    return res.status(500).json({
      error: 'Error al procesar tu mensaje',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
