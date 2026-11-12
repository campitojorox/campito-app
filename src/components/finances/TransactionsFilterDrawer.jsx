// src/components/finances/TransactionsFilterDrawer.jsx
import { createPortal } from 'react-dom';
import { Filter, X } from 'lucide-react';

export default function TransactionsFilterDrawer({
  isFilterOpen,
  setIsFilterOpen,
  filterCategory,
  setFilterCategory,
  filterUser,
  setFilterUser,
  records,
  users,
  displayRecordsCount,
}) {
  if (!isFilterOpen) return null;

  const activeRecords = (records || []).filter((r) => r.status === 'ACTIVE');
  const gastoCount = activeRecords.filter((r) => r.Category === 'Gasto').length;
  const ingresoCount = activeRecords.filter((r) => r.Category === 'Retiro').length;

  const toggleUser = (userName) => {
    setFilterUser((prev) => (prev === userName ? 'ALL' : userName));
  };

  const toggleCategory = (category) => {
    setFilterCategory((prev) => (prev === category ? 'ALL' : category));
  };

  return createPortal(
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
        alignItems: 'stretch',
      }}
      onClick={() => setIsFilterOpen(false)}
    >
      <div
        style={{
          width: '300px',
          maxWidth: '85vw',
          backgroundColor: '#ffffff',
          color: '#1e293b',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          boxShadow: '-4px 0 25px rgba(0,0,0,0.3)',
          animation: 'slideInFromRight 0.22s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} color="#00979d" />
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
              Filtros
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsFilterOpen(false)}
            aria-label="Cerrar filtros"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px',
              display: 'flex',
              borderRadius: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#64748b',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              Usuario
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(users || []).map((u) => {
                const count = activeRecords.filter((r) => r.User === u.name).length;
                const isSelected = filterUser === u.name;
                return (
                  <button
                    key={u.id || u.name}
                    type="button"
                    onClick={() => toggleUser(u.name)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? 'rgba(0, 151, 157, 0.12)' : '#f8fafc',
                      border: isSelected ? '1px solid #00979d' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: isSelected ? '#0f766e' : '#1e293b' }}>
                      {u.name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        backgroundColor: isSelected ? '#ccfbf1' : '#e2e8f0',
                        color: isSelected ? '#0f766e' : '#64748b',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontWeight: 600,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#64748b',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              Categoría
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                type="button"
                onClick={() => toggleCategory('Gasto')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: filterCategory === 'Gasto' ? 'rgba(239, 68, 68, 0.1)' : '#f8fafc',
                  border: filterCategory === 'Gasto' ? '1px solid #ef4444' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#b91c1c' }}>Gasto</span>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  {gastoCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleCategory('Retiro')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: filterCategory === 'Retiro' ? 'rgba(16, 185, 129, 0.1)' : '#f8fafc',
                  border: filterCategory === 'Retiro' ? '1px solid #10b981' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#047857' }}>Ingreso</span>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  {ingresoCount}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            padding: '12px 16px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
            {displayRecordsCount} {displayRecordsCount === 1 ? 'transacción' : 'transacciones'}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
