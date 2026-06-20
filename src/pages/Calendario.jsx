import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../supabaseClient';
import { Plus, Calendar, Clock, Tag, User, AlignLeft } from 'lucide-react';

const categoryColors = {
  'RIEGO': '#38bdf8', // Azul claro (Tailwind sky-400)
  'MANTENIMIENTO': '#10b981', // Verde (Tailwind emerald-500)
  'OTRO': '#f97316' // Naranjo (Tailwind orange-500)
};

export default function Calendario() {
  const context = useOutletContext();
  const isSearchOpen = context?.isSearchOpen || false;
  const searchQuery = context?.searchQuery || '';
  const users = context?.users || [];

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  
  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newEndDate, setNewEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newEndTime, setNewEndTime] = useState('09:00');
  const [newCategory, setNewCategory] = useState('');
  const [newResponsible, setNewResponsible] = useState('');
  const [newInfo, setNewInfo] = useState('');

  // Keep End Date synced with Start Date if user hasn't manually changed it
  useEffect(() => {
    setNewEndDate(newDate);
  }, [newDate]);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const { data } = await supabase.from('events').select('*, profiles(name)');
    if (data) {
      const mapped = data.map(ev => ({
        EventID: ev.id,
        Date: ev.date ? (ev.date.split('T')[0] + " 00:00:00") : null,
        "End Date": ev.end_date ? (ev.end_date.split('T')[0] + " 00:00:00") : (ev.date ? (ev.date.split('T')[0] + " 00:00:00") : null),
        "Start Time": ev.start_time ? ev.start_time.substring(0,5) + ':00' : null,
        "End Time": ev.end_time ? ev.end_time.substring(0,5) + ':00' : null,
        Category: ev.category,
        Info: ev.info,
        Responsible: ev.profiles ? ev.profiles.name : 'Sin Asignar',
        responsible_id: ev.responsible_id
      }));
      setEvents(mapped);
    }
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    
    // Find responsible_id from the user's selected name (newResponsible)
    const respUser = users.find(u => u.name === newResponsible);
    const respId = respUser ? respUser.id : null;

    const payload = {
      date: newDate + "T00:00:00Z",
      end_date: newEndDate + "T00:00:00Z",
      start_time: newStartTime + ":00",
      end_time: newEndTime + ":00",
      category: newCategory,
      responsible_id: respId,
      info: newInfo
    };

    if (editingEvent) {
      await supabase.from('events').update(payload).eq('id', editingEvent.EventID);
    } else {
      await supabase.from('events').insert([payload]);
    }
    
    fetchEvents(); // Reload from DB
    setIsFormOpen(false);
    setEditingEvent(null);
  };

  const openEdit = (ev) => {
    setEditingEvent(ev);
    setNewDate(ev.Date ? ev.Date.split(' ')[0] : format(selectedDate, 'yyyy-MM-dd'));
    setNewEndDate(ev["End Date"] ? ev["End Date"].split(' ')[0] : format(selectedDate, 'yyyy-MM-dd'));
    setNewStartTime(ev["Start Time"] ? ev["Start Time"].substring(0,5) : '08:00');
    setNewEndTime(ev["End Time"] ? ev["End Time"].substring(0,5) : '09:00');
    setNewCategory(ev.Category || '');
    setNewResponsible(ev.Responsible || 'Ariel');
    setNewInfo(ev.Info || '');
    setIsFormOpen(true);
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const onDateClick = (day) => {
    setSelectedDate(day);
    setIsFormOpen(false);
    setEditingEvent(null);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const selectedDayEvents = events.filter(ev => {
    if(!ev.Date) return false;
    const startDate = new Date(ev.Date.split(' ')[0]);
    startDate.setHours(0,0,0,0);
    const endDateStr = ev["End Date"] || ev.Date;
    const endDate = new Date(endDateStr.split(' ')[0]);
    endDate.setHours(0,0,0,0);
    const currentDay = new Date(selectedDate);
    currentDay.setHours(0,0,0,0);
    return currentDay >= startDate && currentDay <= endDate;
  });

  const searchResults = events.filter(ev => {
    const q = searchQuery.toLowerCase();
    return (
      (ev.Category && ev.Category.toLowerCase().includes(q)) ||
      (ev.Info && ev.Info.toLowerCase().includes(q)) ||
      (ev.Responsible && ev.Responsible.toLowerCase().includes(q)) ||
      (ev.Date && ev.Date.toLowerCase().includes(q))
    );
  });

  const displayEvents = (isSearchOpen && searchQuery.trim() !== '') ? searchResults : selectedDayEvents;

  return (
    <div style={{ position: 'relative', minHeight: '100%', padding: '1rem' }}>
      
      {isConfirmingDelete && createPortal((
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '1.5rem'
        }}>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', maxWidth: '400px', border: '1px solid var(--danger)' }}>
            <h4 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.1rem' }}>¿Seguro que deseas borrar permanentemente este evento?</h4>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setIsConfirmingDelete(false)} className="btn" style={{ flex: 1, backgroundColor: 'var(--surface)', color: 'white', border: '1px solid var(--border)', margin: 0 }}>Cancelar</button>
              <button onClick={async () => {
                await supabase.from('events').delete().eq('id', editingEvent.EventID);
                fetchEvents();
                setIsFormOpen(false);
                setEditingEvent(null);
                setIsConfirmingDelete(false);
              }} className="btn" style={{ flex: 1, backgroundColor: 'var(--danger)', color: 'white', border: 'none', margin: 0 }}>Sí, Borrar</button>
            </div>
          </div>
        </div>
      ), document.body)}

      {isFormOpen && createPortal((
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, overflowY: 'auto', padding: '1rem'
        }}>
          <div className="card" style={{ position: 'relative', width: '100%', maxWidth: '400px', margin: '2rem auto', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: 'var(--primary)' }}>{editingEvent ? 'Editar Evento' : 'Agregar Evento'}</h3>
            <form onSubmit={handleAddEvent}>
            
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.2rem' }}>
              <div className="form-group" style={{ flex: 1, padding: 0 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', marginBottom: '0.2rem', display: 'block' }}>Inicio</label>
                <div className="input-with-icon" style={{ marginBottom: 0 }}>
                  <Calendar className="input-icon" size={18} style={{ left: '0.5rem' }} />
                  <input type="date" className="form-input" style={{ paddingLeft: '1rem', textAlign: 'center', fontSize: '0.95rem' }} required value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ flex: 1, padding: 0 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', marginBottom: '0.2rem', display: 'block' }}>Término</label>
                <div className="input-with-icon" style={{ marginBottom: 0 }}>
                  <Calendar className="input-icon" size={18} style={{ left: '0.5rem' }} />
                  <input type="date" className="form-input" style={{ paddingLeft: '1rem', textAlign: 'center', fontSize: '0.95rem' }} required value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem' }}>
              <div className="form-group" style={{ flex: 1, padding: 0 }}>
                <div className="input-with-icon" style={{ marginBottom: 0 }}>
                  <Clock className="input-icon" size={18} style={{ left: '0.5rem' }} />
                  <input type="time" className="form-input" style={{ paddingLeft: '1rem', textAlign: 'center', fontSize: '0.95rem' }} required value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ flex: 1, padding: 0 }}>
                <div className="input-with-icon" style={{ marginBottom: 0 }}>
                  <Clock className="input-icon" size={18} style={{ left: '0.5rem' }} />
                  <input type="time" className="form-input" style={{ paddingLeft: '1rem', textAlign: 'center', fontSize: '0.95rem' }} required value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="form-group" style={{ padding: 0 }}>
              <div className="input-with-icon">
                <Tag className="input-icon" size={20} />
                <select className="form-input" required value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                  <option value="" disabled>Categoría...</option>
                  <option value="RIEGO">Riego</option>
                  <option value="MANTENIMIENTO">Mantenimiento</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ padding: 0, marginTop: '1.5rem' }}>
              <div className="input-with-icon">
                <User className="input-icon" size={20} />
                <select className="form-input" value={newResponsible} onChange={(e) => setNewResponsible(e.target.value)}>
                  <option value="" disabled>Usuario...</option>
                  {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ padding: 0, marginTop: '1.5rem' }}>
              <div className="input-with-icon">
                <AlignLeft className="input-icon" size={20} />
                <input type="text" className="form-input" value={newInfo} onChange={(e) => setNewInfo(e.target.value)} placeholder="Detalles / Info" />
              </div>
            </div>
            {!editingEvent ? (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, margin: 0, padding: '0.75rem 0' }}>Agregar</button>
                <button type="button" className="btn" onClick={() => { setIsFormOpen(false); setEditingEvent(null); }} style={{ backgroundColor: 'var(--danger)', color: 'white', flex: 1, margin: 0, padding: '0.75rem 0' }}>Cancelar</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, margin: 0, padding: '0.75rem 0' }}>Guardar / Cerrar</button>
                <button type="button" onClick={(e) => { e.preventDefault(); setIsConfirmingDelete(true); }} className="btn" style={{ flex: 1, margin: 0, padding: '0.75rem 0', backgroundColor: 'var(--danger)', color: 'white' }}>Borrar</button>
              </div>
            )}
            </form>
          </div>
        </div>
      ), document.body)}

      {!(isSearchOpen && searchQuery.trim() !== '') && (
        <>
          {/* Calendar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <button onClick={prevMonth} style={{ fontSize: '1.5rem', color: 'var(--text-primary)', border: 'none', background: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', padding: '0.5rem' }}>◀</button>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
              {format(currentMonth, 'MMMM yyyy', { locale: es }).toUpperCase()}
            </h2>
            <button onClick={nextMonth} style={{ fontSize: '1.5rem', color: 'var(--text-primary)', border: 'none', background: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', padding: '0.5rem' }}>▶</button>
          </div>

          {/* Calendar Grid */}
          <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
          <div>L</div><div>M</div><div>X</div><div>J</div><div>V</div><div>S</div><div>D</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
          {days.map((day, i) => {
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, monthStart);
            
            // Check if there's an event this day
            const eventsThisDay = events.filter(ev => {
              if(!ev.Date) return false;
              const startDate = new Date(ev.Date.split(' ')[0]);
              startDate.setHours(0,0,0,0);
              const endDateStr = ev["End Date"] || ev.Date;
              const endDate = new Date(endDateStr.split(' ')[0]);
              endDate.setHours(0,0,0,0);
              const currentDay = new Date(day);
              currentDay.setHours(0,0,0,0);
              return currentDay >= startDate && currentDay <= endDate;
            });
            const hasEvent = eventsThisDay.length > 0;
            // Get color of first event for the dot
            const dotColor = hasEvent ? (categoryColors[eventsThisDay[0].Category] || 'var(--primary)') : 'transparent';

            const isToday = isSameDay(day, new Date());

            return (
              <div 
                key={i} 
                onClick={() => onDateClick(day)}
                style={{
                  padding: '10px 0',
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
                  color: isSelected ? 'white' : (hasEvent ? dotColor : (isCurrentMonth ? 'var(--text-primary)' : 'var(--border)')),
                  fontWeight: hasEvent ? '900' : 'normal',
                  fontSize: hasEvent ? '1.1rem' : '1rem',
                  border: isToday ? '2px solid var(--primary)' : '2px solid transparent',
                  position: 'relative'
                }}
              >
                {format(day, 'd')}
              </div>
            )
          })}
        </div>
      </div>
      </>
      )}

      {/* Event List for Selected Day or Search Results */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '1rem' }}>
          {(isSearchOpen && searchQuery.trim() !== '') ? `Resultados de búsqueda (${displayEvents.length})` : `Eventos del ${format(selectedDate, "d 'de' MMMM", { locale: es })}`}
        </h3>
        
        {displayEvents.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>{(isSearchOpen && searchQuery.trim() !== '') ? 'No se encontraron resultados.' : 'No hay eventos para este día.'}</p>
        ) : (
          displayEvents.map((ev, i) => {
            const evColor = categoryColors[ev.Category] || 'var(--primary)';
            return (
              <div key={i} className="card" onClick={() => openEdit(ev)} style={{ cursor: 'pointer', padding: '1rem', marginBottom: '0.5rem', border: `1px solid ${evColor}`, borderRadius: '8px', backgroundColor: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '1.1rem', color: evColor }}>{ev.Category}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {ev["Start Time"] ? ev["Start Time"].substring(0,5) : ''} - {ev["End Time"] ? ev["End Time"].substring(0,5) : ''}
                  </div>
                </div>
                <p style={{ margin: '0.5rem 0', color: 'var(--text-primary)' }}>{ev.Info || 'Sin detalles adicionales'}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <small style={{ color: 'var(--text-secondary)' }}>Usuario: <span style={{ color: 'var(--text-primary)' }}>{ev.Responsible || 'Sin Asignar'}</span></small>
                  {ev["End Date"] && ev["End Date"] !== ev.Date && (
                    <small style={{ color: 'var(--text-secondary)' }}>Hasta: {ev["End Date"].split(' ')[0]}</small>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button */}
      {!isFormOpen && (
        <button 
          onClick={() => {
            setNewDate(format(selectedDate, 'yyyy-MM-dd'));
            setEditingEvent(null);
            setIsFormOpen(true);
            const mainContent = document.querySelector('.main-content');
            if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="fab"
        >
          <Plus size={28} />
        </button>
      )}
    </div>
  );
}
