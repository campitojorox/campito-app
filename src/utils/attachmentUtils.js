// src/utils/attachmentUtils.js
// Utilidades compartidas para leer, normalizar y enviar múltiples archivos adjuntos de distintos tipos en Chat IA.

export const ACCEPTED_CHAT_FILE_TYPES =
  '.pdf,.csv,.xlsx,.xls,.doc,.docx,.txt,.md,.json,.geojson,.kml,.kmz,.xml,image/*,text/*,application/pdf';

const TEXT_EXTENSIONS = ['.txt', '.csv', '.json', '.geojson', '.kml', '.md', '.xml'];
const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export function readFileAsAttachment(file, { forceImage = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    const name = file.name || (forceImage ? `foto-${Date.now()}.jpg` : `archivo-${Date.now()}`);
    const nameLower = name.toLowerCase();
    const isImg = forceImage || (file.type && file.type.startsWith('image/'));
    const isPdf = !forceImage && (file.type === 'application/pdf' || nameLower.endsWith('.pdf'));
    const isSpreadsheet = !forceImage && SPREADSHEET_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
    const isText =
      !forceImage &&
      ((file.type && file.type.startsWith('text/')) ||
        TEXT_EXTENSIONS.some((ext) => nameLower.endsWith(ext)));

    const reader = new FileReader();
    reader.onload = (ev) => {
      resolve({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        file,
        name,
        size: file.size || 0,
        type:
          file.type ||
          (isImg
            ? 'image/jpeg'
            : isText
              ? 'text/plain'
              : isPdf
                ? 'application/pdf'
                : 'application/octet-stream'),
        textContent: isText ? ev.target.result : null,
        dataUrl: isText ? null : ev.target.result,
        isImage: !isText && Boolean(isImg),
        isPdf: !isText && Boolean(isPdf),
        isSpreadsheet: Boolean(isSpreadsheet),
        isText: Boolean(isText),
      });
    };
    reader.onerror = () => reject(reader.error || new Error(`No se pudo leer ${name}`));

    if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

export async function readFilesAsAttachments(fileList, options = {}) {
  const files = Array.from(fileList || []).filter(Boolean);
  if (files.length === 0) return [];
  const results = await Promise.all(files.map((file) => readFileAsAttachment(file, options)));
  return results.filter(Boolean);
}

export function normalizeAttachments(attachments, singleAttachment = null) {
  const list = [];
  if (Array.isArray(attachments)) {
    for (const item of attachments) {
      if (item) list.push(item);
    }
  }
  if (singleAttachment && !list.includes(singleAttachment)) {
    if (list.length === 0) list.push(singleAttachment);
  }
  return list;
}

export function appendAttachmentsToGeminiParts(userParts, attachmentsList = []) {
  for (const att of attachmentsList) {
    if (!att) continue;
    if (att.textContent) {
      userParts.push({
        text: `\n\n📄 **CONTENIDO DEL ARCHIVO ADJUNTO ("${att.name || 'documento'}")**:\n\`\`\`\n${att.textContent}\n\`\`\`\n`,
      });
      continue;
    }

    if (att.dataUrl) {
      const match = att.dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
      if (match) {
        const cleanMime = match[1].toLowerCase().trim();
        if (cleanMime.startsWith('image/') || cleanMime === 'application/pdf') {
          userParts.push({
            inlineData: {
              mimeType: cleanMime,
              data: match[2],
            },
          });
          continue;
        }
      }
      userParts.push({
        text: `\n\n📎 Archivo adjunto: "${att.name || 'documento'}" (${att.type || 'archivo binario'}).`,
      });
    }
  }
}

