import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { formatCurrency } from '../utils/helpers';

export default function Resumen() {
  const { users, events, transactions } = useOutletContext();

  const records = useMemo(() => {
    return (transactions || []).map(tx => ({
      TransactionID: tx.id,
      Date: tx.date.split('T')[0] + " 00:00:00",
      User: tx.profiles ? tx.profiles.name : 'Desconocido',
      Category: tx.type,
      Value: Math.abs(tx.amount),
      Amount: tx.amount,
      Description: tx.description,
      Imagen: tx.image_url
    }));
  }, [transactions]);

  const calendarEvents = useMemo(() => {
    return (events || []).map(ev => ({
      Responsible: ev.profiles ? ev.profiles.name : 'Todos',
      Category: ev.category
    }));
  }, [events]);

  const finances = useMemo(() => {
    const financesTmp = (users || []).map(u => {
      const userRecords = records.filter(r => r.User === u.name);
      const balance = userRecords.reduce((acc, r) => acc + parseFloat(r.Amount || 0), 0);
      return { user: u.name, balance };
    });
    const maxBalance = financesTmp.length > 0 ? Math.max(...financesTmp.map(f => f.balance)) : 0;
    return financesTmp.map(f => ({
      user: f.user,
      balance: f.balance,
      diferencia: f.balance - maxBalance
    }));
  }, [users, records]);

  const stats = useMemo(() => {
    return (users || []).filter(u => u.name !== 'Campito').map(u => {
      const userEvents = calendarEvents.filter(e => e.Responsible === u.name);
      const riego = userEvents.filter(e => e.Category === 'RIEGO').length;
      const mantenimiento = userEvents.filter(e => e.Category === 'MANTENIMIENTO').length;
      const otro = userEvents.filter(e => e.Category === 'OTRO').length;
      return { user: u.name, riego, mantenimiento, otro };
    });
  }, [users, calendarEvents]);



  return (
    <div style={{ paddingBottom: '2rem' }}>
      <h2 className="section-title" style={{ marginTop: '2rem' }}>Finanzas</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Diferencia</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {finances.map((f, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--text-primary)' }}>{f.user}</td>
              <td style={{ color: f.diferencia < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {formatCurrency(f.diferencia)}
              </td>
              <td style={{ color: f.balance < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {formatCurrency(f.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-title" style={{ marginTop: '2.5rem' }}>Calendario</h2>
      
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Riego</th>
              <th>Mante.</th>
              <th>Otro</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-primary)' }}>{s.user}</td>
                <td>{s.riego}</td>
                <td>{s.mantenimiento}</td>
                <td>{s.otro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}
