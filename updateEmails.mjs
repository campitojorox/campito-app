import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://byyqdtcuutfnjdlaewsu.supabase.co';
const supabaseServiceKey = 'sb_secret_REDACTED';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const updates = [
  { oldEmail: 'ariel@campito.com', newEmail: 'arielcruzf@gmail.com' },
  { oldEmail: 'jaime@campito.com', newEmail: 'jaimebgallardo@gmail.com' },
  { oldEmail: 'chacho@campito.com', newEmail: '101teamsrc@gmail.com' },
  { oldEmail: 'mauro@campito.com', newEmail: 'marolw@gmail.com' }
];

async function updateEmails() {
  console.log('Obteniendo usuarios...');
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error obteniendo usuarios:', listError);
    return;
  }

  for (const update of updates) {
    const user = list.users.find(u => u.email === update.oldEmail);
    if (!user) {
      console.log(`Usuario con email ${update.oldEmail} no encontrado. Puede que ya esté actualizado.`);
      continue;
    }

    console.log(`Actualizando ${update.oldEmail} a ${update.newEmail}...`);
    
    // Actualizar en Auth
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(user.id, {
      email: update.newEmail,
      email_confirm: true
    });

    if (updateAuthError) {
      console.error(`Error actualizando Auth para ${update.newEmail}:`, updateAuthError.message);
      continue;
    }

    // Actualizar en Profiles
    const { error: updateProfileError } = await supabase.from('profiles').update({ email: update.newEmail }).eq('id', user.id);
    
    if (updateProfileError) {
      console.error(`Error actualizando perfil para ${update.newEmail}:`, updateProfileError.message);
    } else {
      console.log(`✅ ¡Usuario ${update.newEmail} actualizado correctamente!`);
    }
  }
}

updateEmails().catch(console.error);
