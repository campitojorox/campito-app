// src/components/SectionIaResultCard.jsx
import { X, FileText } from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import { styles } from './sectionChatStyles';

function formatDateDDMMYY(dateStr) {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0].split(' ')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
  }
  return datePart;
}

export default function SectionIaResultCard({
  iaResultCard,
  section,
  onClose,
  onSelectResultItem,
  getEventColor,
}) {
  if (!iaResultCard) return null;

  return (
    <div style={styles.responseCard}>
      <div style={styles.cardHeaderRow}>
        <span style={styles.cardTitle}>{iaResultCard.title}</span>
        <div style={styles.cardHeaderRight}>
          <span style={styles.cardCategoryBadge}>
            {section === 'calendario' ? 'CALENDARIO' : 'CONTABILIDAD'}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={styles.cardCloseBtn}
            title="Cerrar resultado"
            aria-label="Cerrar resultado"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {iaResultCard.transcription && (
        <div style={styles.transcriptionBox}>🎙️ "{iaResultCard.transcription}"</div>
      )}

      {iaResultCard.summary && <p style={styles.summaryText}>{iaResultCard.summary}</p>}

      {iaResultCard.section === 'calendario' && iaResultCard.events?.length > 0 && (
        <div style={styles.whiteRoundedTable}>
          {iaResultCard.events.map((ev, idx) => {
            const evColor = getEventColor(ev.Category);
            const startT = ev['Start Time'] ? ev['Start Time'].substring(0, 5) : '';
            const endT = ev['End Time'] ? ev['End Time'].substring(0, 5) : '';
            const timeRange = startT && endT ? `${startT} - ${endT}` : startT || 'Todo el día';
            return (
              <div
                key={ev.EventID || idx}
                onClick={() => onSelectResultItem && onSelectResultItem(ev)}
                style={{
                  ...styles.compactRow,
                  borderBottom: idx < iaResultCard.events.length - 1 ? '1px solid #e2e8f0' : 'none',
                }}
              >
                <div style={styles.rowLeft}>
                  <div style={styles.rowLeftTop}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: evColor,
                        flexShrink: 0,
                      }}
                    />
                    <span style={styles.rowPrimaryLabel}>{ev.Category || 'Evento'}</span>
                    <span style={styles.rowDateLabel}>{formatDateDDMMYY(ev.Date)}</span>
                  </div>
                  <span style={styles.rowSubText}>{ev.Info || 'Sin detalles adicionales'}</span>
                </div>

                <div style={styles.rowRight}>
                  <div style={styles.rowRightTop}>{timeRange}</div>
                  <div style={styles.rowRightBottom}>{ev.Responsible || 'Sin asignar'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {iaResultCard.section === 'gasto-ingreso' &&
        iaResultCard.showBalancesTable &&
        iaResultCard.finances?.length > 0 && (
          <div style={styles.whiteRoundedTable}>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.financeMiniTable}>
                <thead>
                  <tr>
                    <th style={styles.financeTh}>Socio</th>
                    <th style={{ ...styles.financeTh, textAlign: 'right' }}>Gasto</th>
                    <th style={{ ...styles.financeTh, textAlign: 'right' }}>Ingreso</th>
                    <th style={{ ...styles.financeTh, textAlign: 'right' }}>Balance</th>
                    <th style={{ ...styles.financeTh, textAlign: 'right' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {iaResultCard.finances.map((f, idx) => (
                    <tr key={f.user || idx}>
                      <td style={{ ...styles.financeTd, fontWeight: 700, color: '#0f172a' }}>{f.user}</td>
                      <td style={{ ...styles.financeTd, textAlign: 'right', color: '#475569' }}>
                        {formatCurrency(f.gasto)}
                      </td>
                      <td style={{ ...styles.financeTd, textAlign: 'right', color: '#166534' }}>
                        {formatCurrency(f.venta)}
                      </td>
                      <td
                        style={{
                          ...styles.financeTd,
                          textAlign: 'right',
                          fontWeight: 700,
                          color: f.balance < 0 ? '#991b1b' : '#14532d',
                        }}
                      >
                        {formatCurrency(f.balance)}
                      </td>
                      <td style={{ ...styles.financeTd, textAlign: 'right' }}>
                        {f.diferencia === 0 ? (
                          <span style={styles.pillOk}>✓ Al día</span>
                        ) : (
                          <span style={styles.pillDiff}>{formatCurrency(f.diferencia)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={styles.communityBalanceFooter}>
              <span>Balance Total Comunidad:</span>
              <strong>
                {formatCurrency(iaResultCard.finances.reduce((acc, f) => acc + (f.balance || 0), 0))}
              </strong>
            </div>
          </div>
        )}

      {iaResultCard.section === 'gasto-ingreso' &&
        iaResultCard.customTable &&
        Array.isArray(iaResultCard.customTable.headers) &&
        Array.isArray(iaResultCard.customTable.rows) && (
          <div style={styles.whiteRoundedTable}>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.financeMiniTable}>
                <thead>
                  <tr>
                    {iaResultCard.customTable.headers.map((h, i) => (
                      <th key={i} style={styles.financeTh}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {iaResultCard.customTable.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={styles.financeTd}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {iaResultCard.section === 'gasto-ingreso' && iaResultCard.transactions?.length > 0 && (
        <div style={styles.whiteRoundedTable}>
          {iaResultCard.transactions.map((r, idx) => {
            const isRetiro = r.Category === 'Retiro';
            const isDeleted = r.status === 'DELETED';
            const amtColor = isDeleted ? '#ef4444' : isRetiro ? '#16a34a' : '#475569';
            return (
              <div
                key={r.TransactionID || idx}
                onClick={() => onSelectResultItem && onSelectResultItem(r)}
                style={{
                  ...styles.compactRow,
                  borderBottom: idx < iaResultCard.transactions.length - 1 ? '1px solid #e2e8f0' : 'none',
                }}
              >
                <div style={styles.rowLeft}>
                  <div style={styles.rowLeftTop}>
                    <span style={{ ...styles.rowPrimaryLabel, color: isDeleted ? '#ef4444' : '#0f172a' }}>
                      {r.User}
                    </span>
                    <span style={styles.rowDateLabel}>{r.Date ? r.Date.split(' ')[0] : ''}</span>
                    {r.Imagen && (
                      <span title="Justificante adjunto" style={{ display: 'inline-flex', color: '#64748b' }}>
                        <FileText size={13} />
                      </span>
                    )}
                  </div>
                  {r.Description && <span style={styles.rowSubText}>{r.Description}</span>}
                </div>

                <div style={styles.rowRight}>
                  <div style={{ ...styles.rowRightTop, color: amtColor }}>
                    {formatCurrency(Math.abs(r.Amount || 0))}
                  </div>
                  <div style={{ ...styles.rowRightBottom, color: amtColor }}>
                    {isRetiro ? 'INGRESO' : 'GASTO'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

