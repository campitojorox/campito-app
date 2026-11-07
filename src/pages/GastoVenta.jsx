import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { Camera, Euro, AlignLeft, Trash2, RotateCcw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { formatCurrency, highlightText } from '../utils/helpers';

export default function GastoVenta() {
  const { users, transactions, refetchTransactions, searchQuery = '', isSearchOpen = false } = useOutletContext();
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [user, setUser] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  const [formErrors, setFormErrors] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', desc: '', user: '', type: '', image: null, currentImage: null });
  const [expandedImage, setExpandedImage] = useState(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isConfirmingImageDelete, setIsConfirmingImageDelete] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);


  const records = useMemo(() => {
    return (transactions || []).map(tx => ({
      TransactionID: tx.id,
      Date: tx.date.split('T')[0] + " 00:00:00",
      User: tx.profiles ? tx.profiles.name : 'Desconocido',
      Category: tx.type,
      Value: Math.abs(tx.amount),
      Amount: tx.amount,
      Description: tx.description,
      Imagen: tx.image_url,
      status: tx.status || 'ACTIVE',
      deleted_at: tx.deleted_at || null
    }));
  }, [transactions]);

  const finances = useMemo(() => {
    // REGLA: Los cálculos de saldos de usuarios SIEMPRE se calculan sobre transacciones ACTIVAS
    const activeRecords = records.filter(r => r.status === 'ACTIVE');
    const financesTmp = (users || []).map(u => {
      const userRecords = activeRecords.filter(r => r.User === u.name);
      const gasto = userRecords
        .filter(r => r.Category === 'Gasto' || parseFloat(r.Amount || 0) > 0)
        .reduce((acc, r) => acc + Math.abs(parseFloat(r.Amount || 0)), 0);
      const venta = userRecords
        .filter(r => r.Category === 'Retiro' || parseFloat(r.Amount || 0) < 0)
        .reduce((acc, r) => acc + Math.abs(parseFloat(r.Amount || 0)), 0);
      const balance = gasto - venta;
      return { user: u.name, gasto, venta, balance };
    });
    const maxBalance = financesTmp.length > 0 ? Math.max(...financesTmp.map(f => f.balance)) : 0;
    return financesTmp.map(f => ({
      user: f.user,
      gasto: f.gasto,
      venta: f.venta,
      balance: f.balance,
      diferencia: f.balance - maxBalance
    }));
  }, [users, records]);

  // Si showTrash es true: muestra activas y eliminadas juntas intercaladas por fecha.
  // Si showTrash es false: muestra únicamente transacciones activas.
  const visibleRecords = useMemo(() => {
    const list = showTrash ? records : records.filter(r => r.status === 'ACTIVE');
    return [...list].sort((a, b) => new Date(b.Date) - new Date(a.Date));
  }, [records, showTrash]);

  const displayRecords = useMemo(() => {
    return (isSearchOpen && searchQuery.trim() !== '') 
      ? visibleRecords.filter(r => 
          (r.User && r.User.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (r.Description && r.Description.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (r.Category && r.Category.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (r.Category === 'Retiro' && ('ingreso'.includes(searchQuery.toLowerCase()) || 'venta'.includes(searchQuery.toLowerCase()))) ||
          (r.Category === 'Gasto' && 'gasto'.includes(searchQuery.toLowerCase()))
        )
      : visibleRecords;
  }, [isSearchOpen, searchQuery, visibleRecords]);

  const handleAdd = async (e) => {
    e.preventDefault();
    
    const errors = {};
    if (!user) {
      errors.user = 'Selecciona un usuario';
    }
    if (!type || (type !== 'Gasto' && type !== 'Retiro')) {
      errors.type = 'Selecciona si es Gasto o Ingreso';
    }
    if (!amount || parseFloat(amount) <= 0) {
      errors.amount = 'Ingresa una cantidad válida';
    }
    if (!description || !description.trim()) {
      errors.description = 'Ingresa una descripción';
    }

    if (Object.keys(errors).length > 0) {
      const missing = [];
      if (errors.user) missing.push('Usuario');
      if (errors.type) missing.push('Gasto o Ingreso');
      if (errors.amount) missing.push('Cantidad');
      if (errors.description) missing.push('Descripción');
      errors.general = `Falta información: Por favor selecciona ${missing.join(', ')}.`;
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setLoading(true);
    
    const respUser = users.find(u => u.name === user);
    const userId = respUser ? respUser.id : null;

    let imageUrl = null;
    if (image) {
      const fileExt = image.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error } = await supabase.storage.from('comprobantes').upload(fileName, image);
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
      description: description.trim(),
      image_url: imageUrl
    }]);

    if (!error) {
      const msgType = type === 'Gasto' ? 'Gasto' : 'Ingreso';
      setSuccessMsg(`${msgType} de ${amount}€ registrado exitosamente!`);
      setTimeout(() => setSuccessMsg(null), 2500);

      setAmount('');
      setDescription('');
      setUser('');
      setType('');
      setImage(null);
      setFormErrors({});
      refetchTransactions();
    } else {
      alert('Error guardando transacción: ' + error.message);
    }
    setLoading(false);
  };

  const renderEditForm = () => (
    <div className="form-container" style={{ position: 'relative', width: '100%', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
      
      {/* Custom Confirm Delete Overlay */}
      {isConfirmingDelete && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '1.5rem'
        }}>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', border: '1px solid var(--danger)' }}>
            <h4 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.1rem' }}>¿Seguro que deseas eliminar esta transacción?</h4>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" onClick={() => setIsConfirmingDelete(false)} className="btn" style={{ flex: 1, backgroundColor: 'var(--surface)', color: 'white', border: '1px solid var(--border)', margin: 0 }}>Cancelar</button>
              <button type="button" onClick={async () => {
                const { error: delError } = await supabase
                  .from('transactions')
                  .update({
                    status: 'DELETED',
                    deleted_at: new Date().toISOString()
                  })
                  .eq('id', selectedRecord.TransactionID);

                // Si la columna status aún no se ha creado en Supabase, borrado de respaldo
                if (delError) {
                  console.warn('Soft delete no disponible, ejecutando borrado directo:', delError);
                  await supabase.from('transactions').delete().eq('id', selectedRecord.TransactionID);
                }

                refetchTransactions();
                setSelectedRecord(null);
                setIsConfirmingDelete(false);
              }} className="btn" style={{ flex: 1, backgroundColor: 'var(--danger)', color: 'white', border: 'none', margin: 0 }}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Image Delete Overlay */}
      {isConfirmingImageDelete && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '1.5rem'
        }}>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', border: '1px solid var(--danger)' }}>
            <h4 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.1rem' }}>¿Seguro que deseas borrar permanentemente esta imagen?</h4>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" onClick={() => setIsConfirmingImageDelete(false)} className="btn" style={{ flex: 1, backgroundColor: 'var(--surface)', color: 'white', border: '1px solid var(--border)', margin: 0 }}>Cancelar</button>
              <button type="button" onClick={() => {
                setEditForm({...editForm, currentImage: null, image: null});
                setIsConfirmingImageDelete(false);
              }} className="btn" style={{ flex: 1, backgroundColor: 'var(--danger)', color: 'white', border: 'none', margin: 0 }}>Sí, Borrar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0, marginBottom: '2.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: selectedRecord?.status === 'DELETED' ? '#ef4444' : '#000000', fontWeight: 'bold' }}>
          {selectedRecord?.status === 'DELETED' ? 'Transacción Eliminada' : 'Editar Transacción'}
        </h2>
        <button type="button" onClick={() => { setSelectedRecord(null); setEditErrors({}); }} style={{ background: 'none', border: 'none', color: '#000000', cursor: 'pointer', fontSize: '1.8rem', padding: 0 }}>&times;</button>
      </div>

      {editErrors.general && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid var(--danger)',
          borderRadius: '8px',
          padding: '0.8rem 1rem',
          marginBottom: '1.5rem',
          color: '#fca5a5',
          fontSize: '0.95rem',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>⚠️ {editErrors.general}</span>
        </div>
      )}
      
      <div style={{ color: 'var(--text-primary)' }}>
        <div className="form-group" style={{ padding: 0, marginBottom: '1.2rem' }}>
          <div style={{
            display: 'flex',
            gap: '1rem',
            paddingBottom: '0.5rem',
            width: '100%',
            borderRadius: '14px',
            border: editErrors.user ? '1.5px dashed var(--danger)' : '1.5px solid transparent',
            padding: editErrors.user ? '4px' : '0'
          }}>
            {users.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setEditForm({...editForm, user: u.name});
                  setEditErrors(prev => ({ ...prev, user: null, general: null }));
                }}
                style={{
                  flex: 1,
                  padding: '0.8rem 0',
                  borderRadius: '12px',
                  border: editForm.user === u.name ? `2px solid #9edb9e` : `2px solid transparent`,
                  backgroundColor: editForm.user === u.name ? '#9edb9e' : 'var(--primary)',
                  color: editForm.user === u.name ? '#1a1a1a' : 'white',
                  fontWeight: '600',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {u.name}
              </button>
            ))}
          </div>
          {editErrors.user && (
            <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.3rem', display: 'block', fontWeight: '500' }}>
              * Selecciona un usuario
            </span>
          )}
        </div>

        <div className="form-group" style={{ display: 'flex', gap: '0.6rem', marginTop: '1.8rem', marginBottom: '0.5rem', padding: 0, alignItems: 'stretch' }}>
          <div style={{ flex: '1 1 33%', minWidth: 0, display: 'flex' }}>
            <div className="input-with-icon" style={{ marginBottom: 0, width: '100%' }}>
              <Euro className="input-icon" size={18} style={{ left: '0.6rem' }} />
              <input 
                type="number" 
                step="0.01" 
                className="form-input" 
                value={editForm.amount} 
                onChange={(e) => {
                  setEditForm({...editForm, amount: e.target.value});
                  setEditErrors(prev => ({ ...prev, amount: null, general: null }));
                }} 
                placeholder="Cantidad"
                style={{
                  padding: '0.75rem 0.4rem 0.75rem 2rem',
                  width: '100%',
                  height: '100%',
                  minHeight: '44px',
                  fontSize: '0.95rem',
                  border: editErrors.amount ? '1.5px solid var(--danger)' : undefined
                }} 
              />
            </div>
          </div>
          <button 
            type="button"
            onClick={() => {
              setEditForm({...editForm, type: 'Gasto'});
              setEditErrors(prev => ({ ...prev, type: null, general: null }));
            }}
            style={{
              flex: '1 1 33%',
              minWidth: 0,
              padding: '0.6rem 0.2rem',
              borderRadius: '8px',
              border: (editErrors.type && !editForm.type) ? '1.5px dashed var(--danger)' : 'none',
              backgroundColor: editForm.type === 'Gasto' ? '#9edb9e' : 'var(--primary)',
              color: editForm.type === 'Gasto' ? '#1a1a1a' : 'white',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1.15
            }}
          >
            <span>Gasto</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>(invertido)</span>
          </button>
          <button 
            type="button"
            onClick={() => {
              setEditForm({...editForm, type: 'Retiro'});
              setEditErrors(prev => ({ ...prev, type: null, general: null }));
            }}
            style={{
              flex: '1 1 33%',
              minWidth: 0,
              padding: '0.6rem 0.2rem',
              borderRadius: '8px',
              border: (editErrors.type && !editForm.type) ? '1.5px dashed var(--danger)' : 'none',
              backgroundColor: editForm.type === 'Retiro' ? '#9edb9e' : 'var(--primary)',
              color: editForm.type === 'Retiro' ? '#1a1a1a' : 'white',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1.15
            }}
          >
            <span>Ingreso</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>(generado)</span>
          </button>
        </div>
        {(editErrors.amount || editErrors.type) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            {editErrors.amount ? (
              <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {editErrors.amount}</span>
            ) : <span />}
            {editErrors.type && (
              <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {editErrors.type}</span>
            )}
          </div>
        )}

        <div className="form-group" style={{ padding: 0, marginTop: '1.2rem' }}>
          <div className="input-with-icon">
            <AlignLeft className="input-icon" size={20} />
            <input 
              type="text" 
              className="form-input" 
              value={editForm.desc} 
              onChange={(e) => {
                setEditForm({...editForm, desc: e.target.value});
                setEditErrors(prev => ({ ...prev, description: null, general: null }));
              }} 
              placeholder="Descripción / Concepto" 
              style={{
                border: editErrors.description ? '1.5px solid var(--danger)' : undefined
              }}
            />
          </div>
          {editErrors.description && (
            <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.3rem', display: 'block', fontWeight: '500' }}>
              * {editErrors.description}
            </span>
          )}
        </div>

        <div className="form-group" style={{ padding: 0, marginTop: '1.5rem' }}>
          <label style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            padding: (editForm.currentImage || editForm.image) ? '0' : '0.8rem 1rem',
            border: '1.5px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            cursor: 'pointer',
            color: '#1e293b',
            overflow: 'hidden'
          }}>
            {(editForm.currentImage || editForm.image) ? (
              <div style={{ position: 'relative', width: '100%' }}>
                <img 
                  src={editForm.image ? URL.createObjectURL(editForm.image) : editForm.currentImage} 
                  alt="Preview" 
                  onClick={(e) => {
                    e.preventDefault();
                    setExpandedImage(editForm.image ? URL.createObjectURL(editForm.image) : editForm.currentImage);
                  }}
                  style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block', borderRadius: '8px', cursor: 'pointer' }} 
                />
                <button 
                  type="button"
                  onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    setIsConfirmingImageDelete(true); 
                  }}
                  style={{
                    position: 'absolute', top: '10px', right: '10px', width: '32px', height: '32px', borderRadius: '50%',
                    backgroundColor: 'var(--danger)', color: 'white', border: '1px solid var(--border)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem',
                    paddingBottom: '3px', zIndex: 10
                  }}
                >
                  &times;
                </button>
              </div>
            ) : (
              <>
                <Camera size={22} />
                <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>Subir imagen</span>
              </>
            )}
            <input 
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={(e) => setEditForm({...editForm, image: e.target.files[0]})} 
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '3.2rem' }}>
          <button type="button" onClick={async () => {
            const errs = {};
            if (!editForm.user) errs.user = 'Selecciona un usuario';
            if (!editForm.type || (editForm.type !== 'Gasto' && editForm.type !== 'Retiro')) errs.type = 'Selecciona Gasto o Ingreso';
            if (!editForm.amount || parseFloat(editForm.amount) <= 0) errs.amount = 'Ingresa una cantidad';
            if (!editForm.desc || !editForm.desc.trim()) errs.description = 'Ingresa una descripción';

            if (Object.keys(errs).length > 0) {
              const missing = [];
              if (errs.user) missing.push('Usuario');
              if (errs.type) missing.push('Gasto o Ingreso');
              if (errs.amount) missing.push('Cantidad');
              if (errs.description) missing.push('Descripción');
              errs.general = `Falta información: Por favor completa ${missing.join(', ')}.`;
              setEditErrors(errs);
              return;
            }
            setEditErrors({});

            const finalAmount = editForm.type === 'Retiro' ? -Math.abs(parseFloat(editForm.amount)) : Math.abs(parseFloat(editForm.amount));
            
            let imageUrl = editForm.currentImage;
            if (editForm.image) {
              const fileExt = editForm.image.name.split('.').pop();
              const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
              const { error } = await supabase.storage.from('comprobantes').upload(fileName, editForm.image);
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

            refetchTransactions();
            setSelectedRecord(null);
          }} className="btn btn-primary" style={{ flex: 1, margin: 0, padding: '0.75rem 0' }}>Guardar / Cerrar</button>
          
          {selectedRecord.status === 'DELETED' ? (
            <button 
              type="button" 
              onClick={async () => {
                await supabase
                  .from('transactions')
                  .update({ status: 'ACTIVE', deleted_at: null })
                  .eq('id', selectedRecord.TransactionID);
                refetchTransactions();
                setSelectedRecord(null);
              }} 
              className="btn" 
              style={{ flex: 1, margin: 0, padding: '0.75rem 0', backgroundColor: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', border: 'none', fontWeight: 'bold' }}
            >
              <RotateCcw size={18} />
              Restaurar
            </button>
          ) : (
            <button type="button" onClick={() => setIsConfirmingDelete(true)} className="btn" style={{ flex: 1, margin: 0, padding: '0.75rem 0', backgroundColor: 'var(--danger)', color: 'white' }}>Borrar</button>
          )}
        </div>
      </div>
    </div>
  );

  const renderRow = (r, i) => {
    // Para las re-renderizaciones por slice, la key original puede dar problemas si se basa en i.
    const key = r.TransactionID || i;
    const isDeleted = r.status === 'DELETED';
    const textColor = isDeleted 
      ? '#ef4444' 
      : (r.Category === 'Retiro' ? '#8ab98a' : 'var(--text-secondary)');

    return (
      <tr 
        key={key} 
        style={{ 
          cursor: 'pointer',
          backgroundColor: isDeleted ? 'rgba(239, 68, 68, 0.08)' : 'transparent'
        }}
        onClick={() => {
          setSelectedRecord(r);
          setEditForm({ amount: Math.abs(r.Amount), desc: r.Description || '', user: r.User || '', type: r.Category === 'Retiro' ? 'Retiro' : 'Gasto', image: null, currentImage: r.Imagen || null });
          setIsConfirmingDelete(false);
          setEditErrors({});
        }}
      >
        <td style={{ color: textColor }}>{r.Date ? r.Date.split(' ')[0] : ''}</td>
        <td style={{ color: textColor }}>{highlightText(r.User, isSearchOpen ? searchQuery : '')}</td>
        <td style={{ color: textColor }}>
          {formatCurrency(Math.abs(r.Amount))}
        </td>
        <td style={{ color: textColor }}>
          {highlightText(r.Category === 'Gasto' ? 'GASTO' : 'INGRESO', isSearchOpen ? searchQuery : '')}
        </td>
      </tr>
    );
  };

  return (
    <div className="container" style={{ padding: '1rem', paddingBottom: '5rem' }}>
      {!(isSearchOpen && searchQuery.trim() !== '') && (
        <>
          <div className="form-container">
            <h2 style={{ marginTop: 0, marginBottom: '2.5rem', fontSize: '1.5rem', color: '#000000', fontWeight: 'bold' }}>Agregar Movimiento</h2>

            {formErrors.general && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--danger)',
                borderRadius: '8px',
                padding: '0.8rem 1rem',
                marginBottom: '1.5rem',
                color: '#dc2626',
                fontSize: '0.95rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>⚠️ {formErrors.general}</span>
              </div>
            )}
            
            <div>
              <form onSubmit={handleAdd}>
          <div className="form-group" style={{ padding: 0, marginBottom: '1.2rem' }}>
            <div style={{
              display: 'flex',
              gap: '1rem',
              paddingBottom: '0.5rem',
              width: '100%',
              borderRadius: '14px',
              border: formErrors.user ? '1.5px dashed var(--danger)' : '1.5px solid transparent',
              padding: formErrors.user ? '4px' : '0'
            }}>
              {users.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setUser(u.name);
                    setFormErrors(prev => ({ ...prev, user: null, general: null }));
                  }}
                  style={{
                    flex: 1,
                    padding: '0.8rem 0',
                    borderRadius: '12px',
                    border: user === u.name ? `2px solid #9edb9e` : `2px solid transparent`,
                    backgroundColor: user === u.name ? '#9edb9e' : 'var(--primary)',
                    color: user === u.name ? '#1a1a1a' : 'white',
                    fontWeight: '600',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {u.name}
                </button>
              ))}
            </div>
            {formErrors.user && (
              <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.3rem', display: 'block', fontWeight: '500' }}>
                * Selecciona un usuario
              </span>
            )}
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '0.6rem', marginTop: '1.8rem', marginBottom: '0.5rem', padding: 0, alignItems: 'stretch' }}>
            <div style={{ flex: '1 1 33%', minWidth: 0, display: 'flex' }}>
              <div className="input-with-icon" style={{ marginBottom: 0, width: '100%' }}>
                <Euro className="input-icon" size={18} style={{ left: '0.6rem' }} />
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-input" 
                  value={amount} 
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setFormErrors(prev => ({ ...prev, amount: null, general: null }));
                  }} 
                  placeholder="Cantidad"
                  style={{
                    padding: '0.75rem 0.4rem 0.75rem 2rem',
                    width: '100%',
                    height: '100%',
                    minHeight: '44px',
                    fontSize: '0.95rem',
                    border: formErrors.amount ? '1.5px solid var(--danger)' : undefined
                  }} 
                />
              </div>
            </div>
            <button 
              type="button"
              onClick={() => {
                setType('Gasto');
                setFormErrors(prev => ({ ...prev, type: null, general: null }));
              }}
              style={{
                flex: '1 1 33%',
                minWidth: 0,
                padding: '0.6rem 0.2rem',
                borderRadius: '8px',
                border: formErrors.type && !type ? '1.5px dashed var(--danger)' : 'none',
                backgroundColor: type === 'Gasto' ? '#9edb9e' : 'var(--primary)',
                color: type === 'Gasto' ? '#1a1a1a' : 'white',
                fontWeight: '600',
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1.15
              }}
            >
              <span>Gasto</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>(invertido)</span>
            </button>
            <button 
              type="button"
              onClick={() => {
                setType('Retiro');
                setFormErrors(prev => ({ ...prev, type: null, general: null }));
              }}
              style={{
                flex: '1 1 33%',
                minWidth: 0,
                padding: '0.6rem 0.2rem',
                borderRadius: '8px',
                border: formErrors.type && !type ? '1.5px dashed var(--danger)' : 'none',
                backgroundColor: type === 'Retiro' ? '#9edb9e' : 'var(--primary)',
                color: type === 'Retiro' ? '#1a1a1a' : 'white',
                fontWeight: '600',
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1.15
              }}
            >
              <span>Ingreso</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>(generado)</span>
            </button>
          </div>
          {(formErrors.amount || formErrors.type) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              {formErrors.amount ? (
                <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {formErrors.amount}</span>
              ) : <span />}
              {formErrors.type && (
                <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {formErrors.type}</span>
              )}
            </div>
          )}
          
          <div className="form-group" style={{ padding: 0, marginTop: '1.2rem' }}>
            <div className="input-with-icon">
              <AlignLeft className="input-icon" size={20} />
              <input 
                type="text" 
                className="form-input" 
                value={description} 
                onChange={(e) => {
                  setDescription(e.target.value);
                  setFormErrors(prev => ({ ...prev, description: null, general: null }));
                }} 
                placeholder="Descripción / Concepto" 
                style={{
                  border: formErrors.description ? '1.5px solid var(--danger)' : undefined
                }}
              />
            </div>
            {formErrors.description && (
              <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.3rem', display: 'block', fontWeight: '500' }}>
                * {formErrors.description}
              </span>
            )}
          </div>

          <div className="form-group" style={{ padding: 0, marginTop: '1.5rem' }}>
            <label style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              padding: image ? '0' : '0.8rem 1rem',
              border: '1.5px solid #e2e8f0',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              cursor: 'pointer',
              color: '#1e293b',
              overflow: 'hidden'
            }}>
              {image ? (
                <div style={{ position: 'relative', width: '100%' }}>
                  <img src={URL.createObjectURL(image)} alt="Preview" style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block', borderRadius: '8px' }} />
                  <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImage(null); }}
                    style={{
                      position: 'absolute', top: '10px', right: '10px', width: '32px', height: '32px', borderRadius: '50%',
                      backgroundColor: 'var(--danger)', color: 'white', border: '1px solid var(--border)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem',
                      paddingBottom: '3px', zIndex: 10
                    }}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <>
                  <Camera size={22} />
                  <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>Subir imagen</span>
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

          <div style={{ display: 'flex', gap: '1rem', marginTop: '3.2rem' }}>
            <button type="submit" className="btn" style={{ width: '100%', margin: 0 }} disabled={loading}>
              {loading ? 'Agregando...' : 'AGREGAR'}
            </button>
          </div>
        </form>
      </div>
    </div>

      <div style={{ marginTop: '5rem', marginBottom: '5.5rem' }}>
        <h2 className="section-title" style={{ marginTop: 0, marginBottom: '1.2rem', color: 'white' }}>Contabilidad</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th>USUARIO</th>
                <th>GASTO</th>
                <th>INGRESO</th>
                <th>BALANCE</th>
                <th>DIFERENCIA</th>
              </tr>
            </thead>
            <tbody>
              {finances.map((f, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-primary)' }}>{f.user}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {formatCurrency(f.gasto)}
                  </td>
                  <td style={{ color: '#8ab98a' }}>
                    {formatCurrency(f.venta)}
                  </td>
                  <td style={{ color: f.balance < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    {formatCurrency(f.balance)}
                  </td>
                  <td style={{ color: f.diferencia < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    {formatCurrency(f.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5.5rem', marginBottom: '1.2rem' }}>
        <h2 className="section-title" style={{ margin: 0, color: 'white' }}>
          {(isSearchOpen && searchQuery.trim() !== '') ? `Resultados de búsqueda (${displayRecords.length})` : 'Transacciones'}
        </h2>
        <button
          type="button"
          onClick={() => setShowTrash(!showTrash)}
          title={showTrash ? 'Ocultar transacciones eliminadas' : 'Mostrar transacciones eliminadas intercaladas'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.45rem',
            borderRadius: '6px',
            backgroundColor: showTrash ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
            color: showTrash ? '#ef4444' : '#666666',
            border: showTrash ? '1px solid #ef4444' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Trash2 size={24} />
        </button>
      </div>
      
      {!selectedRecord ? (
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
              {displayRecords.map((r, i) => renderRow(r, i))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Fecha ↓</th>
                  <th>Usuario</th>
                  <th>Cantidad</th>
                  <th>Cat.</th>
                </tr>
              </thead>
              <tbody>
                {displayRecords.slice(0, displayRecords.findIndex(r => r.TransactionID === selectedRecord.TransactionID)).map((r, i) => renderRow(r, i))}
              </tbody>
            </table>
          </div>
          
          <div style={{ margin: '1.5rem 0' }}>
            {renderEditForm()}
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ whiteSpace: 'nowrap', marginTop: 0 }}>
              <tbody>
                {displayRecords.slice(displayRecords.findIndex(r => r.TransactionID === selectedRecord.TransactionID) + 1).map((r, i) => renderRow(r, i))}
              </tbody>
            </table>
          </div>
        </>
      )}


      {expandedImage && createPortal((
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '1rem'
        }} onClick={() => setExpandedImage(null)}>
          <button style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'white', fontSize: '3rem', cursor: 'pointer' }}>&times;</button>
          <img src={expandedImage} alt="Expanded" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      ), document.body)}

      {successMsg && createPortal((
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, padding: '1.5rem'
        }}>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', maxWidth: '400px', border: '1px solid var(--primary)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '1.3rem' }}>¡Éxito!</h3>
            <p style={{ color: 'white', fontSize: '1.1rem', margin: 0 }}>{successMsg}</p>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
