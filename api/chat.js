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

🔒 **CONFIDENCIALIDAD ESTRICTA (ENTORNO PRIVADO Y CERRADO)**:
- Toda la información subida a este chat (textos, documentos, imágenes, audios, fotos de plagas, facturas, transacciones y contabilidad) es ESTRICTAMENTE CONFIDENCIAL de Campito Jorox.
- Se permite la importación y análisis interno de información para la gestión de la finca, pero NUNCA su exportación, divulgación o compartición con servidores o entidades externas.
- Toda la información permanece bajo custodia exclusiva de los administradores de Campito Jorox.

🧠 **MÓDULO DE APRENDIZAJE Y MEMORIA PERMANENTE DE LA FINCA**:
- Cuentas con memoria permanente conectada a la base de datos de la finca ('farm_knowledge'). Todo lo que aprendas aquí lo recordarás en futuras sesiones.
- Si en el contexto ves una sección "MEMORIA Y APRENDIZAJE ACUMULADO DE LA FINCA", consulta y aplica rigurosamente esas reglas, parcelas, tipos de cultivo, calendarios de riego, maquinaria o proveedores que los administradores te hayan enseñado.
- Cuando el usuario te pida recordar o aprender un dato (por ejemplo: "recuerda que...", "aprende que...", "guarda este dato...", "anota que...", "toma nota de..."), o cuando te comunique una regla operativa o dato clave de la finca:
  1. Confirma claramente que lo has aprendido y que queda guardado en la memoria permanente de Campito Jorox.
  2. Incluye al final de tu respuesta el comando estructurado:
     [[MEMORIA: {"category": "cultivo|riego|parcela|maquinaria|suelo|general|proveedor|protocolo|plaga", "title": "Título descriptivo breve", "content": "Detalle completo del conocimiento o regla aprendido"}]]
- Si el usuario te pregunta qué cosas sabes o recuerdas de la finca, lístale de forma ordenada y concisa todo el conocimiento que tienes registrado en tu memoria.

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
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [{ data: transactions }, { data: events }, { data: knowledge }] = await Promise.all([
          supabase
            .from('transactions')
            .select('*')
            .order('date', { ascending: false })
            .limit(50),
          supabase
            .from('events')
            .select('*')
            .gte('start_date', thirtyDaysAgo.toISOString().split('T')[0])
            .order('start_date', { ascending: true })
            .limit(30),
          supabase
            .from('farm_knowledge')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
        ]);

        if (knowledge && knowledge.length > 0) {
          contextData += `\n\n🧠 **MEMORIA Y APRENDIZAJE ACUMULADO DE LA FINCA** (${knowledge.length} hechos/reglas):\n`;
          knowledge.forEach(k => {
            contextData += `- [${(k.category || 'general').toUpperCase()}] ${k.title}: ${k.content}\n`;
          });
        }

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

    // Modelos en orden de fallback (de más potente a menos potente)
    const modelsToTry = [
      'gemini-3.1-pro-preview',
      'gemini-2.5-pro',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite',
    ];
    let text = null;
    let modelUsed = null;
    let lastErr = null;

    for (const mName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: mName,
          systemInstruction: SYSTEM_PROMPT + (contextData ? contextData : ''),
        });
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(userInput);
        const response = await result.response;
        text = response.text();
        modelUsed = mName;
        break;
      } catch (mErr) {
        console.warn(`[api/chat] Falló ${mName}:`, mErr.message);
        lastErr = mErr;
      }
    }

    if (!text) {
      throw lastErr || new Error('No se pudo obtener respuesta de ningún modelo de Gemini');
    }

    return res.status(200).json({
      message: text,
      role: 'assistant',
      modelUsed,
    });

  } catch (error) {
    console.error('Error en Chat IA:', error);
    return res.status(500).json({
      error: 'Error al procesar tu mensaje',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

