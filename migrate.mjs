import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = 'https://byyqdtcuutfnjdlaewsu.supabase.co';
const supabaseServiceKey = 'sb_secret_REDACTED'; // SECRET KEY para bypass RLS y Admin Auth

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function migrate() {
  console.log('Iniciando migración...');
  const mockData = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/data/mockDb.json'), 'utf8'));
  
  // 1. Encontrar todos los nombres de usuarios únicos en Contabilidad y Calendario
  const userNames = new Set();
  
  mockData.contabilidad.forEach(tx => {
    if (tx.User) userNames.add(tx.User);
  });
  
  mockData.calendario.forEach(ev => {
    if (ev.Responsible && ev.Responsible !== 'Todos') userNames.add(ev.Responsible);
  });
  
  console.log('Usuarios a migrar:', Array.from(userNames));

  const userIdMap = {};

  // 2. Crear los usuarios en Auth (si no existen) y obtener su UUID
  for (const name of userNames) {
    const email = `${name.toLowerCase().replace(/\\s+/g, '')}@campito.com`;
    const password = 'campito2026';
    
    // Crear usuario en Auth
    const { data: userAuth, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { name: name }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log(`El usuario ${name} (${email}) ya existe, intentando recuperarlo...`);
        // Obtener la lista de usuarios para encontrar el ID
        const { data: list, error: listError } = await supabase.auth.admin.listUsers();
        if (list && list.users) {
           const existing = list.users.find(u => u.email === email);
           if (existing) userIdMap[name] = existing.id;
        }
      } else {
        console.error(`Error creando usuario ${name}:`, authError.message);
      }
    } else {
      console.log(`Usuario creado: ${name} (${email}) -> UUID: ${userAuth.user.id}`);
      userIdMap[name] = userAuth.user.id;
    }
  }

  // 3. Migrar Eventos (Calendario)
  console.log('\\nMigrando Eventos...');
  const eventsToInsert = mockData.calendario.map(ev => {
    return {
      date: ev.Date,
      start_time: ev["Start Time"] || null,
      end_time: ev["End Time"] || null,
      responsible_id: (ev.Responsible && ev.Responsible !== 'Todos' && userIdMap[ev.Responsible]) ? userIdMap[ev.Responsible] : null,
      category: ev.Category,
      info: ev.Info || null
    };
  });

  if (eventsToInsert.length > 0) {
    const { error: evError } = await supabase.from('events').insert(eventsToInsert);
    if (evError) console.error('Error insertando eventos:', evError.message);
    else console.log(`✅ ${eventsToInsert.length} Eventos insertados`);
  }

  // 4. Migrar Transacciones (Contabilidad)
  console.log('\\nMigrando Transacciones...');
  const txsToInsert = mockData.contabilidad.map(tx => {
    return {
      date: tx.Date,
      user_id: (tx.User && userIdMap[tx.User]) ? userIdMap[tx.User] : null,
      type: tx.Category, // 'Gasto' o 'Retiro'
      amount: tx.Amount,
      description: tx.Description || null,
      image_url: tx.Imagen || null
    };
  });

  if (txsToInsert.length > 0) {
    const { error: txError } = await supabase.from('transactions').insert(txsToInsert);
    if (txError) console.error('Error insertando transacciones:', txError.message);
    else console.log(`✅ ${txsToInsert.length} Transacciones insertadas`);
  }

  console.log('\\n🎉 Migración completada!');
  console.log('--- Credenciales por defecto para iniciar sesión ---');
  for (const name of userNames) {
    console.log(`Usuario: ${name} | Email: ${name.toLowerCase().replace(/\\s+/g, '')}@campito.com | Clave: campito2026`);
  }
}

migrate().catch(console.error);
