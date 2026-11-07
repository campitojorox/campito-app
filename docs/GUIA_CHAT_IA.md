# 🌿 Guía Completa del Asistente IA · Campito Jorox

Documento de referencia operativa, privacidad, telemetría satelital y funciones inteligentes del Asistente IA integrado en la aplicación de administración de **Campito Jorox**.

---

## 📑 Índice de Contenidos
1. [🔒 Confidencialidad, Seguridad y Privacidad Blindada](#1--confidencialidad-seguridad-y-privacidad-blindada)
2. [📅 Calendario de Labores y Turnos de Riego en Vivo](#2--calendario-de-labores-y-turnos-de-riego-en-vivo)
3. [💰 Contabilidad, Balances Financieros y Liquidación de Socios](#3--contabilidad-balances-financieros-y-liquidación-de-socios)
4. [✍️ Acciones Directas en la Base de Datos desde el Chat](#4-️-acciones-directas-en-la-base-de-datos-desde-el-chat)
5. [🎙️ Micrófono Unificado y Telemetría GPS Continua](#5-️-micrófono-unificado-y-telemetría-gps-continua)
6. [🧠 Memoria y Aprendizaje Permanente Nativo (Sin Botones)](#6--memoria-y-aprendizaje-permanente-nativo-sin-botones)
7. [📎 Botón '+' Multiformato (PDF, Excel, CSV, Fotos)](#7--botón--multiformato-pdf-excel-csv-fotos)
8. [🗺️ Catastro Satélite, Trazador de Caminos y Exportación](#8-️-catastro-satélite-trazador-de-caminos-y-exportación)
9. [⚡ Conexión Multinivel y Cascada de Modelos (Gemini Pro / Flash)](#9-️-conexión-multinivel-y-cascada-de-modelos-gemini-pro--flash)

---

## 1. 🔒 Confidencialidad, Seguridad y Privacidad Blindada

El Asistente IA de Campito Jorox ha sido diseñado bajo los estándares más estrictos de privacidad de datos para explotaciones agropecuarias familiares y sociedades agrícolas:

- **Circuito Cerrado:** Toda la información procesada (registros contables, turnos de agua, balances de socios, análisis de suelo, mapas y fotos) opera dentro del entorno privado de la finca y no se comparte con redes sociales, terceros ni servicios publicitarios.
- **Sin Entrenamiento Público:** Las interacciones y documentos no se utilizan para entrenar modelos públicos externos.
- **Control Total del Administrador:** Los socios disponen en todo momento de botones de exportación completa (PDF, Excel, KML, GeoJSON) y vaciado o reinicio del historial local.

---

## 2. 📅 Calendario de Labores y Turnos de Riego en Vivo

El Asistente IA está conectado en tiempo real con la tabla de eventos de la finca (`events`). En cada mensaje, se inyectan las labores y turnos programados.

### ¿Qué puedes consultar?
- **Turnos de Riego:** Riegos de la tanda *La Nana* y *El Moro*, horarios exactos (inicio y fin), fechas y encargados asignados.
  > *Ejemplo:* "¿Qué horario tenemos de riego el sábado 14 de noviembre?" o "¿Quién riega la próxima tanda de La Nana?"
- **Labores Agrícolas:** Tratamientos fitosanitarios, abonados, desbroces y recolección.

---

## 3. 💰 Contabilidad, Balances Financieros y Liquidación de Socios

El asistente analiza en vivo los últimos movimientos contables de la tabla `transactions`:
- **Totales Generales:** Suma consolidada de gastos reales, ventas de fruta/cosecha y balance neto acumulado.
- **Liquidaciones de Socios:** Conoce las aportaciones individuales de **Ariel**, **Carlos** y los demás socios, indicando quién debe liquidar o recibir compensaciones.
  > *Ejemplo:* "¿Cuál es el balance actual de gastos e ingresos?" o "¿Cuánto ha aportado Carlos este mes frente a Ariel?"

---

## 4. ✍️ Acciones Directas en la Base de Datos desde el Chat

No necesitas salir del chat para apuntar una tarea o un gasto. El Asistente IA interpreta órdenes en lenguaje natural y las ejecuta en Supabase:

### 1. Creación de Eventos y Turnos de Riego
- Si le dices: *"Crea un turno de riego para este sábado de 08:00 a 11:00 con Carlos en La Nana"*, la IA genera la acción:
  ```json
  [[CREAR_EVENTO: {"title": "Riego La Nana", "date": "2026-11-14", "start_time": "08:00", "end_time": "11:00", "category": "Riego", "responsibles": "Carlos"}]]
  ```
- El evento aparece inmediatamente en el Calendario oficial de la aplicación.

### 2. Creación de Transacciones y Gastos
- Si le dices: *"Apunta un gasto de 65€ en sulfato de cobre comprado por Ariel"*, la IA ejecuta:
  ```json
  [[CREAR_TRANSACCION: {"type": "Gasto", "amount": 65.0, "description": "Sulfato de cobre comprado por Ariel"}]]
  ```
- El saldo de la contabilidad se actualiza en el acto.

---

## 5. 🎙️ Micrófono Unificado y Telemetría GPS Continua

Se ha eliminado la necesidad de alternar entre botones de navegación y de audio: **un único botón de micrófono centralizado** gestiona todas las funciones.

### Funcionamiento de la Telemetría Satelital:
1. **Muestreo Constante:** Mientras el chat está abierto o grabando audio, el sistema muestrea las coordenadas de satélite (`navigator.geolocation.watchPosition` con `enableHighAccuracy: true`).
2. **Track Satelital en Paseos de Voz:** Si caminas por los bancales con el micrófono pulsado, la app registra un punto GPS cada 1.5 segundos vinculándolo al segundero del audio.
3. **Interpolación Temporal Automática:** Si en el segundo 4 dices *"Aquí hay un aguacate Hass vigoroso"* y en el segundo 12 dices *"Y aquí una arqueta de 2 pulgadas"*, la IA calcula las coordenadas exactas de cada elemento a lo largo de tu trayectoria.
4. **Respuesta Transparente:** La IA siempre confirma que recibe tus coordenadas satelitales en tiempo real y puede indicarte tu latitud, longitud y precisión en metros.

---

## 6. 🧠 Memoria y Aprendizaje Permanente Nativo (Sin Botones)

El Asistente IA cuenta con un motor de memoria permanente integrado en la conversación natural:

- **Enseñanza Intuitiva:** Puedes enseñarle reglas, protocolos y datos de la finca sin menús complicados:
  > *Ejemplos:*
  > - *"Recuerda que la electroválvula del sector 3 está averiada y se abre manualmente."*
  > - *"Aprende que la dosis de abonado para los limoneros es de 40g por árbol en brotación."*
  > - *"Toma nota de que el proveedor de tuberías es Riegos Axarquía (teléfono 600...)."*
- **Persistencia Híbrida Blindada:** Cada hecho aprendido se guarda simultáneamente en:
  1. `localStorage` del dispositivo (`campito_farm_knowledge_all`).
  2. La tabla `farm_knowledge` de Supabase para sincronización entre administradores.
- **Consulta de Memoria:** Pregunta cuando quieras: *"¿Qué cosas recuerdas o has aprendido de la finca?"* y te mostrará el listado completo clasificado por categorías (*riego*, *cultivo*, *suelo*, *maquinaria*, *proveedor*).

---

## 7. 📎 Botón '+' Multiformato (PDF, Excel, CSV, Fotos)

El botón circular **`+`** situado a la izquierda del campo de texto permite subir cualquier tipo de documento técnico para alimentar el conocimiento del Asistente:

- **Análisis de Laboratorio:** Sube informes de análisis de suelo, agua de pozo o foliares en formato **PDF**. La IA extraerá los niveles de pH, conductividad eléctrica, nitrógeno, fósforo y potasio, guardando las recomendaciones en la memoria de la finca.
- **Albaranes y Facturas:** Fotografía o sube facturas en JPG/PNG/PDF para extraer importes, conceptos y desgloses de IVA.
- **Hojas de Cálculo:** Sube archivos **Excel (.xlsx, .xls)** o **CSV** con listados de plantas, proveedores o registros históricos.

---

## 8. 🗺️ Catastro Satélite, Trazador de Caminos y Exportación

Campito Jorox incluye un visor satelital interactivo de alta resolución con las parcelas catastrales 195 y 196:

- **Marcadores Diferenciados por Color:**
  - 🥑 Aguacates (Verde esmeralda)
  - 🍋 Cítricos y Limoneros (Amarillo)
  - 💧 Arquetas y Válvulas de Riego (Azul cian)
  - 📍 Mojones y Límites (Rojo coral)
- **Trazador de Caminos y Senderos:** Permite dibujar polilíneas interactivas sobre el satélite, calcular su longitud en metros y guardarlas en la base de datos (`farm_paths`).
- **Descargas Disponibles con 1 Clic:**
  1. **Excel (.xlsx):** Ficha técnica detallada con coordenadas, fecha de registro y observaciones.
  2. **PDF Formal:** Informe de inventario maquetado con membrete de Campito Jorox.
  3. **KML (Google My Maps / Google Earth):** Capa geoespacial para importar en el móvil y visualizar en Google Maps.
  4. **GeoJSON:** Formato estándar GIS para programas de agricultura de precisión (QGIS).

---

## 9. ⚡ Conexión Multinivel y Cascada de Modelos (Gemini Pro / Flash)

El chat cuenta con un sistema inteligente de conmutación de servidores:

| Modelo | Nivel | Propósito Principal |
| :--- | :--- | :--- |
| **Gemini 3.1 Pro** | Pro | Máxima deducción agronómica, diagnósticos complejos y balances |
| **Gemini 3.5 Flash** | High | Alta velocidad, procesamiento multimodal nativo de audio y visión |
| **Gemini 2.5 Flash** | Standard | Respaldo ultrarrápido con amplia cuota de seguridad |
| **Gemini 2.0 Flash** | Respaldo | Conexión garantizada para operaciones básicas |

- **Auto-Fallback Transparente:** Si la cuota de un modelo se satura puntualmente, el sistema desciende en milisegundos al siguiente servidor disponible sin que pierdas tu consulta ni el contexto de la finca.
