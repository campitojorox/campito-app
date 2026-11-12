// src/components/finances/AddTransactionForm.jsx
import { Euro, AlignLeft, FileText, X } from 'lucide-react';

export default function AddTransactionForm({
  isAddFormOpen,
  setIsAddFormOpen,
  users,
  user,
  setUser,
  amount,
  setAmount,
  type,
  setType,
  description,
  setDescription,
  image,
  setImage,
  formErrors,
  setFormErrors,
  loading,
  handleAdd,
}) {
  if (!isAddFormOpen) return null;

  return (
    <div
      className="form-container"
      style={{
        padding: '1.25rem',
        marginTop: '0.65rem',
        marginBottom: '1rem',
        border: '1px solid #efeae4',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.15rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#000000', fontWeight: 'bold' }}>
          Agregar Movimiento
        </h2>
        <button
          type="button"
          onClick={() => setIsAddFormOpen(false)}
          aria-label="Cerrar formulario"
          title="Cerrar formulario"
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div>
          {formErrors.general && (
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
              <span>⚠️ {formErrors.general}</span>
            </div>
          )}

          <form onSubmit={handleAdd}>
            <div className="form-group" style={{ padding: 0, marginBottom: '0.9rem' }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'nowrap',
                  gap: '0.35rem',
                  width: '100%',
                  borderRadius: '14px',
                  border: formErrors.user ? '1.5px dashed var(--danger)' : '1.5px solid transparent',
                  padding: formErrors.user ? '4px' : '0',
                }}
              >
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setUser(u.name);
                      setFormErrors((prev) => ({ ...prev, user: null, general: null }));
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: '42px',
                      padding: '0.5rem 0.2rem',
                      borderRadius: '10px',
                      border: user === u.name ? '2px solid #74c474' : '2px solid transparent',
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
                      justifyContent: 'center',
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
                      setFormErrors((prev) => ({ ...prev, amount: null, general: null }));
                    }}
                    placeholder="Cantidad"
                    style={{
                      padding: '0.65rem 0.45rem 0.65rem 2.1rem',
                      width: '100%',
                      height: '48px',
                      minHeight: '48px',
                      fontSize: '0.95rem',
                      borderRadius: '10px',
                      border: formErrors.amount ? '1.5px solid var(--danger)' : undefined,
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setType('Gasto');
                  setFormErrors((prev) => ({ ...prev, type: null, general: null }));
                }}
                style={{
                  flex: '0.95 1 0',
                  minWidth: 0,
                  minHeight: '48px',
                  padding: '0.45rem 0.35rem',
                  borderRadius: '10px',
                  border:
                    formErrors.type && !type
                      ? '1.5px dashed var(--danger)'
                      : type === 'Gasto'
                        ? '2px solid #74c474'
                        : '2px solid transparent',
                  backgroundColor: type === 'Gasto' ? '#9edb9e' : 'var(--primary)',
                  color: type === 'Gasto' ? '#1a1a1a' : 'white',
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
                  setType('Retiro');
                  setFormErrors((prev) => ({ ...prev, type: null, general: null }));
                }}
                style={{
                  flex: '0.95 1 0',
                  minWidth: 0,
                  minHeight: '48px',
                  padding: '0.45rem 0.35rem',
                  borderRadius: '10px',
                  border:
                    formErrors.type && !type
                      ? '1.5px dashed var(--danger)'
                      : type === 'Retiro'
                        ? '2px solid #74c474'
                        : '2px solid transparent',
                  backgroundColor: type === 'Retiro' ? '#9edb9e' : 'var(--primary)',
                  color: type === 'Retiro' ? '#1a1a1a' : 'white',
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
            {(formErrors.amount || formErrors.type) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                {formErrors.amount ? (
                  <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '500' }}>* {formErrors.amount}</span>
                ) : (
                  <span />
                )}
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
                    setFormErrors((prev) => ({ ...prev, description: null, general: null }));
                  }}
                  placeholder="Descripción / Concepto"
                  style={{
                    height: '48px',
                    borderRadius: '10px',
                    fontSize: '0.95rem',
                    border: formErrors.description ? '1.5px solid var(--danger)' : undefined,
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
              <label
                style={{
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
                  overflow: 'hidden',
                }}
              >
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setImage(null);
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
                    <FileText size={20} color="#00979d" />
                    <span style={{ fontSize: '0.92rem', fontWeight: '600' }}>Subir justificante</span>
                  </>
                )}
                <input type="file" accept="*/*" style={{ display: 'none' }} onChange={(e) => setImage(e.target.files[0])} />
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
    </div>
  );
}

