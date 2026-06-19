import mockDb from '../data/mockDb.json';

export default function Home() {
  // Calculate Balance
  const totalBalance = mockDb.contabilidad.reduce((acc, item) => acc + (parseFloat(item.Amount) || 0), 0);

  // Get upcoming events (simple filter)
  const upcomingEvents = mockDb.calendario.slice(0, 2); // Just mock upcoming 2 for now

  return (
    <div className="container">
      <h2 style={{ marginBottom: '1rem' }}>Bienvenido</h2>
      
      <div className="card">
        <h3 style={{ marginBottom: '0.5rem', color: 'var(--success)' }}>Balance Actual</h3>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
          ${totalBalance.toFixed(2)}
        </h2>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '0.5rem', color: 'var(--primary)' }}>Próximos Eventos</h3>
        {upcomingEvents.map((ev, i) => (
          <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
            <strong>{ev.Category}</strong> - {ev.Date ? ev.Date.split(' ')[0] : ''}
            <br />
            <small style={{ color: 'var(--text-secondary)' }}>Resp: {ev.Responsible || 'Sin asignar'}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
