import { useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/helpers';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

export default function Resumen() {
  const { users, events, transactions } = useOutletContext();
  const navigate = useNavigate();

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
    const categoriesToTrack = [
      { id: 'RIEGO - La Nana', label: 'Riego', subLabel: 'La Nana', color: 'RIEGO' },
      { id: 'RIEGO - El Moro', label: 'Riego', subLabel: 'El Moro', color: 'RIEGO' },
      { id: 'MANTENIMIENTO - Poda', label: 'Mant.', subLabel: 'Poda', color: 'MANTENIMIENTO' },
      { id: 'MANTENIMIENTO - Desbroza', label: 'Mant.', subLabel: 'Desbroza', color: 'MANTENIMIENTO' },
      { id: 'MANTENIMIENTO - Fertilizado', label: 'Mant.', subLabel: 'Fertilizado', color: 'MANTENIMIENTO' },
      { id: 'MANTENIMIENTO - Fitosanitarios', label: 'Mant.', subLabel: 'Fitosanitarios', color: 'MANTENIMIENTO' }
    ];

    const latestDates = {};
    categoriesToTrack.forEach(cat => latestDates[cat.id] = null);

    (events || []).forEach(ev => {
      if (!ev.date || !latestDates.hasOwnProperty(ev.category)) return;
      const evDate = new Date(ev.date.split('T')[0]);
      
      if (latestDates[ev.category] === null || evDate > latestDates[ev.category]) {
        latestDates[ev.category] = evDate;
      }
    });

    return categoriesToTrack.map(cat => ({
      ...cat,
      dateFormatted: latestDates[cat.id] ? format(latestDates[cat.id], 'dd/MM/yyyy') : 'N/A',
      rawDate: latestDates[cat.id]
    }));
  }, [events]);

  const calendarEvents = useMemo(() => {
    return (events || []).map(ev => ({
      responsibles: ev.responsibles || [],
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
      const userEvents = calendarEvents.filter(e => e.responsibles.includes(u.name));
      const riego = userEvents.filter(e => e.Category && e.Category.startsWith('RIEGO')).length;
      const mantenimiento = userEvents.filter(e => e.Category && e.Category.startsWith('MANTENIMIENTO')).length;
      const otro = userEvents.filter(e => e.Category === 'OTRO').length;
      return { user: u.name, riego, mantenimiento, otro };
    });
  }, [users, calendarEvents]);



  return (
    <div style={{ paddingBottom: '2rem', padding: '1rem' }}>
      
      {/* Last Events Stats */}
      <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <h2 className="section-title">Gestiones Recientes</h2>
        <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          {lastEventsStats.map((stat, idx) => (
            <div 
              key={idx}
              onClick={() => stat.rawDate && navigate('/calendario', { state: { targetDate: stat.rawDate.toISOString() } })}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 calc(33.333% - 0.5rem)', minWidth: '95px', backgroundColor: categoryColors[stat.color] || 'var(--primary)', padding: '0.5rem', borderRadius: '8px', cursor: stat.rawDate ? 'pointer' : 'default', marginBottom: '0.2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
            >
              <span style={{ color: 'white', fontSize: '0.75rem', marginBottom: '0.3rem', textAlign: 'center', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontWeight: '500' }}>
                {stat.label} - {stat.subLabel}
              </span>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>{stat.dateFormatted}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: '2.5rem' }}>Eventos Calendario</h2>
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
