import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Allow CORS for local dev / testing
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, userId, userForm } = req.body;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return res.status(500).json({ error: 'Faltan credenciales de servidor (SUPABASE_SERVICE_ROLE_KEY).' });
  }

  // Initialize Supabase admin client
  const supabaseAdmin = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    if (action === 'CREATE') {
      // 1. Create the user in Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: userForm.email,
        password: userForm.password,
        email_confirm: true,
        user_metadata: { name: userForm.name }
      });
      
      if (authError) throw authError;

      // 2. Add to public.profiles table
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: authData.user.id,
        name: userForm.name,
        email: userForm.email
      });

      if (profileError) {
        console.warn('Profile creation error:', profileError);
        // Supabase often creates the profile automatically via triggers if configured, so we just warn
      }

      return res.status(200).json({ success: true, user: authData.user });
    }

    if (action === 'UPDATE') {
      if (!userId) throw new Error('Missing userId for update');
      
      // Update Auth fields
      const updates = {};
      if (userForm.email) updates.email = userForm.email;
      if (userForm.password) updates.password = userForm.password;
      if (userForm.name) updates.user_metadata = { name: userForm.name };

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, updates);
      if (authError) throw authError;

      // Update public.profiles
      const { error: profileError } = await supabaseAdmin.from('profiles').update({
        name: userForm.name,
        email: userForm.email
      }).eq('id', userId);
      
      if (profileError) throw profileError;

      return res.status(200).json({ success: true, user: authData.user });
    }

    if (action === 'DELETE') {
      if (!userId) throw new Error('Missing userId for delete');
      
      // Delete from Auth (this usually cascades to public.profiles if foreign keys are set)
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) throw authError;

      // Ensure profile is deleted just in case
      await supabaseAdmin.from('profiles').delete().eq('id', userId);

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Error in manage-users:', err);
    return res.status(500).json({ error: err.message });
  }
}
