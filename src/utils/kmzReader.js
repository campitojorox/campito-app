// src/utils/kmzReader.js
// Lector y extractor ligero y universal de archivos .KMZ en el navegador sin librerías pesadas.
// Un archivo KMZ es un contenedor ZIP que contiene típicamente un archivo "doc.kml" o cualquier archivo con extensión .kml.
// Esta utilidad parsea las cabeceras locales del archivo ZIP (PK\x03\x04) y descomprime el contenido utilizando
// DecompressionStream ('deflate-raw') nativo del navegador o extrayéndolo directamente si no está comprimido (Store).

export async function isKmzFile(file) {
  if (!file) return false;
  const name = file.name ? file.name.toLowerCase() : '';
  if (name.endsWith('.kmz')) return true;
  // También verificar cabecera ZIP mágica "PK\x03\x04"
  try {
    const slice = file.slice ? file.slice(0, 4) : null;
    if (slice) {
      const buffer = await slice.arrayBuffer();
      const view = new DataView(buffer);
      if (view.getUint32(0, true) === 0x04034b50) return true;
    }
  } catch {
    // Si falla la lectura preliminar, guiarse por nombre
  }
  return false;
}

/**
 * Lee un archivo .KMZ (Blob o ArrayBuffer) y extrae el texto XML del archivo KML interno.
 * @param {Blob|File|ArrayBuffer} kmzData
 * @returns {Promise<{ filename: string, kmlText: string }>}
 */
export async function extractKmlFromKmz(kmzData) {
  let arrayBuffer;
  if (kmzData instanceof ArrayBuffer) {
    arrayBuffer = kmzData;
  } else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(kmzData)) {
    arrayBuffer = kmzData.buffer.slice(kmzData.byteOffset, kmzData.byteOffset + kmzData.byteLength);
  } else if (kmzData && typeof kmzData.arrayBuffer === 'function') {
    arrayBuffer = await kmzData.arrayBuffer();
  } else {
    throw new Error('Formato KMZ inválido: se esperaba un Blob, File o ArrayBuffer.');
  }

  const uint8 = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  let offset = 0;
  const filesFound = [];

  // Recorrer las cabeceras locales de archivo ZIP (Firma 0x04034b50)
  while (offset + 30 <= uint8.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      // Si no es firma de cabecera local, buscar siguiente o terminar
      break;
    }

    // const versionNeeded = view.getUint16(offset + 4, true);
    // const flags = view.getUint16(offset + 6, true);
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);

    const fileNameBytes = uint8.subarray(offset + 30, offset + 30 + fileNameLength);
    const fileName = new TextDecoder('utf-8').decode(fileNameBytes);

    const dataStart = offset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd <= uint8.length) {
      const compressedData = uint8.subarray(dataStart, dataEnd);
      filesFound.push({
        fileName,
        compressionMethod,
        compressedData,
        uncompressedSize,
      });
    }

    // Avanzar al siguiente archivo
    offset = dataEnd;
  }

  if (filesFound.length === 0) {
    throw new Error('El archivo KMZ no contiene archivos reconocibles o está dañado.');
  }

  // Localizar archivo .kml preferente (priorizar 'doc.kml')
  const kmlEntry =
    filesFound.find((f) => f.fileName.toLowerCase() === 'doc.kml') ||
    filesFound.find((f) => f.fileName.toLowerCase().endsWith('.kml')) ||
    filesFound[0];

  if (!kmlEntry || !kmlEntry.fileName.toLowerCase().endsWith('.kml')) {
    throw new Error('No se encontró ningún archivo .kml dentro del paquete KMZ.');
  }

  let decompressedBytes;
  if (kmlEntry.compressionMethod === 0) {
    // Método 0: Sin compresión (Store)
    decompressedBytes = kmlEntry.compressedData;
  } else if (kmlEntry.compressionMethod === 8) {
    // Método 8: Deflate estándar de ZIP -> Descomprimir con DecompressionStream('deflate-raw')
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Tu navegador no soporta DecompressionStream nativo para descomprimir KMZ.');
    }
    const stream = new Blob([kmlEntry.compressedData]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
    const response = new Response(decompressedStream);
    decompressedBytes = new Uint8Array(await response.arrayBuffer());
  } else {
    throw new Error(`Método de compresión ZIP no soportado (${kmlEntry.compressionMethod}).`);
  }

  const kmlText = new TextDecoder('utf-8').decode(decompressedBytes);
  return {
    filename: kmlEntry.fileName,
    kmlText,
  };
}
