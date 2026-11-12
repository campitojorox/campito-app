// src/components/finances/BalancesSummary.jsx
import { formatCurrency } from '../../utils/helpers';

export default function BalancesSummary({ finances, showFinanceDetails, setShowFinanceDetails }) {
  return (
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
            transition: 'all 0.2s ease',
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
                    <span
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(43, 29, 20, 0.12)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#2b1d14',
                      }}
                    >
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
                  <span
                    style={{
                      fontWeight: 700,
                      color: f.balance < 0 ? '#991b1b' : f.balance > 0 ? '#14532d' : '#2b1d14',
                    }}
                  >
                    {formatCurrency(f.balance)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {f.diferencia === 0 ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        backgroundColor: 'rgba(20, 83, 45, 0.12)',
                        color: '#14532d',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                      }}
                    >
                      0,00 € <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>✓ Al día</span>
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        backgroundColor: 'rgba(153, 27, 27, 0.1)',
                        color: '#991b1b',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                      }}
                    >
                      {formatCurrency(f.diferencia)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: '1.2rem',
          paddingTop: '0.9rem',
          borderTop: '1px solid rgba(43, 29, 20, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          fontSize: '0.82rem',
          color: '#5c4436',
        }}
      >
        <span style={{ fontWeight: 600 }}>Balance Total Comunidad:</span>
        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#2b1d14' }}>
          {formatCurrency(finances.reduce((acc, f) => acc + f.balance, 0))}
        </span>
      </div>
    </div>
  );
}

