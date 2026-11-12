// src/components/common/FilterDrawerShell.jsx
import { createPortal } from 'react-dom';
import { Filter, X } from 'lucide-react';

export default function FilterDrawerShell({
  isOpen,
  onClose,
  drawerId,
  title = 'Filtros',
  actions = null,
  footer = null,
  children,
}) {
  if (!isOpen) return null;

  return createPortal(
    <div id={`${drawerId}-overlay`} className="filter-drawer-overlay" onClick={onClose}>
      <div id={drawerId} className="filter-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div id={`${drawerId}-header`} className="filter-drawer-header">
          <div id={`${drawerId}-title`} className="filter-drawer-title">
            <Filter size={18} color="#00979d" />
            <span>{title}</span>
          </div>
          <button
            id={`${drawerId}-close`}
            type="button"
            className="filter-drawer-close"
            onClick={onClose}
            aria-label="Cerrar filtros"
          >
            <X size={20} />
          </button>
        </div>

        {actions && (
          <div id={`${drawerId}-actions`} className="filter-drawer-actions">
            {actions}
          </div>
        )}

        <div id={`${drawerId}-body`} className="filter-drawer-body">
          {children}
        </div>

        {footer !== null && (
          <div id={`${drawerId}-footer`} className="filter-drawer-footer">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

