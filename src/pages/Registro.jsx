import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function Registro() {
  const [records, setRecords] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', desc: '', user: '', type: '', image: null, currentImage: null });
  const [expandedImage, setExpandedImage] = useState(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { users } = useOutletContext();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: txData } = await supabase.from('transactions').select('*, profiles(name)');
    if (txData) {
      setRecords(txData.map(tx => ({
        TransactionID: tx.id,
        Date: tx.date.split('T')[0] + " 00:00:00",
        User: tx.profiles ? tx.profiles.name : 'Desconocido',
        Category: tx.type,
        Value: Math.abs(tx.amount),
        Amount: tx.amount,
        Description: tx.description,
        Imagen: tx.image_url
      })));
    }

    const { data: evData } = await supabase.from('events').select('*, profiles(name)');
    if (evData) {
      setCalendarEvents(evData.map(ev => ({
        Responsible: ev.profiles ? ev.profiles.name : 'Todos',
        Category: ev.category
      })));
    }
  };

  // Calcular Finanzas
  const financesTmp = users.map(u => {
    const userRecords = records.filter(r => r.User === u.name);
    const balance = userRecords.reduce((acc, r) => acc + parseFloat(r.Amount || 0), 0);
    return { user: u.name, balance };
  });

  const maxBalance = Math.max(...financesTmp.map(f => f.balance));

  const finances = financesTmp.map(f => ({
    user: f.user,
    balance: f.balance,
    diferencia: f.balance - maxBalance
  }));

  // Calcular Estadisticas (Filtrando a 'Campito')
  const stats = users.filter(u => u.name !== 'Campito').map(u => {
    const userEvents = calendarEvents.filter(e => e.Responsible === u.name);
    const riego = userEvents.filter(e => e.Category === 'RIEGO').length;
    const mantenimiento = userEvents.filter(e => e.Category === 'MANTENIMIENTO').length;
    const encuentro = userEvents.filter(e => e.Category === 'ENCUENTRO').length;
    return { user: u.name, riego, mantenimiento, encuentro };
  });

  const formatCurrency = (val) => {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' });
    return formatter.format(val);
  };

  // Sort records newest first
  const sortedRecords = [...records].sort((a, b) => new Date(b.Date) - new Date(a.Date));

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <h2 className="section-title" style={{ marginTop: '2rem' }}>Finanzas</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Diferencia</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {finances.map((f, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--text-primary)' }}>{f.user}</td>
              <td style={{ color: f.diferencia < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {formatCurrency(f.diferencia)}
              </td>
              <td style={{ color: f.balance < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {formatCurrency(f.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-title" style={{ marginTop: '2.5rem' }}>Estadisticas Calendario</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Riego</th>
              <th>Mantenimiento</th>
              <th>Encuentro</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-primary)' }}>{s.user}</td>
                <td>{s.riego}</td>
                <td>{s.mantenimiento}</td>
                <td>{s.encuentro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title" style={{ marginTop: '2.5rem' }}>Transacciones</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>Fecha ↓</th>
              <th>Usuario</th>
              <th>Cantidad</th>
              <th>Cat.</th>
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((r, i) => (
              <tr 
                key={r.TransactionID || i} 
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedRecord(r);
                  setEditForm({ amount: Math.abs(r.Amount), desc: r.Description || '', user: r.User || '', type: r.Category || 'Gasto', image: null, currentImage: r.Imagen || null });
                  setIsConfirmingDelete(false);
                }}
              >
                <td>{r.Date ? r.Date.split(' ')[0] : ''}</td>
                <td>{r.User}</td>
                <td style={{ color: r.Amount < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                  {formatCurrency(r.Amount)}
                </td>
                <td>{r.Category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, overflowY: 'auto', padding: '1rem'
        }}>
          <div className="card" style={{ position: 'relative', width: '100%', maxWidth: '400px', margin: '2rem auto', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem' }}>
            
            {/* Custom Confirm Delete Overlay */}
            {isConfirmingDelete && (
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, borderRadius: '8px', padding: '1.5rem'
              }}>
                <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', border: '1px solid var(--danger)' }}>
                  <h4 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.1rem' }}>¿Seguro que deseas borrar permanentemente esta transacción?</h4>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => setIsConfirmingDelete(false)} className="btn" style={{ flex: 1, backgroundColor: 'var(--surface)', color: 'white', border: '1px solid var(--border)', margin: 0 }}>Cancelar</button>
                    <button onClick={async () => {
                      await supabase.from('transactions').delete().eq('id', selectedRecord.TransactionID);
                      fetchData();
                      setSelectedRecord(null);
                      setIsConfirmingDelete(false);
                    }} className="btn" style={{ flex: 1, backgroundColor: 'var(--danger)', color: 'white', border: 'none', margin: 0 }}>Sí, Borrar</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)' }}>Editar Transacción</h3>
            </div>
            
            <div style={{ color: 'var(--text-primary)' }}>
              <div className="form-group" style={{ padding: 0, marginBottom: '1rem' }}>
                <label>Tipo</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button type="button" onClick={() => setEditForm({...editForm, type: 'Gasto'})} style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '4px', backgroundColor: editForm.type === 'Gasto' ? 'var(--primary)' : 'var(--surface)', color: editForm.type === 'Gasto' ? 'white' : 'var(--text-primary)', cursor: 'pointer' }}>Gasto (invertido)</button>
                  <button type="button" onClick={() => setEditForm({...editForm, type: 'Retiro'})} style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '4px', backgroundColor: editForm.type === 'Retiro' ? 'var(--primary)' : 'var(--surface)', color: editForm.type === 'Retiro' ? 'white' : 'var(--text-primary)', cursor: 'pointer' }}>Venta (Generado)</button>
                </div>
              </div>
              <div className="form-group" style={{ padding: 0 }}>
                <label>Cantidad / Monto</label>
                <input type="number" step="0.01" className="form-input" value={editForm.amount} onChange={(e) => setEditForm({...editForm, amount: e.target.value})} />
              </div>
              <div className="form-group" style={{ padding: 0 }}>
                <label>Descripción / Concepto</label>
                <input type="text" className="form-input" value={editForm.desc} onChange={(e) => setEditForm({...editForm, desc: e.target.value})} />
              </div>
              <div className="form-group" style={{ padding: 0 }}>
                <label>Usuario Responsable</label>
                <select className="form-input" value={editForm.user} onChange={(e) => setEditForm({...editForm, user: e.target.value})}>
                  {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ padding: 0, marginTop: '1rem' }}>
                <label>Comprobante / Foto</label>
                
                {editForm.currentImage || editForm.image ? (
                  <div style={{ position: 'relative', display: 'inline-block', width: '100%', textAlign: 'center' }}>
                    <img 
                      src={editForm.image ? URL.createObjectURL(editForm.image) : `/${editForm.currentImage}`} 
                      alt="Comprobante actual" 
                      onClick={() => setExpandedImage(editForm.image ? URL.createObjectURL(editForm.image) : `/${editForm.currentImage}`)}
                      style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)', cursor: 'pointer' }} 
                    />
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditForm({...editForm, currentImage: null, image: null}); }}
                      style={{
                        position: 'absolute', top: '10px', right: '10px', width: '36px', height: '36px', borderRadius: '50%',
                        backgroundColor: 'var(--danger)', color: 'white', border: '1px solid var(--border)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                        paddingBottom: '3px'
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '2rem', border: '2px dashed var(--border)', borderRadius: '8px',
                    backgroundColor: 'var(--surface)', cursor: 'pointer', color: 'var(--text-secondary)'
                  }}>
                    <Camera size={32} style={{ marginBottom: '0.5rem' }} />
                    <span>Subir comprobante</span>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setEditForm({...editForm, image: e.target.files[0]})} />
                  </label>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button onClick={async () => {
                  const finalAmount = editForm.type === 'Retiro' ? -Math.abs(parseFloat(editForm.amount)) : Math.abs(parseFloat(editForm.amount));
                  
                  let imageUrl = editForm.currentImage;
                  if (editForm.image) {
                    const fileExt = editForm.image.name.split('.').pop();
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const { data, error } = await supabase.storage.from('comprobantes').upload(fileName, editForm.image);
                    if (!error) {
                      const { data: publicData } = supabase.storage.from('comprobantes').getPublicUrl(fileName);
                      imageUrl = publicData.publicUrl;
                    }
                  }

                  const respUser = users.find(u => u.name === editForm.user);
                  const userId = respUser ? respUser.id : null;

                  await supabase.from('transactions').update({
                    amount: finalAmount,
                    type: editForm.type,
                    description: editForm.desc,
                    user_id: userId,
                    image_url: imageUrl
                  }).eq('id', selectedRecord.TransactionID);

                  fetchData();
                  setSelectedRecord(null);
                }} className="btn btn-primary" style={{ flex: 1, margin: 0, padding: '0.75rem 0' }}>Cerrar / Guardar</button>
                <button onClick={() => setIsConfirmingDelete(true)} className="btn" style={{ flex: 1, margin: 0, padding: '0.75rem 0', backgroundColor: 'var(--danger)', color: 'white' }}>Borrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {expandedImage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '1rem'
        }} onClick={() => setExpandedImage(null)}>
          <button style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'white', fontSize: '3rem', cursor: 'pointer' }}>&times;</button>
          <img src={expandedImage} alt="Expanded" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  );
}
