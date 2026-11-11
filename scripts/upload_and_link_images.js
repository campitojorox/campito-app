import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://byyqdtcuutfnjdlaewsu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'PEGAR_AQUI_SUPABASE_SERVICE_ROLE_KEY';
const BUCKET_NAME = 'comprobantes';
const IMAGES_DIR = '/tmp/CONTABILIDAD_Images';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('--- 1. LEYENDO ARCHIVOS LOCALES ---');
  if (!fs.existsSync(IMAGES_DIR)) {
    throw new Error(`Directorio no existe: ${IMAGES_DIR}`);
  }
  const files = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));
  console.log(`Encontrados ${files.length} archivos para subir:`);
  files.forEach(f => console.log(' -', f));

  console.log('\n--- 2. SUBIENDO A SUPABASE STORAGE (bucket: comprobantes) ---');
  const uploadedUrls = {};

  for (const file of files) {
    const filePath = path.join(IMAGES_DIR, file);
    const fileBuffer = fs.readFileSync(filePath);
    
    // Subir a Supabase Storage con upsert: true para no fallar si ya existe
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(file, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) {
      console.error(`❌ Error al subir ${file}:`, error.message);
      continue;
    }

    const { data: publicData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(file);

    uploadedUrls[file] = publicData.publicUrl;
    console.log(`✅ Subido: ${file} -> ${publicData.publicUrl}`);
  }

  console.log('\n--- 3. ACTUALIZANDO TRANSACCIONES EN BASE DE DATOS ---');
  // Obtener todas las transacciones
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('id, date, description, amount, image_url');

  if (txError) {
    throw new Error('Error al obtener transacciones: ' + txError.message);
  }

  console.log(`Total transacciones en base de datos: ${transactions.length}`);

  let updatedCount = 0;

  for (const tx of transactions) {
    let matchedFile = null;

    // Caso A: La transacción ya tiene un string tipo "CONTABILIDAD_Images/fe272d1a.Imagen.125712.jpg"
    if (tx.image_url && tx.image_url.includes('CONTABILIDAD_Images/')) {
      const parts = tx.image_url.split('/');
      const rawName = parts[parts.length - 1];
      if (uploadedUrls[rawName]) {
        matchedFile = rawName;
      }
    }

    // Caso B: Si no tiene imagen pero coincide con los registros históricos conocidos de 21/03/2026
    if (!matchedFile && !tx.image_url) {
      if (tx.description === 'Contabilidad 21/03/2026' && tx.amount === 21645.47 && uploadedUrls['829cd6c6.Imagen.201635.jpg']) {
        matchedFile = '829cd6c6.Imagen.201635.jpg';
      } else if (tx.description === 'Contabilidad 21/03/26' && tx.amount === 22193.14 && uploadedUrls['2f8ebdb8.Imagen.201645.jpg']) {
        matchedFile = '2f8ebdb8.Imagen.201645.jpg';
      } else if (tx.description === 'Contabilidad actualizada 21/03/26' && tx.amount === 21731.07 && uploadedUrls['ca1a12b9.Imagen.201653.jpg']) {
        matchedFile = 'ca1a12b9.Imagen.201653.jpg';
      }
    }

    if (matchedFile) {
      const newUrl = uploadedUrls[matchedFile];
      console.log(`Actualizando tx ${tx.id} (${tx.description}):`);
      console.log(`  Antes:  ${tx.image_url}`);
      console.log(`  Ahora:  ${newUrl}`);

      const { error: updateError } = await supabase
        .from('transactions')
        .update({ image_url: newUrl })
        .eq('id', tx.id);

      if (updateError) {
        console.error(`  ❌ Error al actualizar tx ${tx.id}:`, updateError.message);
      } else {
        console.log(`  ✅ Actualizada con éxito!`);
        updatedCount++;
      }
    }
  }

  console.log(`\n🎉 Proceso completado. ${updatedCount} transacciones vinculadas a sus permalinks de Supabase.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
