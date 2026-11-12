import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { Euro, AlignLeft, Trash2, RotateCcw, Filter, X, FileText, Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { formatCurrency, highlightText } from '../utils/helpers';
import SectionChatIA from '../components/SectionChatIA';

export default function GastoIngreso() {
  const { users, transactions, refetchTransactions, searchQuery = '', isSearchOpen = false, currentUser = 'Usuario Login' } = useOutletContext();
  // cambio de grafica del form: formulario colapsable inicialmente cerrado
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [user, setUser] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);

  // Estados de Contabilidad y Filtros de Transacciones
  const [showFinanceDetails, setShowFinanceDetails] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState('ALL'); // 'ALL' | 'Gasto' | 'Retiro' | 'TRASH' | 'ALL_WITH_TRASH'
  const [filterUser, setFilterUser] = useState('ALL'); // 'ALL' | user.name
  const [filterSearchTerm, setFilterSearchTerm] = useState('');

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
      Date: tx.date ? tx.date.split('T')[0] + " 00:00:00" : '',
      Timestamp: tx.date ? new Date(tx.date).getTime() : 0,
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

  const hasActiveFilters = filterCategory !== 'ALL' || filterUser !== 'ALL' || filterSearchTerm.trim() !== '';

  const displayRecords = useMemo(() => {
    // 1. Base según categoría y estado (Papelera o Activas)
    let list;
    if (filterCategory === 'TRASH') {
      list = records.filter(r => r.status === 'DELETED');
    } else if (filterCategory === 'ALL_WITH_TRASH') {
      list = records;
    } else {
      // Por defecto para 'ALL', 'Gasto', 'Retiro': únicamente transacciones activas
      list = records.filter(r => r.status === 'ACTIVE');
    }

    // Ordenar por fecha y hora descendente
    list = [...list].sort((a, b) => {
      const dayDiff = new Date(b.Date) - new Date(a.Date);
      if (dayDiff !== 0) return dayDiff;
      return (b.Timestamp || 0) - (a.Timestamp || 0);
    });

    // 2. Buscador global de la barra superior si está activo
    if (isSearchOpen && searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => 
        (r.User && r.User.toLowerCase().includes(q)) ||
        (r.Description && r.Description.toLowerCase().includes(q)) ||
        (r.Category && r.Category.toLowerCase().includes(q)) ||
        (r.Category === 'Retiro' && ('ingreso'.includes(q) || 'venta'.includes(q))) ||
        (r.Category === 'Gasto' && 'gasto'.includes(q))
      );
    }

    // 3. Filtro específico por tipo de movimiento si aplica
    if (filterCategory === 'Gasto') {
      list = list.filter(r => r.Category === 'Gasto');
    } else if (filterCategory === 'Retiro') {
      list = list.filter(r => r.Category === 'Retiro');
    }

    // 4. Filtro por usuario / socio
    if (filterUser !== 'ALL') {
      list = list.filter(r => r.User === filterUser);
    }

    // 5. Filtro por texto / concepto del panel de filtros
    if (filterSearchTerm.trim() !== '') {
      const term = filterSearchTerm.toLowerCase();
      list = list.filter(r =>
        (r.User && r.User.toLowerCase().includes(term)) ||
        (r.Description && r.Description.toLowerCase().includes(term))
      );
    }

    return list;
  }, [records, isSearchOpen, searchQuery, filterCategory, filterUser, filterSearchTerm]);

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
      setIsAddFormOpen(false);
      refetchTransactions();
    } else {
      alert('Error guardando transacción: ' + error.message);
    }
    setLoading(false);
  };

  const renderEditForm = () => (
    // cambio de grafica del form
    <div id="edit-tx-form" className="form-container" style={{ position: 'relative', width: '100%', textAlign: 'left', padding: '1.35rem', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)' }} onClick={e => e.stopPropagation()}>
      
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
            <h4 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.1rem' }}>¿Seguro que deseas borrar permanentemente este justificante?</h4>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0, marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', color: selectedRecord?.status === 'DELETED' ? '#ef4444' : '#000000', fontWeight: 'bold' }}>
          {selectedRecord?.status === 'DELETED' ? 'Transacción Eliminada' : 'Editar Transacción'}
        </h2>
        <button type="button" onClick={() => { setSelectedRecord(null); setEditErrors({}); }} style={{ background: 'none', border: 'none', color: '#000000', cursor: 'pointer', fontSize: '1.8rem', padding: 0, lineHeight: 1 }}>&times;</button>
      </div>

      {editErrors.general && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid var(--danger)',
          borderRadius: '8px',
          padding: '0.8rem 1rem',
          marginBottom: '1.2rem',
          color: '#dc2626',
          fontSize: '0.92rem',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>⚠️ {editErrors.general}</span>
        </div>
      )}
      
      <div style={{ color: 'var(--text-primary)' }}>
        <div className="form-group" style={{ padding: 0, marginBottom: '0.9rem' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: '0.35rem',
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
                  minWidth: 0,
                  minHeight: '42px',
                  padding: '0.5rem 0.2rem',
                  borderRadius: '10px',
                  border: editForm.user === u.name ? `2px solid #74c474` : `2px solid transparent`,
                  backgroundColor: editForm.user === u.name ? '#9edb9e' : 'var(--primary)',
                  color: editForm.user === u.name ? '#1a1a1a' : 'white',
                  fontWeight: '600',
                  fontSize: 'clamp(0.74rem, 3.1vw, 0.92rem)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
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

        <div className="form-group" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.4rem', padding: 0, alignItems: 'stretch' }}>
          <div style={{ flex: '1.2 1 0', minWidth: 0, display: 'flex' }}>
            <div className="input-with-icon" style={{ marginBottom: 0, width: '100%' }}>
              <Euro className="input-icon" size={18} style={{ left: '0.65rem' }} />
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
                  padding: '0.65rem 0.45rem 0.65rem 2.1rem',
                  width: '100%',
                  height: '48px',
                  minHeight: '48px',
                  fontSize: '0.95rem',
                  borderRadius: '10px',
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
              flex: '0.95 1 0',
              minWidth: 0,
              minHeight: '48px',
              padding: '0.45rem 0.35rem',
              borderRadius: '10px',
              border: (editErrors.type && !editForm.type) ? '1.5px dashed var(--danger)' : (editForm.type === 'Gasto' ? '2px solid #74c474' : '2px solid transparent'),
              backgroundColor: editForm.type === 'Gasto' ? '#9edb9e' : 'var(--primary)',
              color: editForm.type === 'Gasto' ? '#1a1a1a' : 'white',
              fontWeight: '600',
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1.15
            }}
          >
            <span>Gasto</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>(invertido)</span>
          </button>
          <button 
            type="button"
            onClick={() => {
              setEditForm({...editForm, type: 'Retiro'});
              setEditErrors(prev => ({ ...prev, type: null, general: null }));
            }}
            style={{
              flex: '0.95 1 0',
              minWidth: 0,
              minHeight: '48px',
              padding: '0.45rem 0.35rem',
              borderRadius: '10px',
              border: (editErrors.type && !editForm.type) ? '1.5px dashed var(--danger)' : (editForm.type === 'Retiro' ? '2px solid #74c474' : '2px solid transparent'),
              backgroundColor: editForm.type === 'Retiro' ? '#9edb9e' : 'var(--primary)',
              color: editForm.type === 'Retiro' ? '#1a1a1a' : 'white',
              fontWeight: '600',
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1.15
            }}
          >
            <span>Ingreso</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>(generado)</span>
          </button>
        </div>
        {(editErrors.amount || editErrors.type) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            {editErrors.amount ? (
              <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {editErrors.amount}</span>
            ) : <span />}
            {editErrors.type && (
              <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {editErrors.type}</span>
            )}
          </div>
        )}

        <div className="form-group" style={{ padding: 0, marginTop: '0.95rem', marginBottom: '0' }}>
          <div className="input-with-icon" style={{ marginBottom: 0 }}>
            <AlignLeft className="input-icon" size={19} />
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
                height: '48px',
                borderRadius: '10px',
                fontSize: '0.95rem',
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

        <div className="form-group" style={{ padding: 0, marginTop: '0.95rem', marginBottom: '0' }}>
          <label style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            minHeight: '48px',
            padding: (editForm.currentImage || editForm.image) ? '0' : '0.65rem 1rem',
            border: '1.5px solid #cbd5e1',
            borderRadius: '10px',
            backgroundColor: '#f8fafc',
            cursor: 'pointer',
            color: '#1e293b',
            overflow: 'hidden'
          }}>
            {(editForm.currentImage || editForm.image) ? (
              <div style={{ position: 'relative', width: '100%' }}>
                {(() => {
                  const targetSrc = editForm.image ? URL.createObjectURL(editForm.image) : editForm.currentImage;
                  const isPdf = (editForm.image && editForm.image.type === 'application/pdf') || (typeof targetSrc === 'string' && targetSrc.toLowerCase().includes('.pdf'));
                  if (isPdf) {
                    return (
                      <div 
                        onClick={(e) => { e.preventDefault(); window.open(targetSrc, '_blank'); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '1.5rem', color: '#1e293b', cursor: 'pointer', width: '100%' }}
                      >
                        <FileText size={28} color="#00979d" />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Ver justificante PDF</span>
                      </div>
                    );
                  }
                  return (
                    <img 
                      src={targetSrc} 
                      alt="Preview" 
                      onClick={(e) => {
                        e.preventDefault();
                        setExpandedImage(targetSrc);
                      }}
                      style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block', borderRadius: '8px', cursor: 'pointer' }} 
                    />
                  );
                })()}
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
                <FileText size={22} color="#00979d" />
                <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>Subir justificante</span>
              </>
            )}
            <input 
              type="file" 
              accept="*/*" 
              style={{ display: 'none' }} 
              onChange={(e) => setEditForm({...editForm, image: e.target.files[0]})} 
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.35rem' }}>
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
          }} className="btn btn-primary" style={{ flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700 }}>Guardar / Cerrar</button>
          
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
              style={{ flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', backgroundColor: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', border: 'none', fontWeight: 'bold' }}
            >
              <RotateCcw size={18} />
              Restaurar
            </button>
          ) : (
            <button type="button" onClick={() => setIsConfirmingDelete(true)} className="btn" style={{ flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700, backgroundColor: 'var(--danger)', color: 'white' }}>Borrar</button>
          )}
        </div>
      </div>
    </div>
  );

  const renderItem = (r, i, totalLen = 1) => {
    const key = r.TransactionID || i;
    const isDeleted = r.status === 'DELETED';
    const isRetiro = r.Category === 'Retiro';
    const activeSearchHighlight = (isSearchOpen && searchQuery.trim()) ? searchQuery : filterSearchTerm;
    
    // Colores adaptados al fondo marrón clarito (#f1ebe6) de Contabilidad
    const itemColor = isDeleted 
      ? '#b91c1c' 
      : (isRetiro ? '#166534' : '#5c4436');

    return (
      <div 
        key={key} 
        style={{ 
          cursor: 'pointer',
          padding: '0.78rem 0.25rem',
          borderBottom: i < totalLen - 1 ? '1px solid rgba(43, 29, 20, 0.12)' : 'none',
          backgroundColor: isDeleted ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          transition: 'background-color 0.15s ease'
        }}
        onClick={() => {
          setSelectedRecord(r);
          setEditForm({
            amount: Math.abs(r.Amount),
            desc: r.Description || '',
            user: r.User || '',
            type: r.Category === 'Retiro' ? 'Retiro' : 'Gasto',
            image: null,
            currentImage: r.Imagen || null
          });
          setIsConfirmingDelete(false);
          setEditErrors({});
        }}
      >
        {/* Lado izquierdo: Usuario, fecha, archivo adjunto y concepto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontWeight: 700,
              fontSize: '0.92rem',
              color: isDeleted ? '#b91c1c' : '#2b1d14'
            }}>
              {highlightText(r.User, activeSearchHighlight)}
            </span>
            <span style={{ fontSize: '0.78rem', color: '#5c4436', opacity: 0.9 }}>
              {r.Date ? r.Date.split(' ')[0] : ''}
            </span>
            {r.Imagen && (
              <span title="Justificante adjunto" style={{ display: 'inline-flex', color: '#5c4436' }}>
                <FileText size={15} />
              </span>
            )}
            {isDeleted && (
              <span style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600 }}>
                (Eliminada)
              </span>
            )}
          </div>

          {r.Description && (
            <span style={{
              fontSize: '0.83rem',
              color: '#5c4436',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {highlightText(r.Description, activeSearchHighlight)}
            </span>
          )}
        </div>

        {/* Lado derecho: Cantidad y Categoría */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontWeight: 700,
            fontSize: '1rem',
            color: itemColor
          }}>
            {formatCurrency(Math.abs(r.Amount))}
          </div>
          <div style={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: itemColor,
            opacity: 0.9,
            marginTop: '1px'
          }}>
            {isRetiro ? 'INGRESO' : 'GASTO'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container" style={{ padding: '1rem', paddingBottom: '8rem' }}>
      {!(isSearchOpen && searchQuery.trim() !== '') && (
        <>
          {/* Sección Contabilidad dentro de un div con bordes redondos, café con leche muy suave */}
          <div className="contabilidad-container" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.45rem', color: '#2b1d14', fontWeight: 800 }}>Contabilidad</h2>
                <span style={{ fontSize: '0.82rem', color: '#5f4434', fontWeight: 500 }}>Balance financiero por socio</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFinanceDetails(!showFinanceDetails)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '20px',
                  backgroundColor: showFinanceDetails ? '#2b1d14' : 'rgba(43, 29, 20, 0.1)',
                  color: showFinanceDetails ? '#ffffff' : '#2b1d14',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {showFinanceDetails ? 'Ocultar Desglose' : 'Ver Gasto/Ingreso'}
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="contabilidad-table" style={{ whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>USUARIO</th>
                    {showFinanceDetails && (
                      <>
                        <th style={{ textAlign: 'right' }}>GASTO</th>
                        <th style={{ textAlign: 'right' }}>INGRESO</th>
                      </>
                    )}
                    <th style={{ textAlign: 'right' }}>BALANCE</th>
                    <th style={{ textAlign: 'right' }}>DIFERENCIA</th>
                  </tr>
                </thead>
                <tbody>
                  {finances.map((f, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: '#2b1d14' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(43, 29, 20, 0.12)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#2b1d14'
                          }}>
                            {f.user ? f.user.charAt(0).toUpperCase() : '?'}
                          </span>
                          <span>{f.user}</span>
                        </div>
                      </td>
                      {showFinanceDetails && (
                        <>
                          <td style={{ textAlign: 'right', color: '#5c4436', fontWeight: 600 }}>
                            {formatCurrency(f.gasto)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#166534', fontWeight: 600 }}>
                            {formatCurrency(f.venta)}
                          </td>
                        </>
                      )}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 700,
                          color: f.balance < 0 ? '#991b1b' : (f.balance > 0 ? '#14532d' : '#2b1d14')
                        }}>
                          {formatCurrency(f.balance)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {f.diferencia === 0 ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            backgroundColor: 'rgba(20, 83, 45, 0.12)',
                            color: '#14532d',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '0.82rem'
                          }}>
                            0,00 € <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>✓ Al día</span>
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: 'rgba(153, 27, 27, 0.1)',
                            color: '#991b1b',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '0.82rem'
                          }}>
                            {formatCurrency(f.diferencia)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Resumen Finca */}
            <div style={{
              marginTop: '1.2rem',
              paddingTop: '0.9rem',
              borderTop: '1px solid rgba(43, 29, 20, 0.15)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              fontSize: '0.82rem',
              color: '#5c4436'
            }}>
              <span style={{ fontWeight: 600 }}>Balance Total Comunidad:</span>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#2b1d14' }}>
                {formatCurrency(finances.reduce((acc, f) => acc + f.balance, 0))}
              </span>
            </div>
          </div>

          {/* cambio de grafica del form: formulario colapsable debajo de Contabilidad con botón verde + y usuarios en una sola línea */}
          <div
            className="form-container"
            style={{
              padding: isAddFormOpen ? '1.35rem' : '0.95rem 1.35rem',
              marginTop: '3rem',
              marginBottom: '3rem',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
              transition: 'padding 0.2s ease',
            }}
          >
            <div
              onClick={() => setIsAddFormOpen((prev) => !prev)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                marginBottom: isAddFormOpen ? '1.25rem' : 0,
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#000000', fontWeight: 'bold' }}>
                Agregar Movimiento
              </h2>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddFormOpen((prev) => !prev);
                }}
                aria-label={isAddFormOpen ? 'Cerrar formulario' : 'Abrir formulario Agregar Movimiento'}
                title={isAddFormOpen ? 'Cerrar formulario' : 'Agregar Movimiento'}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(0, 151, 157, 0.35)',
                  transform: isAddFormOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.22s ease, background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <Plus size={24} />
              </button>
            </div>

            {isAddFormOpen && (
              <div>
                {formErrors.general && (
                  <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid var(--danger)',
                    borderRadius: '8px',
                    padding: '0.8rem 1rem',
                    marginBottom: '1.2rem',
                    color: '#dc2626',
                    fontSize: '0.92rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span>⚠️ {formErrors.general}</span>
                  </div>
                )}

                <form onSubmit={handleAdd}>
                  <div className="form-group" style={{ padding: 0, marginBottom: '0.9rem' }}>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'nowrap',
                      gap: '0.35rem',
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
                            minWidth: 0,
                            minHeight: '42px',
                            padding: '0.5rem 0.2rem',
                            borderRadius: '10px',
                            border: user === u.name ? `2px solid #74c474` : `2px solid transparent`,
                            backgroundColor: user === u.name ? '#9edb9e' : 'var(--primary)',
                            color: user === u.name ? '#1a1a1a' : 'white',
                            fontWeight: '600',
                            fontSize: 'clamp(0.74rem, 3.1vw, 0.92rem)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
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

                  <div className="form-group" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.4rem', padding: 0, alignItems: 'stretch' }}>
                    <div style={{ flex: '1.2 1 0', minWidth: 0, display: 'flex' }}>
                      <div className="input-with-icon" style={{ marginBottom: 0, width: '100%' }}>
                        <Euro className="input-icon" size={18} style={{ left: '0.65rem' }} />
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
                            padding: '0.65rem 0.45rem 0.65rem 2.1rem',
                            width: '100%',
                            height: '48px',
                            minHeight: '48px',
                            fontSize: '0.95rem',
                            borderRadius: '10px',
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
                        flex: '0.95 1 0',
                        minWidth: 0,
                        minHeight: '48px',
                        padding: '0.45rem 0.35rem',
                        borderRadius: '10px',
                        border: formErrors.type && !type ? '1.5px dashed var(--danger)' : (type === 'Gasto' ? '2px solid #74c474' : '2px solid transparent'),
                        backgroundColor: type === 'Gasto' ? '#9edb9e' : 'var(--primary)',
                        color: type === 'Gasto' ? '#1a1a1a' : 'white',
                        fontWeight: '600',
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1.15
                      }}
                    >
                      <span>Gasto</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>(invertido)</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setType('Retiro');
                        setFormErrors(prev => ({ ...prev, type: null, general: null }));
                      }}
                      style={{
                        flex: '0.95 1 0',
                        minWidth: 0,
                        minHeight: '48px',
                        padding: '0.45rem 0.35rem',
                        borderRadius: '10px',
                        border: formErrors.type && !type ? '1.5px dashed var(--danger)' : (type === 'Retiro' ? '2px solid #74c474' : '2px solid transparent'),
                        backgroundColor: type === 'Retiro' ? '#9edb9e' : 'var(--primary)',
                        color: type === 'Retiro' ? '#1a1a1a' : 'white',
                        fontWeight: '600',
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1.15
                      }}
                    >
                      <span>Ingreso</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>(generado)</span>
                    </button>
                  </div>
                  {(formErrors.amount || formErrors.type) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                      {formErrors.amount ? (
                        <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {formErrors.amount}</span>
                      ) : <span />}
                      {formErrors.type && (
                        <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {formErrors.type}</span>
                      )}
                    </div>
                  )}
                  
                  <div className="form-group" style={{ padding: 0, marginTop: '0.95rem', marginBottom: '0' }}>
                    <div className="input-with-icon" style={{ marginBottom: 0 }}>
                      <AlignLeft className="input-icon" size={19} />
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
                          height: '48px',
                          borderRadius: '10px',
                          fontSize: '0.95rem',
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

                  <div className="form-group" style={{ padding: 0, marginTop: '0.95rem', marginBottom: '0' }}>
                    <label style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.6rem',
                      minHeight: '48px',
                      padding: image ? '0' : '0.65rem 1rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      backgroundColor: '#f8fafc',
                      cursor: 'pointer',
                      color: '#1e293b',
                      overflow: 'hidden'
                    }}>
                      {image ? (
                        <div style={{ position: 'relative', width: '100%', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {image.type === 'application/pdf' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1.2rem', color: '#1e293b' }}>
                              <FileText size={28} color="#00979d" />
                              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{image.name || 'Documento PDF'}</span>
                            </div>
                          ) : (
                            <img src={URL.createObjectURL(image)} alt="Preview" style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block', borderRadius: '8px' }} />
                          )}
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
                          <FileText size={20} color="#00979d" />
                          <span style={{ fontSize: '0.92rem', fontWeight: '600' }}>Subir justificante</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="*/*" 
                        style={{ display: 'none' }} 
                        onChange={(e) => setImage(e.target.files[0])}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.35rem' }}>
                    <button
                      type="submit"
                      className="btn"
                      style={{
                        width: '100%',
                        margin: 0,
                        minHeight: '46px',
                        padding: '0.65rem 0',
                        borderRadius: '10px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                      }}
                      disabled={loading}
                    >
                      {loading ? 'Agregando...' : 'AGREGAR'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </>
      )}

      {/* Contenedor único de Transacciones con título, filtros y listado dentro del div marrón claro */}
      <div
        style={{
          backgroundColor: '#f1ebe6',
          borderRadius: '14px',
          border: '1px solid #e7e0d8',
          padding: '1.15rem 1rem 0.5rem 1rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
          marginTop: '1.5rem',
        }}
      >
        {/* Cabecera de Transacciones dentro del div (mismo tamaño que antes) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: (hasActiveFilters || displayRecords.length > 0 || selectedRecord) ? '0.65rem' : '0.35rem',
          }}
        >
          <h2
            className="section-title"
            style={{
              margin: 0,
              padding: 0,
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#2b1d14',
            }}
          >
            {(isSearchOpen && searchQuery.trim() !== '') ? `Resultados de búsqueda (${displayRecords.length})` : 'Transacciones'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {/* Botón Filtros (estilo Mapas) */}
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              title={isFilterOpen ? 'Cerrar filtros' : 'Filtrar transacciones o ver papelera'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.45rem',
                borderRadius: '6px',
                backgroundColor: (isFilterOpen || hasActiveFilters) ? 'rgba(0, 151, 157, 0.16)' : 'transparent',
                color: (isFilterOpen || hasActiveFilters) ? '#00979d' : '#5c4436',
                border: (isFilterOpen || hasActiveFilters) ? '1px solid #00979d' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <Filter size={24} />
              {hasActiveFilters && (
                <span style={{
                  position: 'absolute',
                  top: '3px',
                  right: '3px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: filterCategory === 'TRASH' ? '#ef4444' : '#00979d',
                  boxShadow: '0 0 0 2px #f1ebe6'
                }} />
              )}
            </button>
          </div>
        </div>

        {/* Chips de filtros activos */}
        {hasActiveFilters && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '0.9rem',
            padding: '0.6rem 0.8rem',
            backgroundColor: 'rgba(0, 151, 157, 0.08)',
            borderRadius: '8px',
            border: '1px solid rgba(0, 151, 157, 0.2)'
          }}>
            <span style={{ fontSize: '0.78rem', color: '#00979d', fontWeight: 600 }}>Filtros activos:</span>
            {filterCategory === 'Gasto' && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#dc2626',
                fontWeight: 600,
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                Categoría: Gasto
                <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterCategory('ALL')} />
              </span>
            )}
            {filterCategory === 'Retiro' && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#059669',
                fontWeight: 600,
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                Categoría: Ingreso
                <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterCategory('ALL')} />
              </span>
            )}
            {filterCategory === 'TRASH' && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#dc2626',
                fontWeight: 700,
                border: '1px solid rgba(239, 68, 68, 0.45)'
              }}>
                <Trash2 size={13} />
                Papelera (Eliminadas)
                <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterCategory('ALL')} />
              </span>
            )}
            {filterCategory === 'ALL_WITH_TRASH' && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                backgroundColor: 'rgba(148, 163, 184, 0.18)',
                color: '#475569',
                fontWeight: 600,
                border: '1px solid rgba(148, 163, 184, 0.35)'
              }}>
                Todas (con Papelera)
                <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterCategory('ALL')} />
              </span>
            )}
            {filterUser !== 'ALL' && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                backgroundColor: 'rgba(0, 151, 157, 0.15)',
                color: '#007a7f',
                fontWeight: 600,
                border: '1px solid rgba(0, 151, 157, 0.3)'
              }}>
                Usuario: {filterUser}
                <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterUser('ALL')} />
              </span>
            )}
            {filterSearchTerm.trim() !== '' && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                color: '#4338ca',
                fontWeight: 600,
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}>
                "{filterSearchTerm}"
                <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterSearchTerm('')} />
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setFilterCategory('ALL');
                setFilterUser('ALL');
                setFilterSearchTerm('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#5c4436',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                marginLeft: 'auto'
              }}
            >
              Limpiar todos
            </button>
          </div>
        )}

        {/* Lista estética de transacciones dentro del mismo div marrón claro */}
        {!selectedRecord ? (
          displayRecords.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '1.6rem 1rem 1.8rem 1rem',
              color: '#5c4436',
            }}>
              <div style={{ fontSize: '2.1rem', marginBottom: '0.45rem' }}>
                {filterCategory === 'TRASH' ? '🗑️' : '🍃'}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#2b1d14' }}>
                {filterCategory === 'TRASH' ? 'La papelera está vacía' : 'No hay transacciones'}
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: '#5c4436' }}>
                {filterCategory === 'TRASH'
                  ? 'No hay movimientos eliminados actualmente.'
                  : (hasActiveFilters ? 'No se encontraron resultados con los filtros aplicados.' : 'No se han registrado movimientos todavía.')}
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterCategory('ALL');
                    setFilterUser('ALL');
                    setFilterSearchTerm('');
                  }}
                  style={{
                    marginTop: '1rem',
                    padding: '0.5rem 1.2rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Restablecer Filtros
                </button>
              )}
            </div>
          ) : (
            <div>
              {displayRecords.map((r, i) => renderItem(r, i, displayRecords.length))}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(() => {
              const selectedIdx = displayRecords.findIndex(r => r.TransactionID === selectedRecord.TransactionID);
              if (selectedIdx === -1) {
                return (
                  <>
                    {renderEditForm()}
                    {displayRecords.length > 0 && (
                      <div>
                        {displayRecords.map((r, i) => renderItem(r, i, displayRecords.length))}
                      </div>
                    )}
                  </>
                );
              }
              const before = displayRecords.slice(0, selectedIdx);
              const after = displayRecords.slice(selectedIdx + 1);
              return (
                <>
                  {before.length > 0 && (
                    <div>
                      {before.map((r, i) => renderItem(r, i, before.length))}
                    </div>
                  )}

                  {renderEditForm()}

                  {after.length > 0 && (
                    <div>
                      {after.map((r, i) => renderItem(r, i, after.length))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Panel de Filtros estilo Mapas (Overlay Slide-in) */}
      {isFilterOpen && createPortal((
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 3500,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'stretch'
          }}
          onClick={() => setIsFilterOpen(false)}
        >
          <div
            style={{
              width: '320px',
              maxWidth: '85vw',
              backgroundColor: '#ffffff',
              color: '#1e293b',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              boxShadow: '-4px 0 25px rgba(0,0,0,0.3)',
              animation: 'slideInFromRight 0.22s ease-out'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header del Panel */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={18} color="#00979d" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                  Filtros de Transacciones
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '4px',
                  display: 'flex',
                  borderRadius: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Acciones Rápidas */}
            <div style={{
              display: 'flex',
              gap: '8px',
              padding: '10px 16px',
              borderBottom: '1px solid #f1f5f9',
              backgroundColor: '#ffffff'
            }}>
              <button
                type="button"
                onClick={() => {
                  setFilterCategory('ALL');
                  setFilterUser('ALL');
                  setFilterSearchTerm('');
                }}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Limpiar Filtros
              </button>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Sección 1: Filtrar por Nombre / Concepto */}
              <div>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  Buscar por Nombre / Concepto
                </span>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Ej. riego, Ariel, ferretería..."
                    value={filterSearchTerm}
                    onChange={e => setFilterSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      paddingRight: filterSearchTerm ? '32px' : '12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      color: '#1e293b',
                      backgroundColor: '#f8fafc',
                      outline: 'none'
                    }}
                  />
                  {filterSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setFilterSearchTerm('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Sección 2: Categoría de Transacción y Papelera */}
              <div>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  Categoría y Estado
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Todas (Activas) */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: filterCategory === 'ALL' ? 'rgba(0, 151, 157, 0.1)' : '#f8fafc',
                    border: filterCategory === 'ALL' ? '1px solid #00979d' : '1px solid #e2e8f0',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="filterCategory"
                        checked={filterCategory === 'ALL'}
                        onChange={() => setFilterCategory('ALL')}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>Todas (Activas)</span>
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      backgroundColor: '#e2e8f0',
                      color: '#475569',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontWeight: 600
                    }}>
                      {records.filter(r => r.status === 'ACTIVE').length}
                    </span>
                  </label>

                  {/* Gastos */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: filterCategory === 'Gasto' ? 'rgba(239, 68, 68, 0.08)' : '#f8fafc',
                    border: filterCategory === 'Gasto' ? '1px solid #ef4444' : '1px solid #e2e8f0',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="filterCategory"
                        checked={filterCategory === 'Gasto'}
                        onChange={() => setFilterCategory('Gasto')}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#b91c1c' }}>Gasto</span>
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      backgroundColor: '#fee2e2',
                      color: '#991b1b',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontWeight: 600
                    }}>
                      {records.filter(r => r.status === 'ACTIVE' && r.Category === 'Gasto').length}
                    </span>
                  </label>

                  {/* Ingresos */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: filterCategory === 'Retiro' ? 'rgba(16, 185, 129, 0.08)' : '#f8fafc',
                    border: filterCategory === 'Retiro' ? '1px solid #10b981' : '1px solid #e2e8f0',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="filterCategory"
                        checked={filterCategory === 'Retiro'}
                        onChange={() => setFilterCategory('Retiro')}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#047857' }}>Ingreso</span>
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      backgroundColor: '#d1fae5',
                      color: '#065f46',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontWeight: 600
                    }}>
                      {records.filter(r => r.status === 'ACTIVE' && r.Category === 'Retiro').length}
                    </span>
                  </label>

                  {/* Papelera (Eliminadas) */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: filterCategory === 'TRASH' ? 'rgba(239, 68, 68, 0.12)' : '#f8fafc',
                    border: filterCategory === 'TRASH' ? '1px solid #ef4444' : '1px solid #e2e8f0',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="filterCategory"
                        checked={filterCategory === 'TRASH'}
                        onChange={() => setFilterCategory('TRASH')}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Trash2 size={15} color="#ef4444" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b91c1c' }}>Papelera (Eliminadas)</span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      backgroundColor: '#fee2e2',
                      color: '#991b1b',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontWeight: 700
                    }}>
                      {records.filter(r => r.status === 'DELETED').length}
                    </span>
                  </label>

                  {/* Todas (con Papelera) */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: filterCategory === 'ALL_WITH_TRASH' ? 'rgba(100, 116, 139, 0.12)' : '#f8fafc',
                    border: filterCategory === 'ALL_WITH_TRASH' ? '1px solid #64748b' : '1px solid #e2e8f0',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="filterCategory"
                        checked={filterCategory === 'ALL_WITH_TRASH'}
                        onChange={() => setFilterCategory('ALL_WITH_TRASH')}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>Todas (con Papelera)</span>
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontWeight: 600
                    }}>
                      {records.length}
                    </span>
                  </label>
                </div>
              </div>

              {/* Sección 3: Filtrar por Nombre de Socio */}
              <div>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  Filtrar por Socio
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    backgroundColor: filterUser === 'ALL' ? 'rgba(0, 151, 157, 0.1)' : '#f8fafc',
                    border: filterUser === 'ALL' ? '1px solid #00979d' : '1px solid #e2e8f0',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="filterUser"
                        checked={filterUser === 'ALL'}
                        onChange={() => setFilterUser('ALL')}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>Todos los socios</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                      {records.filter(r => (filterCategory === 'TRASH' ? r.status === 'DELETED' : (filterCategory === 'ALL_WITH_TRASH' ? true : r.status === 'ACTIVE'))).length}
                    </span>
                  </label>

                  {(users || []).map(u => {
                    const count = records.filter(r => r.User === u.name && (filterCategory === 'TRASH' ? r.status === 'DELETED' : (filterCategory === 'ALL_WITH_TRASH' ? true : r.status === 'ACTIVE'))).length;
                    const isSelected = filterUser === u.name;
                    return (
                      <label key={u.id || u.name} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        backgroundColor: isSelected ? 'rgba(0, 151, 157, 0.1)' : '#f8fafc',
                        border: isSelected ? '1px solid #00979d' : '1px solid #e2e8f0',
                        cursor: 'pointer'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="radio"
                            name="filterUser"
                            checked={isSelected}
                            onChange={() => setFilterUser(u.name)}
                          />
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>{u.name}</span>
                        </div>
                        <span style={{
                          fontSize: '0.72rem',
                          backgroundColor: isSelected ? '#ccfbf1' : '#e2e8f0',
                          color: isSelected ? '#0f766e' : '#64748b',
                          padding: '2px 7px',
                          borderRadius: '10px',
                          fontWeight: 600
                        }}>
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer del Panel */}
            <div style={{
              marginTop: 'auto',
              padding: '14px 16px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              position: 'sticky',
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                {displayRecords.length} transacciones
              </span>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#00979d',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Aplicar / Cerrar
              </button>
            </div>
          </div>
        </div>
      ), document.body)}


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

      {/* Barra fija inferior de Chat IA para Gasto-Ingreso */}
      <SectionChatIA
        section="gasto-ingreso"
        contextData={{
          records,
          finances,
          users,
          currentUser,
        }}
        onRefresh={refetchTransactions}
        onSelectResultItem={(r) => {
          if (!r) return;
          setSelectedRecord(r);
          setEditForm({
            amount: Math.abs(r.Amount),
            desc: r.Description || '',
            user: r.User || '',
            type: r.Category === 'Retiro' ? 'Retiro' : 'Gasto',
            image: null,
            currentImage: r.Imagen || null,
          });
          setIsConfirmingDelete(false);
          setEditErrors({});
          setTimeout(() => {
            const el = document.getElementById('edit-tx-form');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
        }}
      />
    </div>
  );
}
