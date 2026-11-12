// src/components/calendar/CalendarFilterDrawer.jsx
import { createPortal } from 'react-dom';
import { Filter, X } from 'lucide-react';
import { matchesCalendarCategory, matchesCalendarUser } from '../../services/calendarService';

const CATEGORY_OPTIONS = [
  { key: 'RIEGO', label: 'Riego', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', text: '#0369a1', badgeBg: '#e0f2fe', badgeText: '#075985' },
  { key: 'MANTENIMIENTO', label: 'Mant.', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', text: '#047857', badgeBg: '#d1fae5', badgeText: '#065f46' },
  { key: 'OTRO', label: 'Otro', color: '#8884d8', bg: 'rgba(136, 132, 216, 0.14)', text: '#5b21b6', badgeBg: '#ede9fe', badgeText: '#5b21b6' },
];

export default function CalendarFilterDrawer({
  isFilterOpen,
  setIsFilterOpen,
  filterDateRange,
  setFilterDateRange,
  filterCategory,
  setFilterCategory,
  filterUser,
  setFilterUser,
  dateRangeCounts,
  events,
  users,
  filteredEventsCount,
}) {
  if (!isFilterOpen) return null;

  const allEvents = events || [];

  const toggleDateRange = (rangeKey) => {
    setFilterDateRange((prev) => (prev === rangeKey ? 'DAY' : rangeKey));
  };

  const toggleCategory = (catKey) => {
    setFilterCategory((prev) => (prev === catKey ? 'ALL' : catKey));
  };

  const toggleUser = (userName) => {
    setFilterUser((prev) => (prev === userName ? 'ALL' : userName));
  };

  const dateOptions = [
    { key: 'DAY', label: 'Día actual', count: dateRangeCounts?.DAY ?? 0 },
    { key: 'MONTH', label: 'Mes', count: dateRangeCounts?.MONTH ?? 0 },
    { key: 'YEAR', label: 'Año', count: dateRangeCounts?.YEAR ?? 0 },
  ];

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
              Fechas
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {dateOptions.map((opt) => {
                const isSelected = filterDateRange === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => (opt.key === 'DAY' ? setFilterDateRange('DAY') : toggleDateRange(opt.key))}
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
                      {opt.label}
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
                      {opt.count}
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
              Categorías
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = filterCategory === cat.key;
                const count = allEvents.filter((ev) => matchesCalendarCategory(ev, cat.key)).length;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => toggleCategory(cat.key)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? cat.bg : '#f8fafc',
                      border: isSelected ? `1px solid ${cat.color}` : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 600, color: isSelected ? cat.text : '#1e293b' }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: cat.color, flexShrink: 0 }} />
                      {cat.label}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        backgroundColor: isSelected ? cat.badgeBg : '#e2e8f0',
                        color: isSelected ? cat.badgeText : '#64748b',
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
              Usuario
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(users || []).map((u) => {
                const isSelected = filterUser === u.name;
                const count = allEvents.filter((ev) => matchesCalendarUser(ev, u.name)).length;
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
            {filteredEventsCount} {filteredEventsCount === 1 ? 'registro' : 'registros'}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
