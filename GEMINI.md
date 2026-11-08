# Reglas del Proyecto — Campito Jorox

## 1. Verificación Inicial de Conexiones y Servicios (OBLIGATORIO)
- Al iniciar cualquier interacción o sesión de trabajo, el asistente DEBE consultar como **primer archivo prioritario**:
  `[CONEXIONES_LOCAL.md](file:///Users/ARICF/Documents/CAMPITO%20JOROX/APP%20ADMINISTRACION/CONEXIONES_LOCAL.md)`
- Dicho archivo contiene de forma centralizada todas las claves, tokens, endpoints, credenciales y accesos de los servicios asociados a la aplicación (GitHub, Supabase, Vercel, Google Gemini AI y usuarios).
- Utilizar de forma automática y transparente estos datos para conectar, probar o configurar cualquier servicio requerido sin necesidad de volver a solicitar credenciales al usuario.

## 2. Control de Versiones y Despliegues en la Nube
- **NO actualizar Git ni la nube automáticamente**:
  - Queda estrictamente prohibido ejecutar `git push`, desplegar o sincronizar con la nube (Vercel, Supabase remotos, storage externo, etc.) sin autorización explícita.
  - Únicamente se realizarán acciones de subida o actualización remota si el usuario lo solicita explícitamente con las palabras clave **`GIT PUSH`** o **`UPLOAD`**.
  - Todos los cambios, compilaciones, pruebas y ejecuciones deben mantenerse estrictamente en el entorno local.
