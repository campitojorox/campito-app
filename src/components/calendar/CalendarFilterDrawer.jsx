// src/components/calendar/CalendarFilterDrawer.jsx
import FilterDrawerShell from '../common/FilterDrawerShell';
import { matchesCalendarCategory, matchesCalendarUser } from '../../services/calendarService';

const CATEGORY_OPTIONS = [
  { key: 'RIEGO', label: 'Riego', color: '#38bdf8', variantClass: 'filter-drawer-option--sky' },
  { key: 'MANTENIMIENTO', label: 'Mant.', color: '#10b981', variantClass: 'filter-drawer-option--emerald' },
  { key: 'OTRO', label: 'Otro', color: '#8884d8', variantClass: 'filter-drawer-option--violet' },
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

  return (
    <FilterDrawerShell
      isOpen={isFilterOpen}
      onClose={() => setIsFilterOpen(false)}
      drawerId="calendar-filter-drawer"
      title="Filtros"
      footer={`${filteredEventsCount} ${filteredEventsCount === 1 ? 'registro' : 'registros'}`}
    >
      <div id="calendar-filter-section-dates">
        <span className="filter-drawer-section-label">Fechas</span>
        <div className="filter-drawer-list">
          {dateOptions.map((opt) => {
            const isSelected = filterDateRange === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => (opt.key === 'DAY' ? setFilterDateRange('DAY') : toggleDateRange(opt.key))}
                className={`filter-drawer-option ${isSelected ? 'is-active' : ''}`}
              >
                <span className="filter-drawer-option-label">{opt.label}</span>
                <span className="filter-drawer-badge">{opt.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="calendar-filter-section-categories">
        <span className="filter-drawer-section-label">Categorías</span>
        <div className="filter-drawer-list">
          {CATEGORY_OPTIONS.map((cat) => {
            const isSelected = filterCategory === cat.key;
            const count = allEvents.filter((ev) => matchesCalendarCategory(ev, cat.key)).length;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => toggleCategory(cat.key)}
                className={`filter-drawer-option ${cat.variantClass} ${isSelected ? 'is-active' : ''}`}
              >
                <span className="filter-drawer-option-label">
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: cat.color, flexShrink: 0 }} />
                  <span>{cat.label}</span>
                </span>
                <span className="filter-drawer-badge">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="calendar-filter-section-users">
        <span className="filter-drawer-section-label">Usuario</span>
        <div className="filter-drawer-list">
          {(users || []).map((u) => {
            const isSelected = filterUser === u.name;
            const count = allEvents.filter((ev) => matchesCalendarUser(ev, u.name)).length;
            return (
              <button
                key={u.id || u.name}
                type="button"
                onClick={() => toggleUser(u.name)}
                className={`filter-drawer-option ${isSelected ? 'is-active' : ''}`}
              >
                <span className="filter-drawer-option-label">{u.name}</span>
                <span className="filter-drawer-badge">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </FilterDrawerShell>
  );
}
