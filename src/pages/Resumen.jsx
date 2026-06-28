import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { formatCurrency } from '../utils/helpers';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

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

  const categoryColors = {
    'RIEGO': '#3b82f6',
    'MANTENIMIENTO': '#10b981',
  };

  const lastEventsStats = useMemo(() => {
    let lastNana = null;
    let lastMoro = null;
    let lastMant = null;

    (events || []).forEach(ev => {
      if (!ev.Date) return;
      const evDate = new Date(ev.Date.split(' ')[0]);
      
      if (ev.Category === 'RIEGO - La Nana') {
        if (!lastNana || evDate > lastNana) lastNana = evDate;
      } else if (ev.Category === 'RIEGO - El Moro') {
        if (!lastMoro || evDate > lastMoro) lastMoro = evDate;
      } else if (ev.Category === 'MANTENIMIENTO') {
        if (!lastMant || evDate > lastMant) lastMant = evDate;
      }
    });

    return {
      nanaDate: lastNana ? format(lastNana, 'dd/MM/yyyy') : 'N/A',
      moroDate: lastMoro ? format(lastMoro, 'dd/MM/yyyy') : 'N/A',
      mantDate: lastMant ? format(lastMant, 'dd/MM/yyyy') : 'N/A'
    };
  }, [events]);

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
    <div style={{ paddingBottom: '2rem', padding: '1rem' }}>
      
      {/* Last Events Stats */}
      <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <h2 className="section-title">Gestiones Recientes</h2>
        <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.2rem', textAlign: 'center' }}>La Nana</span>
            <span style={{ color: categoryColors['RIEGO'], fontWeight: 'bold', fontSize: '0.85rem' }}>{lastEventsStats.nanaDate}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.2rem', textAlign: 'center' }}>El Moro</span>
            <span style={{ color: categoryColors['RIEGO'], fontWeight: 'bold', fontSize: '0.85rem' }}>{lastEventsStats.moroDate}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.2rem', textAlign: 'center' }}>Mant.</span>
            <span style={{ color: categoryColors['MANTENIMIENTO'], fontWeight: 'bold', fontSize: '0.85rem' }}>{lastEventsStats.mantDate}</span>
          </div>
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: '2.5rem' }}>Calendario</h2>
      <div style={{ width: '100%', height: 350, backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '1rem 1rem 1rem 0', marginTop: '1rem' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
            <XAxis dataKey="user" stroke="#aaa" tick={{ fill: '#aaa' }} />
            <YAxis stroke="#aaa" tick={{ fill: '#aaa' }} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: '#222', border: '1px solid #444', borderRadius: '8px', color: '#fff' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar dataKey="riego" name="Riego" fill={categoryColors['RIEGO']} radius={[4, 4, 0, 0]} />
            <Bar dataKey="mantenimiento" name="Mantenimiento" fill={categoryColors['MANTENIMIENTO']} radius={[4, 4, 0, 0]} />
            <Bar dataKey="otro" name="Otro" fill="#8884d8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h2 className="section-title" style={{ marginTop: '2.5rem' }}>Finanzas</h2>
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
    </div>
  );
}
