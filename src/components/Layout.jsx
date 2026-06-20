import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Calendar, Euro, BarChart2, Menu as MenuIcon, Search, RefreshCw, Trees, X, User, Mail, Lock } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function Layout({ session }) {
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '' });
  const [isConfirmingDeleteUser, setIsConfirmingDeleteUser] = useState(false);
  const [users, setUsers] = useState([]);
  const [isManagingUser, setIsManagingUser] = useState(false);
  const [manageUserError, setManageUserError] = useState('');
  const [manageUserSuccess, setManageUserSuccess] = useState('');
  
  const currentUser = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0];

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('name');
    if (data) setUsers(data);
  };

  return (
    <div className="app-container">
      {/* Top App Bar mimicking AppSheet */}
      <header className="app-header" style={{ padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button style={{ color: 'white' }} onClick={() => setIsMenuOpen(true)}>
            <MenuIcon size={24} />
          </button>
          <Trees size={32} color="var(--primary)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {location.pathname !== '/historial' && (
            <button style={{ color: 'var(--primary)' }} onClick={() => setIsSearchOpen(true)}>
              <Search size={22} />
            </button>
          )}
        </div>
      </header>

      {/* Sidebar Drawer */}
      {isMenuOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 3000
        }} onClick={() => setIsMenuOpen(false)}>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '250px', height: '100%',
            backgroundColor: 'var(--bg-color)', borderRight: '1px solid var(--border)',
            padding: '2rem 1rem', display: 'flex', flexDirection: 'column',
            boxShadow: '2px 0 8px rgba(0,0,0,0.5)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
                  {currentUser.charAt(0)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentUser}</h3>
                  <small style={{ color: 'var(--text-secondary)' }}>Administrador</small>
                </div>
              </div>
              <button onClick={() => setIsMenuOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.5rem', paddingBottom: '3px' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button onClick={() => { setIsMenuOpen(false); setIsUsersModalOpen(true); }} className="btn btn-secondary" style={{ width: '100%', margin: 0, backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                Gestionar Usuarios
              </button>
            </div>
            
            <div style={{ marginTop: 'auto' }}>
              <button onClick={async () => {
                await supabase.auth.signOut();
                setIsMenuOpen(false);
              }} className="btn btn-secondary" style={{ width: '100%', margin: 0, backgroundColor: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--border)' }}>
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Management Modal */}
      {isUsersModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 4000, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            {isConfirmingDeleteUser && (
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 4100, padding: '1.5rem'
              }}>
                <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', maxWidth: '400px', border: '1px solid var(--danger)' }}>
                  <h4 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.1rem' }}>¿Borrar a este usuario permanentemente?</h4>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => setIsConfirmingDeleteUser(false)} className="btn" style={{ flex: 1, backgroundColor: 'var(--surface)', color: 'white', border: '1px solid var(--border)', margin: 0 }}>Cancelar</button>
                    <button onClick={async () => {
                      setIsManagingUser(true);
                      setManageUserError('');
                      try {
                        const res = await fetch('/api/manage-users', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'DELETE', userId: editingUser.id })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Error al borrar');
                        await fetchUsers();
                        setEditingUser(null);
                        setIsConfirmingDeleteUser(false);
                      } catch (err) {
                        setManageUserError(err.message);
                        setIsConfirmingDeleteUser(false);
                      } finally {
                        setIsManagingUser(false);
                      }
                    }} disabled={isManagingUser} className="btn" style={{ flex: 1, backgroundColor: 'var(--danger)', color: 'white', border: 'none', margin: 0 }}>
                      {isManagingUser ? 'Borrando...' : 'Sí, Borrar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          <div className="card" style={{ width: '100%', maxWidth: '400px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)' }}>{editingUser ? (editingUser.id ? 'Editar Usuario' : 'Nuevo Usuario') : 'Gestionar Usuarios'}</h3>
              <button onClick={() => { setIsUsersModalOpen(false); setEditingUser(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.5rem', paddingBottom: '3px' }}>&times;</button>
            </div>
            
            {manageUserError && (
              <div style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center', fontWeight: 'bold' }}>
                {manageUserError}
              </div>
            )}
            {manageUserSuccess && (
              <div style={{ color: 'var(--success, #10b981)', marginBottom: '1rem', textAlign: 'center', fontWeight: 'bold', padding: '0.5rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px', border: '1px solid var(--success, #10b981)' }}>
                {manageUserSuccess}
              </div>
            )}
            {editingUser ? (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setIsManagingUser(true);
                setManageUserError('');
                setManageUserSuccess('');
                try {
                  const res = await fetch('/api/manage-users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: editingUser.id ? 'UPDATE' : 'CREATE',
                      userId: editingUser.id,
                      userForm
                    })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Error al guardar usuario');
                  
                  await fetchUsers();
                  setManageUserSuccess(editingUser.id ? '¡Usuario actualizado correctamente!' : '¡Usuario creado correctamente!');
                  setTimeout(() => setManageUserSuccess(''), 3000);
                  setEditingUser(null);
                } catch (err) {
                  setManageUserError(err.message);
                } finally {
                  setIsManagingUser(false);
                }
              }}>
                <div className="form-group" style={{ padding: 0 }}>
                  <div className="input-with-icon">
                    <User className="input-icon" size={20} />
                    <input type="text" className="form-input" required value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} placeholder="Nombre" />
                  </div>
                </div>
                <div className="form-group" style={{ padding: 0 }}>
                  <div className="input-with-icon">
                    <Mail className="input-icon" size={20} />
                    <input type="email" className="form-input" required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} placeholder="Email" />
                  </div>
                </div>
                <div className="form-group" style={{ padding: 0 }}>
                  <div className="input-with-icon">
                    <Lock className="input-icon" size={20} />
                    <input type="password" placeholder={editingUser.id ? 'Nueva Contraseña (o dejar vacío)' : 'Contraseña'} className="form-input" required={!editingUser.id} value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setEditingUser(null); setManageUserError(''); }} style={{ flex: 1, margin: 0, backgroundColor: 'var(--surface)', color: 'white' }}>Cancelar</button>
                  <button type="submit" disabled={isManagingUser} className="btn btn-primary" style={{ flex: 1, margin: 0 }}>
                    {isManagingUser ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
                {editingUser.id && (
                  <button type="button" onClick={() => setIsConfirmingDeleteUser(true)} className="btn btn-secondary" style={{ width: '100%', margin: '2rem 0 0 0', backgroundColor: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--border)' }}>Borrar Usuario</button>
                )}
              </form>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => { setEditingUser({}); setUserForm({ name: '', email: '', password: '' }); }} style={{ width: '100%', margin: '0 0 1.5rem 0' }}>Agregar Nuevo Usuario</button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {users.map((u) => (
                    <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{u.name}</span>
                      <button onClick={() => {
                        setEditingUser(u);
                        setUserForm({ name: u.name, email: u.email || '', password: u.password || '' });
                      }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }}>Editar</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isSearchOpen && (
        <div style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Buscar eventos, gastos, etc..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            style={{ flex: 1, padding: '0.75rem', fontSize: '1.3rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
          />
          <button onClick={() => { setSearchQuery(''); setIsSearchOpen(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={24} />
          </button>
        </div>
      )}

      <main className="main-content">
        <Outlet context={{ isSearchOpen, setIsSearchOpen, searchQuery, setSearchQuery, users }} />
      </main>

      {/* Bottom Navigation mimicking AppSheet */}
      <nav className="bottom-nav">
        <NavLink to="/calendario" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Calendar size={32} style={{ display: 'block', margin: '0 auto' }} />
        </NavLink>
        <NavLink to="/gasto-venta" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Euro size={32} style={{ display: 'block', margin: '0 auto' }} />
        </NavLink>
        <NavLink to="/resumen" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <BarChart2 size={32} style={{ display: 'block', margin: '0 auto' }} />
        </NavLink>
      </nav>
    </div>
  );
}
