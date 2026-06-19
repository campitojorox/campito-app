import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { supabase } from '../supabaseClient';export default function GastoRetiro() {
  const { users } = useOutletContext();
  const [type, setType] = useState('Gasto');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [user, setUser] = useState('');
  const [image, setImage] = useState(null);

  const [loading, setLoading] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const respUser = users.find(u => u.name === user);
    const userId = respUser ? respUser.id : null;

    let imageUrl = null;
    if (image) {
      const fileExt = image.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { data, error } = await supabase.storage.from('comprobantes').upload(fileName, image);
      if (!error) {
        const { data: publicData } = supabase.storage.from('comprobantes').getPublicUrl(fileName);
        imageUrl = publicData.publicUrl;
      }
    }

    const finalAmount = type === 'Retiro' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
    
    const { error } = await supabase.from('transactions').insert([{
      date: new Date().toISOString(),
      user_id: userId,
      type: type,
      amount: finalAmount,
      description: description || null,
      image_url: imageUrl
    }]);

    if (!error) {
      alert('Transacción guardada en la nube');
      setAmount('');
      setDescription('');
      setUser('');
      setImage(null);
    } else {
      alert('Error guardando transacción: ' + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="container" style={{ padding: '1rem' }}>
      <h2 style={{ marginTop: '2rem', marginBottom: '1.5rem', fontSize: '1.5rem', color: 'var(--primary)', fontWeight: 'bold' }}>Agregar Gasto / Venta</h2>
      
      <div style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleAdd}>
          <div className="form-group" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <button 
              type="button"
              onClick={() => setType('Gasto')}
              style={{
                flex: 1,
                padding: '0.8rem',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: type === 'Gasto' ? 'var(--primary)' : 'var(--surface)',
                color: type === 'Gasto' ? 'white' : 'var(--text-primary)',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Gasto (invertido)
            </button>
            <button 
              type="button"
              onClick={() => setType('Retiro')}
              style={{
                flex: 1,
                padding: '0.8rem',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: type === 'Retiro' ? 'var(--primary)' : 'var(--surface)',
                color: type === 'Retiro' ? 'white' : 'var(--text-primary)',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Venta (Generado)
            </button>
          </div>

          <div className="form-group" style={{ padding: 0 }}>
            <label>Cantidad / Monto</label>
            <input type="number" step="0.01" className="form-input" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          
          <div className="form-group" style={{ padding: 0 }}>
            <label>Descripción / Concepto</label>
            <input type="text" className="form-input" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="form-group" style={{ padding: 0 }}>
            <label>Usuario Responsable</label>
            <select className="form-input" required value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="" disabled>Seleccione un usuario</option>
              {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ padding: 0, marginTop: '1rem' }}>
            <label>Comprobante / Foto</label>
            <label style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: image ? '0' : '2rem',
              border: '2px dashed var(--border)',
              borderRadius: '8px',
              backgroundColor: 'var(--surface)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              overflow: 'hidden'
            }}>
              {image ? (
                <div style={{ position: 'relative', width: '100%' }}>
                  <img src={URL.createObjectURL(image)} alt="Preview" style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block', borderRadius: '8px' }} />
                  <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImage(null); }}
                    style={{
                      position: 'absolute', top: '10px', right: '10px', width: '36px', height: '36px', borderRadius: '50%',
                      backgroundColor: 'var(--danger)', color: 'white', border: '1px solid var(--border)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                      paddingBottom: '3px', zIndex: 10
                    }}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <>
                  <Camera size={32} style={{ marginBottom: '0.5rem' }} />
                  <span>Subir imagen</span>
                </>
              )}
              <input 
                type="file" 
                accept="image/*" 
                style={{ display: 'none' }} 
                onChange={(e) => setImage(e.target.files[0])}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              type="button" 
              className="btn" 
              style={{ flex: 1, margin: 0, backgroundColor: 'var(--danger)', color: 'white', border: 'none' }}
              onClick={() => {
                setAmount('');
                setDescription('');
                setUser('');
                setImage(null);
              }}
              disabled={loading}
            >
              Cancelar
            </button>
            <button type="submit" className="btn" style={{ flex: 1, margin: 0 }} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
