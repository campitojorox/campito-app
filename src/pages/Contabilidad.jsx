import { useState } from 'react';
import mockDb from '../data/mockDb.json';
import { Plus } from 'lucide-react';

export default function Contabilidad() {
  const [records, setRecords] = useState(mockDb.contabilidad || []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [type, setType] = useState('Ingreso');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [user, setUser] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    const finalAmount = type === 'Gasto' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
    const newRecord = {
      TransactionID: Math.random().toString(36).substr(2, 9),
      Date: new Date().toISOString().split('T')[0] + " 00:00:00",
      User: user || 'Usuario',
      Category: type,
      Amount: finalAmount,
      Description: description
    };
    
    // Add to state
    setRecords([newRecord, ...records]);
    setIsModalOpen(false);
    // Reset form
    setAmount('');
    setDescription('');
  };

  return (
    <div className="container" style={{ position: 'relative', minHeight: '100%' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Contabilidad</h2>
      </div>

      <div className="card" style={{ padding: '0.5rem', marginBottom: '80px' }}>
        <h3 style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>Historial (Registro)</h3>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {records.map((rec, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid var(--border)' }}>
              <div>
                <strong>{rec.User || 'Usuario'}</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{rec.Date ? rec.Date.split(' ')[0] : ''}</p>
                <small>{rec.Description || rec.Category}</small>
              </div>
              <div style={{ fontWeight: 'bold', color: parseFloat(rec.Amount) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                ${parseFloat(rec.Amount).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Action Button */}
      <button 
        onClick={() => setIsModalOpen(true)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 10px rgba(42, 157, 143, 0.4)',
          zIndex: 100
        }}
      >
        <Plus size={28} />
      </button>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginBottom: '1rem' }}>Nuevo Registro</h3>
            <form onSubmit={handleAdd}>
              <div className="form-group" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="radio" name="type" value="Ingreso" checked={type === 'Ingreso'} onChange={() => setType('Ingreso')} /> Ingreso
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="radio" name="type" value="Gasto" checked={type === 'Gasto'} onChange={() => setType('Gasto')} /> Gasto / Retiro
                </label>
              </div>

              <div className="form-group">
                <label>Monto ($)</label>
                <input type="number" step="0.01" className="form-input" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              
              <div className="form-group">
                <label>Descripción</label>
                <input type="text" className="form-input" required value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Usuario</label>
                <input type="text" className="form-input" placeholder="Nombre" value={user} onChange={(e) => setUser(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
