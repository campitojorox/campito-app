// src/components/finances/TransactionsFilterDrawer.jsx
import { createPortal } from 'react-dom';
import { Filter, X, Trash2 } from 'lucide-react';

export default function TransactionsFilterDrawer({
  isFilterOpen,
  setIsFilterOpen,
  filterCategory,
  setFilterCategory,
  filterUser,
  setFilterUser,
  filterSearchTerm,
  setFilterSearchTerm,
  records,
  users,
  displayRecordsCount,
}) {
  if (!isFilterOpen) return null;

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
          width: '320px',
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
              borderRadius: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 16px',
            borderBottom: '1px solid #f1f5f9',
            backgroundColor: '#ffffff',
          }}
        >
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
              cursor: 'pointer',
            }}
          >
            Limpiar Filtros
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
              Buscar por Nombre / Concepto
            </span>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Ej. riego, Ariel, ferretería..."
                value={filterSearchTerm}
                onChange={(e) => setFilterSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  paddingRight: filterSearchTerm ? '32px' : '12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  color: '#1e293b',
                  backgroundColor: '#f8fafc',
                  outline: 'none',
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
                    padding: 0,
                  }}
                >
                  <X size={16} />
                </button>
              )}
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
              Categoría y Estado
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: filterCategory === 'ALL' ? 'rgba(0, 151, 157, 0.1)' : '#f8fafc',
                  border: filterCategory === 'ALL' ? '1px solid #00979d' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="radio" name="filterCategory" checked={filterCategory === 'ALL'} onChange={() => setFilterCategory('ALL')} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>Todas (Activas)</span>
                </div>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#e2e8f0', color: '#475569', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                  {records.filter((r) => r.status === 'ACTIVE').length}
                </span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: filterCategory === 'Gasto' ? 'rgba(239, 68, 68, 0.08)' : '#f8fafc',
                  border: filterCategory === 'Gasto' ? '1px solid #ef4444' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="radio" name="filterCategory" checked={filterCategory === 'Gasto'} onChange={() => setFilterCategory('Gasto')} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#b91c1c' }}>Gasto</span>
                </div>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                  {records.filter((r) => r.status === 'ACTIVE' && r.Category === 'Gasto').length}
                </span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: filterCategory === 'Retiro' ? 'rgba(16, 185, 129, 0.08)' : '#f8fafc',
                  border: filterCategory === 'Retiro' ? '1px solid #10b981' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="radio" name="filterCategory" checked={filterCategory === 'Retiro'} onChange={() => setFilterCategory('Retiro')} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#047857' }}>Ingreso</span>
                </div>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#d1fae5', color: '#065f46', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                  {records.filter((r) => r.status === 'ACTIVE' && r.Category === 'Retiro').length}
                </span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: filterCategory === 'TRASH' ? 'rgba(239, 68, 68, 0.12)' : '#f8fafc',
                  border: filterCategory === 'TRASH' ? '1px solid #ef4444' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="radio" name="filterCategory" checked={filterCategory === 'TRASH'} onChange={() => setFilterCategory('TRASH')} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Trash2 size={15} color="#ef4444" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b91c1c' }}>Papelera (Eliminadas)</span>
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 7px', borderRadius: '10px', fontWeight: 700 }}>
                  {records.filter((r) => r.status === 'DELETED').length}
                </span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: filterCategory === 'ALL_WITH_TRASH' ? 'rgba(100, 116, 139, 0.12)' : '#f8fafc',
                  border: filterCategory === 'ALL_WITH_TRASH' ? '1px solid #64748b' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="radio" name="filterCategory" checked={filterCategory === 'ALL_WITH_TRASH'} onChange={() => setFilterCategory('ALL_WITH_TRASH')} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>Todas (con Papelera)</span>
                </div>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                  {records.length}
                </span>
              </label>
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
              Filtrar por Socio
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: filterUser === 'ALL' ? 'rgba(0, 151, 157, 0.1)' : '#f8fafc',
                  border: filterUser === 'ALL' ? '1px solid #00979d' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="radio" name="filterUser" checked={filterUser === 'ALL'} onChange={() => setFilterUser('ALL')} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>Todos los socios</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                  {
                    records.filter((r) =>
                      filterCategory === 'TRASH'
                        ? r.status === 'DELETED'
                        : filterCategory === 'ALL_WITH_TRASH'
                          ? true
                          : r.status === 'ACTIVE'
                    ).length
                  }
                </span>
              </label>

              {(users || []).map((u) => {
                const count = records.filter(
                  (r) =>
                    r.User === u.name &&
                    (filterCategory === 'TRASH'
                      ? r.status === 'DELETED'
                      : filterCategory === 'ALL_WITH_TRASH'
                        ? true
                        : r.status === 'ACTIVE')
                ).length;
                const isSelected = filterUser === u.name;
                return (
                  <label
                    key={u.id || u.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? 'rgba(0, 151, 157, 0.1)' : '#f8fafc',
                      border: isSelected ? '1px solid #00979d' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="radio" name="filterUser" checked={isSelected} onChange={() => setFilterUser(u.name)} />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>{u.name}</span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        backgroundColor: isSelected ? '#ccfbf1' : '#e2e8f0',
                        color: isSelected ? '#0f766e' : '#64748b',
                        padding: '2px 7px',
                        borderRadius: '10px',
                        fontWeight: 600,
                      }}
                    >
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            padding: '14px 16px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
            {displayRecordsCount} transacciones
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
              cursor: 'pointer',
            }}
          >
            Aplicar / Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

