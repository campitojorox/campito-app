// src/components/finances/TransactionsFilterDrawer.jsx
import FilterDrawerShell from '../common/FilterDrawerShell';

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
  const activeRecords = (records || []).filter((r) => r.status === 'ACTIVE');
  const gastoCount = activeRecords.filter((r) => r.Category === 'Gasto').length;
  const ingresoCount = activeRecords.filter((r) => r.Category === 'Retiro').length;

  const toggleUser = (userName) => {
    setFilterUser((prev) => (prev === userName ? 'ALL' : userName));
  };

  const toggleCategory = (category) => {
    setFilterCategory((prev) => (prev === category ? 'ALL' : category));
  };

  return (
    <FilterDrawerShell
      isOpen={isFilterOpen}
      onClose={() => setIsFilterOpen(false)}
      drawerId="transactions-filter-drawer"
      title="Filtros"
      footer={`${displayRecordsCount} ${displayRecordsCount === 1 ? 'transacción' : 'transacciones'}`}
    >
      <div id="transactions-filter-section-users">
        <span className="filter-drawer-section-label">Usuario</span>
        <div className="filter-drawer-list">
          {(users || []).map((u) => {
            const count = activeRecords.filter((r) => r.User === u.name).length;
            const isSelected = filterUser === u.name;
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

      <div id="transactions-filter-section-categories">
        <span className="filter-drawer-section-label">Categoría</span>
        <div className="filter-drawer-list">
          <button
            type="button"
            onClick={() => toggleCategory('Gasto')}
            className={`filter-drawer-option filter-drawer-option--danger ${filterCategory === 'Gasto' ? 'is-active' : ''}`}
          >
            <span className="filter-drawer-option-label">Gasto</span>
            <span className="filter-drawer-badge">{gastoCount}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleCategory('Retiro')}
            className={`filter-drawer-option filter-drawer-option--success ${filterCategory === 'Retiro' ? 'is-active' : ''}`}
          >
            <span className="filter-drawer-option-label">Ingreso</span>
            <span className="filter-drawer-badge">{ingresoCount}</span>
          </button>
        </div>
      </div>
    </FilterDrawerShell>
  );
}
