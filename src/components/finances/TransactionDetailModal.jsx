// src/components/finances/TransactionDetailModal.jsx
import { Euro, AlignLeft, FileText, RotateCcw } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function TransactionDetailModal({
  selectedRecord,
  setSelectedRecord,
  users,
  editForm,
  setEditForm,
  editErrors,
  setEditErrors,
  isConfirmingDelete,
  setIsConfirmingDelete,
  isConfirmingImageDelete,
  setIsConfirmingImageDelete,
  setExpandedImage,
  refetchTransactions,
}) {
  if (!selectedRecord) return null;

  return (
    <div
      id="edit-tx-form"
      className="form-container"
      style={{ position: 'relative', width: '100%', textAlign: 'left', padding: '1.35rem', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {isConfirmingDelete && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1100,
            padding: '1.5rem',
          }}
        >
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', border: '1px solid var(--danger)' }}>
            <h4 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
              ¿Seguro que deseas eliminar esta transacción?
            </h4>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="btn"
                style={{ flex: 1, backgroundColor: 'var(--surface)', color: 'white', border: '1px solid var(--border)', margin: 0 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { error: delError } = await supabase
                    .from('transactions')
                    .update({
                      status: 'DELETED',
                      deleted_at: new Date().toISOString(),
                    })
                    .eq('id', selectedRecord.TransactionID);

                  if (delError) {
                    console.warn('Soft delete no disponible, ejecutando borrado directo:', delError);
                    await supabase.from('transactions').delete().eq('id', selectedRecord.TransactionID);
                  }

                  refetchTransactions();
                  setSelectedRecord(null);
                  setIsConfirmingDelete(false);
                }}
                className="btn"
                style={{ flex: 1, backgroundColor: 'var(--danger)', color: 'white', border: 'none', margin: 0 }}
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmingImageDelete && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1100,
            padding: '1.5rem',
          }}
        >
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', border: '1px solid var(--danger)' }}>
            <h4 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
              ¿Seguro que deseas borrar permanentemente este justificante?
            </h4>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => setIsConfirmingImageDelete(false)}
                className="btn"
                style={{ flex: 1, backgroundColor: 'var(--surface)', color: 'white', border: '1px solid var(--border)', margin: 0 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditForm({ ...editForm, currentImage: null, image: null });
                  setIsConfirmingImageDelete(false);
                }}
                className="btn"
                style={{ flex: 1, backgroundColor: 'var(--danger)', color: 'white', border: 'none', margin: 0 }}
              >
                Sí, Borrar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0, marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', color: selectedRecord?.status === 'DELETED' ? '#ef4444' : '#000000', fontWeight: 'bold' }}>
          {selectedRecord?.status === 'DELETED' ? 'Transacción Eliminada' : 'Editar Transacción'}
        </h2>
        <button
          type="button"
          onClick={() => {
            setSelectedRecord(null);
            setEditErrors({});
          }}
          style={{ background: 'none', border: 'none', color: '#000000', cursor: 'pointer', fontSize: '1.8rem', padding: 0, lineHeight: 1 }}
        >
          &times;
        </button>
      </div>

      {editErrors.general && (
        <div
          style={{
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
            gap: '0.5rem',
          }}
        >
          <span>⚠️ {editErrors.general}</span>
        </div>
      )}

      <div style={{ color: 'var(--text-primary)' }}>
        <div className="form-group" style={{ padding: 0, marginBottom: '0.9rem' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: '0.35rem',
              width: '100%',
              borderRadius: '14px',
              border: editErrors.user ? '1.5px dashed var(--danger)' : '1.5px solid transparent',
              padding: editErrors.user ? '4px' : '0',
            }}
          >
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setEditForm({ ...editForm, user: u.name });
                  setEditErrors((prev) => ({ ...prev, user: null, general: null }));
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: '42px',
                  padding: '0.5rem 0.2rem',
                  borderRadius: '10px',
                  border: editForm.user === u.name ? '2px solid #74c474' : '2px solid transparent',
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
                  justifyContent: 'center',
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
                  setEditForm({ ...editForm, amount: e.target.value });
                  setEditErrors((prev) => ({ ...prev, amount: null, general: null }));
                }}
                placeholder="Cantidad"
                style={{
                  padding: '0.65rem 0.45rem 0.65rem 2.1rem',
                  width: '100%',
                  height: '48px',
                  minHeight: '48px',
                  fontSize: '0.95rem',
                  borderRadius: '10px',
                  border: editErrors.amount ? '1.5px solid var(--danger)' : undefined,
                }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditForm({ ...editForm, type: 'Gasto' });
              setEditErrors((prev) => ({ ...prev, type: null, general: null }));
            }}
            style={{
              flex: '0.95 1 0',
              minWidth: 0,
              minHeight: '48px',
              padding: '0.45rem 0.35rem',
              borderRadius: '10px',
              border:
                editErrors.type && !editForm.type
                  ? '1.5px dashed var(--danger)'
                  : editForm.type === 'Gasto'
                    ? '2px solid #74c474'
                    : '2px solid transparent',
              backgroundColor: editForm.type === 'Gasto' ? '#9edb9e' : 'var(--primary)',
              color: editForm.type === 'Gasto' ? '#1a1a1a' : 'white',
              fontWeight: '600',
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1.15,
            }}
          >
            <span>Gasto</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>(invertido)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditForm({ ...editForm, type: 'Retiro' });
              setEditErrors((prev) => ({ ...prev, type: null, general: null }));
            }}
            style={{
              flex: '0.95 1 0',
              minWidth: 0,
              minHeight: '48px',
              padding: '0.45rem 0.35rem',
              borderRadius: '10px',
              border:
                editErrors.type && !editForm.type
                  ? '1.5px dashed var(--danger)'
                  : editForm.type === 'Retiro'
                    ? '2px solid #74c474'
                    : '2px solid transparent',
              backgroundColor: editForm.type === 'Retiro' ? '#9edb9e' : 'var(--primary)',
              color: editForm.type === 'Retiro' ? '#1a1a1a' : 'white',
              fontWeight: '600',
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1.15,
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
            ) : (
              <span />
            )}
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
                setEditForm({ ...editForm, desc: e.target.value });
                setEditErrors((prev) => ({ ...prev, description: null, general: null }));
              }}
              placeholder="Descripción / Concepto"
              style={{
                height: '48px',
                borderRadius: '10px',
                fontSize: '0.95rem',
                border: editErrors.description ? '1.5px solid var(--danger)' : undefined,
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
          <label
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              minHeight: '48px',
              padding: editForm.currentImage || editForm.image ? '0' : '0.65rem 1rem',
              border: '1.5px solid #cbd5e1',
              borderRadius: '10px',
              backgroundColor: '#f8fafc',
              cursor: 'pointer',
              color: '#1e293b',
              overflow: 'hidden',
            }}
          >
            {editForm.currentImage || editForm.image ? (
              <div style={{ position: 'relative', width: '100%' }}>
                {(() => {
                  const targetSrc = editForm.image ? URL.createObjectURL(editForm.image) : editForm.currentImage;
                  const isPdf =
                    (editForm.image && editForm.image.type === 'application/pdf') ||
                    (typeof targetSrc === 'string' && targetSrc.toLowerCase().includes('.pdf'));
                  if (isPdf) {
                    return (
                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          window.open(targetSrc, '_blank');
                        }}
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
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--danger)',
                    color: 'white',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '1.2rem',
                    paddingBottom: '3px',
                    zIndex: 10,
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
            <input type="file" accept="*/*" style={{ display: 'none' }} onChange={(e) => setEditForm({ ...editForm, image: e.target.files[0] })} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.35rem' }}>
          <button
            type="button"
            onClick={async () => {
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

              const respUser = users.find((u) => u.name === editForm.user);
              const userId = respUser ? respUser.id : null;

              await supabase
                .from('transactions')
                .update({
                  amount: finalAmount,
                  type: editForm.type,
                  description: editForm.desc,
                  user_id: userId,
                  image_url: imageUrl,
                })
                .eq('id', selectedRecord.TransactionID);

              refetchTransactions();
              setSelectedRecord(null);
            }}
            className="btn btn-primary"
            style={{ flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700 }}
          >
            Guardar / Cerrar
          </button>

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
              style={{
                flex: 1,
                margin: 0,
                minHeight: '46px',
                padding: '0.65rem 0',
                borderRadius: '10px',
                fontSize: '0.95rem',
                backgroundColor: '#10b981',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                border: 'none',
                fontWeight: 'bold',
              }}
            >
              <RotateCcw size={18} />
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              className="btn"
              style={{ flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700, backgroundColor: 'var(--danger)', color: 'white' }}
            >
              Borrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

