import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Trees } from 'lucide-react';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg('Credenciales incorrectas. Inténtalo de nuevo.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem',
      backgroundColor: 'var(--bg-color)',
      overflowY: 'auto'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ 
          width: '80px', 
          height: '80px', 
          backgroundColor: 'var(--primary)', 
          borderRadius: '50%', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          margin: '0 auto 1.5rem auto'
        }}>
          <Trees size={40} color="white" />
        </div>
        <h1 style={{ color: 'var(--text-primary)', fontSize: '2rem', marginBottom: '0.5rem' }}>Campito Jorox</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Ingresa para gestionar el calendario y la contabilidad.</p>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: '400px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2rem' }}>
        {errorMsg && (
          <div style={{ backgroundColor: 'rgba(230, 57, 70, 0.1)', color: 'var(--danger)', padding: '1rem', borderRadius: '4px', marginBottom: '1.5rem', textAlign: 'center', border: '1px solid var(--danger)' }}>
            {errorMsg}
          </div>
        )}
        <form onSubmit={handleLogin}>
          <div className="form-group" style={{ padding: 0, marginBottom: '1.5rem' }}>
            <label style={{ color: 'var(--text-primary)' }}>Email</label>
            <input 
              type="email" 
              className="form-input" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>
          <div className="form-group" style={{ padding: 0, marginBottom: '2rem' }}>
            <label style={{ color: 'var(--text-primary)' }}>Contraseña</label>
            <input 
              type="password" 
              className="form-input" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', margin: 0 }}
            disabled={loading}
          >
            {loading ? 'Iniciando sesión...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
