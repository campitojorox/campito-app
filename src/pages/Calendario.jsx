import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../supabaseClient';
import { Plus, Calendar, Clock, User, AlignLeft, CheckCircle2 } from 'lucide-react';

const categoryColors = {
  'RIEGO': '#38bdf8', // Azul claro (Tailwind sky-400)
  'MANTENIMIENTO': '#10b981', // Verde (Tailwind emerald-500)
  'OTRO': '#8884d8' // Morado
};

const formatDateToDDMMYY = (dateStr) => {
  if (!dateStr) return '';
  const datePart = dateStr.split(' ')[0]; // "YYYY-MM-DD"
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
  }
  return datePart;
};

export default function Calendario() {
  const context = useOutletContext();
  const isSearchOpen = context?.isSearchOpen || false;
  const searchQuery = context?.searchQuery || '';
  const users = context?.users || [];
  const rawEvents = context?.events || [];
  const refetchEvents = context?.refetchEvents || (() => {});
  const currentUser = context?.currentUser || 'Usuario Login';

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newEndDate, setNewEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newEndTime, setNewEndTime] = useState('09:00');
  const [newCategory, setNewCategory] = useState('');
  const [newSubcategory, setNewSubcategory] = useState('');
  const [newResponsibles, setNewResponsibles] = useState([]);
  const [newInfo, setNewInfo] = useState('');

  // Keep End Date synced with Start Date if user hasn't manually changed it
  useEffect(() => {
    setNewEndDate(newDate);
  }, [newDate]);

  const events = useMemo(() => {
    return rawEvents.map(ev => ({
      EventID: ev.id,
      Date: ev.date ? (ev.date.split('T')[0] + " 00:00:00") : null,
      "End Date": ev.end_date ? (ev.end_date.split('T')[0] + " 00:00:00") : (ev.date ? (ev.date.split('T')[0] + " 00:00:00") : null),
      "Start Time": ev.start_time ? ev.start_time.substring(0,5) + ':00' : null,
      "End Time": ev.end_time ? ev.end_time.substring(0,5) + ':00' : null,
      Category: ev.category,
      Info: ev.info,
      Responsible: ev.responsibles && ev.responsibles.length > 0 ? (context?.users && ev.responsibles.length === context.users.length ? 'Todos' : ev.responsibles.join(', ')) : 'Sin Asignar',
      responsibles: ev.responsibles || []
    }));
  }, [rawEvents]);

  const handleAddEvent = async (e) => {
    e.preventDefault();
    
    if (newResponsibles.length === 0) {
      alert("Por favor, selecciona al menos un usuario.");
      return;
    }
    
    if (!newCategory) {
      alert("Por favor, selecciona una categoría.");
      return;
    }

    if (newCategory === 'RIEGO' && !newSubcategory) {
      alert("Por favor, selecciona una subcategoría para Riego (La Nana o El Moro).");
      return;
    }
    
    if (newCategory === 'MANTENIMIENTO' && !newSubcategory) {
      alert("Por favor, selecciona una subcategoría para Mantenimiento (Poda, Desbroza, Fertilizado, Fitosanitarios).");
      return;
    }

    const finalCategory = (newCategory === 'RIEGO' || newCategory === 'MANTENIMIENTO') ? `${newCategory} - ${newSubcategory}` : newCategory;

    const payload = {
      date: newDate + "T00:00:00Z",
      end_date: newEndDate + "T00:00:00Z",
      start_time: newStartTime + ":00",
      end_time: newEndTime + ":00",
      category: finalCategory,
      responsibles: newResponsibles,
      info: newInfo
    };

    if (editingEvent) {
      await supabase.from('events').update(payload).eq('id', editingEvent.EventID);
    } else {
      await supabase.from('events').insert([payload]);
    }
    
    refetchEvents(); // Reload from DB
    setIsFormOpen(false);
    setEditingEvent(null);
  };

  const openEdit = (ev) => {
    setEditingEvent(ev);
    setNewDate(ev.Date ? ev.Date.split(' ')[0] : format(selectedDate, 'yyyy-MM-dd'));
    setNewEndDate(ev["End Date"] ? ev["End Date"].split(' ')[0] : format(selectedDate, 'yyyy-MM-dd'));
    setNewStartTime(ev["Start Time"] ? ev["Start Time"].substring(0,5) : '08:00');
    setNewEndTime(ev["End Time"] ? ev["End Time"].substring(0,5) : '09:00');
    
    const cat = ev.Category || '';
    if (cat.startsWith('RIEGO')) {
      setNewCategory('RIEGO');
      setNewSubcategory(cat.includes(' - ') ? cat.split(' - ')[1] : '');
    } else if (cat.startsWith('MANTENIMIENTO')) {
      setNewCategory('MANTENIMIENTO');
      setNewSubcategory(cat.includes(' - ') ? cat.split(' - ')[1] : '');
    } else {
      setNewCategory(cat);
      setNewSubcategory('');
    }

    setNewResponsibles(ev.responsibles || []);
    setNewInfo(ev.Info || '');
    setIsFormOpen(true);
    setTimeout(() => {
      const formElement = document.getElementById('event-form');
      if (formElement) formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const nextMonth = useCallback(() => setCurrentMonth(prev => addMonths(prev, 1)), []);
  const prevMonth = useCallback(() => setCurrentMonth(prev => subMonths(prev, 1)), []);
  const onDateClick = useCallback((day) => {
    setSelectedDate(day);
    setIsFormOpen(false);
    setEditingEvent(null);
  }, []);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);
  const startDate = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const endDate = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);
  const days = useMemo(() => eachDayOfInterval({ start: startDate, end: endDate }), [startDate, endDate]);

  const selectedDayEvents = useMemo(() => {
    return events.filter(ev => {
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
  }, [events, selectedDate]);

  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return events.filter(ev => {
      return (
        (ev.Category && ev.Category.toLowerCase().includes(q)) ||
        (ev.Info && ev.Info.toLowerCase().includes(q)) ||
        (ev.Responsible && ev.Responsible.toLowerCase().includes(q)) ||
        (ev.Date && ev.Date.toLowerCase().includes(q))
      );
    });
  }, [events, searchQuery]);

  const displayEvents = useMemo(() => {
    return (isSearchOpen && searchQuery.trim() !== '') ? searchResults : selectedDayEvents;
  }, [isSearchOpen, searchQuery, searchResults, selectedDayEvents]);

  const renderForm = () => (
    <div id="event-form" style={{ margin: '3rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: editingEvent ? '1rem' : '2rem', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'white', fontWeight: 'bold' }}>{editingEvent ? 'Editar Evento' : 'Agregar Evento'}</h2>
            {editingEvent && (
              <button type="button" onClick={() => { setIsFormOpen(false); setEditingEvent(null); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.8rem', padding: 0 }}>&times;</button>
            )}
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <form onSubmit={handleAddEvent}>

            <div className="form-group" style={{ padding: 0, marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.5rem', width: '100%', flexWrap: 'wrap' }}>
                {users.map(u => {
                  const isSelected = newResponsibles.includes(u.name);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        const fakeEvent = { target: { setCustomValidity: () => {} } };
                        fakeEvent.target.setCustomValidity('');
                        if (isSelected) {
                          setNewResponsibles(newResponsibles.filter(name => name !== u.name));
                        } else {
                          setNewResponsibles([...newResponsibles, u.name]);
                        }
                      }}
                      style={{
                        flex: 1,
                        minWidth: '22%',
                        padding: '0.8rem 0',
                        borderRadius: '12px',
                        border: isSelected ? `2px solid #9edb9e` : `2px solid transparent`,
                        backgroundColor: isSelected ? '#9edb9e' : 'var(--primary)',
                        color: isSelected ? '#1a1a1a' : 'white',
                        fontWeight: '600',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                      }}
                    >
                      {u.name}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.2rem' }}>
              <div className="form-group" style={{ flex: 1, padding: 0 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', marginBottom: '0.2rem', display: 'block' }}>Inicio</label>
                <div className="input-with-icon" style={{ marginBottom: 0 }}>
                  <Calendar className="input-icon" size={20} />
                  <input type="date" className="form-input" style={{ textAlign: 'right', paddingRight: '10px', fontSize: '0.95rem' }} required value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ flex: 1, padding: 0 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', marginBottom: '0.2rem', display: 'block' }}>Término</label>
                <div className="input-with-icon" style={{ marginBottom: 0 }}>
                  <Calendar className="input-icon" size={20} />
                  <input type="date" className="form-input" style={{ textAlign: 'right', paddingRight: '10px', fontSize: '0.95rem' }} required value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem' }}>
              <div className="form-group" style={{ flex: 1, padding: 0 }}>
                <div className="input-with-icon" style={{ marginBottom: 0 }}>
                  <Clock className="input-icon" size={20} />
                  <input type="time" className="form-input" style={{ textAlign: 'right', paddingRight: '10px', fontSize: '0.95rem' }} required value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ flex: 1, padding: 0 }}>
                <div className="input-with-icon" style={{ marginBottom: 0 }}>
                  <Clock className="input-icon" size={20} />
                  <input type="time" className="form-input" style={{ textAlign: 'right', paddingRight: '10px', fontSize: '0.95rem' }} required value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="form-group" style={{ padding: 0, marginBottom: '0.5rem', display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
              <button 
                type="button"
                onClick={() => setNewCategory('RIEGO')}
                style={{
                  flex: 1,
                  padding: '0.8rem 0.2rem',
                  borderRadius: '8px',
                  border: newCategory === 'RIEGO' ? `2px solid #9edb9e` : `2px solid transparent`,
                  backgroundColor: newCategory === 'RIEGO' ? '#9edb9e' : 'var(--primary)',
                  color: newCategory === 'RIEGO' ? '#1a1a1a' : 'white',
                  fontWeight: '600',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}
              >
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: categoryColors['RIEGO'], border: '1px solid var(--bg-color)', marginRight: '0.4rem', flexShrink: 0 }} />
                Riego
              </button>
              <button 
                type="button"
                onClick={() => setNewCategory('MANTENIMIENTO')}
                style={{
                  flex: 1,
                  padding: '0.8rem 0.2rem',
                  borderRadius: '8px',
                  border: newCategory === 'MANTENIMIENTO' ? `2px solid #9edb9e` : `2px solid transparent`,
                  backgroundColor: newCategory === 'MANTENIMIENTO' ? '#9edb9e' : 'var(--primary)',
                  color: newCategory === 'MANTENIMIENTO' ? '#1a1a1a' : 'white',
                  fontWeight: '600',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}
              >
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: categoryColors['MANTENIMIENTO'], border: '1px solid var(--bg-color)', marginRight: '0.4rem', flexShrink: 0 }} />
                Mant.
              </button>
              <button 
                type="button"
                onClick={() => setNewCategory('OTRO')}
                style={{
                  flex: 1,
                  padding: '0.8rem 0.2rem',
                  borderRadius: '8px',
                  border: newCategory === 'OTRO' ? `2px solid #9edb9e` : `2px solid transparent`,
                  backgroundColor: newCategory === 'OTRO' ? '#9edb9e' : 'var(--primary)',
                  color: newCategory === 'OTRO' ? '#1a1a1a' : 'white',
                  fontWeight: '600',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}
              >
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: categoryColors['OTRO'], border: '1px solid var(--bg-color)', marginRight: '0.4rem', flexShrink: 0 }} />
                Otro
              </button>
            </div>
            
            {newCategory === 'RIEGO' && (
              <div className="form-group" style={{ padding: 0, marginTop: '1rem', marginBottom: '0.5rem', display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setNewSubcategory('La Nana')}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.2rem',
                    borderRadius: '8px',
                    border: newSubcategory === 'La Nana' ? `2px solid #9edb9e` : `2px solid transparent`,
                    backgroundColor: newSubcategory === 'La Nana' ? '#9edb9e' : categoryColors['RIEGO'],
                    color: newSubcategory === 'La Nana' ? '#1a1a1a' : 'white',
                    fontWeight: '600',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  La Nana
                </button>
                <button
                  type="button"
                  onClick={() => setNewSubcategory('El Moro')}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.2rem',
                    borderRadius: '8px',
                    border: newSubcategory === 'El Moro' ? `2px solid #9edb9e` : `2px solid transparent`,
                    backgroundColor: newSubcategory === 'El Moro' ? '#9edb9e' : categoryColors['RIEGO'],
                    color: newSubcategory === 'El Moro' ? '#1a1a1a' : 'white',
                    fontWeight: '600',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  El Moro
                </button>
              </div>
            )}
            
            {newCategory === 'MANTENIMIENTO' && (
              <div className="form-group" style={{ padding: 0, marginTop: '1rem', marginBottom: '0.5rem', display: 'flex', flexDirection: 'row', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['Poda', 'Desbroza', 'Fertilizado', 'Fitosanitarios'].map(sub => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setNewSubcategory(sub)}
                    style={{
                      flex: 1,
                      minWidth: '45%',
                      padding: '0.6rem 0.2rem',
                      borderRadius: '8px',
                      border: newSubcategory === sub ? `2px solid #9edb9e` : `2px solid transparent`,
                      backgroundColor: newSubcategory === sub ? '#9edb9e' : categoryColors['MANTENIMIENTO'],
                      color: newSubcategory === sub ? '#1a1a1a' : 'white',
                      fontWeight: '600',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            )}

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
  );

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
                refetchEvents();
                setIsFormOpen(false);
                setEditingEvent(null);
                setIsConfirmingDelete(false);
              }} className="btn" style={{ flex: 1, backgroundColor: 'var(--danger)', color: 'white', border: 'none', margin: 0 }}>Sí, Borrar</button>
            </div>
          </div>
        </div>
      ), document.body)}

      {!(isSearchOpen && searchQuery.trim() !== '') && (
        <>
          {/* Calendar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', marginTop: '1.5rem' }}>
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
            const dotColor = hasEvent ? (eventsThisDay[0].Category?.startsWith('RIEGO') ? categoryColors['RIEGO'] : (categoryColors[eventsThisDay[0].Category] || 'var(--primary)')) : 'transparent';

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

      {isFormOpen && !editingEvent && renderForm()}

      {/* Event List for Selected Day or Search Results */}
      <div style={{ marginTop: '3rem', paddingBottom: '6rem' }}>
        {(isSearchOpen && searchQuery.trim() !== '') && (
          <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '1rem' }}>
            Resultados de búsqueda ({displayEvents.length})
          </h3>
        )}
        
        {displayEvents.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>{(isSearchOpen && searchQuery.trim() !== '') ? 'No se encontraron resultados.' : 'No hay eventos para este día.'}</p>
        ) : (
          displayEvents.map((ev, i) => {
            const evColor = ev.Category?.startsWith('RIEGO') ? categoryColors['RIEGO'] : (categoryColors[ev.Category] || 'var(--primary)');
            return (
              <div key={i} style={{ marginBottom: '0.5rem' }}>
                {(editingEvent && editingEvent.EventID === ev.EventID && isFormOpen) ? (
                  renderForm()
                ) : (
                  <div className="card" onClick={() => openEdit(ev)} style={{ cursor: 'pointer', padding: '1rem', border: 'none', borderRadius: '8px', backgroundColor: evColor, color: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '1.1rem', color: 'white' }}>{ev.Category}</strong>
                    </div>
                    <p style={{ margin: '0.5rem 0', color: 'white', fontWeight: '500' }}>{ev.Info || 'Sin detalles adicionales'}</p>
                    <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.3)', margin: '0.75rem -1rem' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.9rem' }}>
                        <small style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Desde: <span style={{ color: 'white', fontWeight: '500' }}>{formatDateToDDMMYY(ev.Date)}</span> / <span style={{ color: 'white', fontWeight: '500' }}>{ev["Start Time"] ? ev["Start Time"].substring(0,5) : ''}</span></small>
                        <small style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Hasta: <span style={{ color: 'white', fontWeight: '500' }}>{formatDateToDDMMYY(ev["End Date"] || ev.Date)}</span> / <span style={{ color: 'white', fontWeight: '500' }}>{ev["End Time"] ? ev["End Time"].substring(0,5) : ''}</span></small>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.9rem', textAlign: 'right' }}>
                        <small style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Usuario: <span style={{ color: 'white', fontWeight: '500' }}>{ev.Responsible || 'Sin Asignar'}</span></small>
                        <small style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>por: <span style={{ color: 'white', fontWeight: '500' }}>{currentUser}</span></small>
                      </div>
                    </div>
                  </div>
                )}
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
            setNewEndDate(format(selectedDate, 'yyyy-MM-dd'));
            setNewStartTime('08:00');
            setNewEndTime('09:00');
            setNewCategory('');
            setNewSubcategory('');
            setNewResponsibles([]);
            setNewInfo('');
            setEditingEvent(null);
            setIsFormOpen(true);
            setTimeout(() => {
              const formElement = document.getElementById('event-form');
              if (formElement) formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
          }}
          className="fab"
        >
          <Plus size={28} />
        </button>
      )}
    </div>
  );
}
