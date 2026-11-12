import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext, useLocation } from 'react-router-dom';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../supabaseClient';
import { Plus, Calendar, Clock, AlignLeft } from 'lucide-react';
import SectionChatIA from '../components/SectionChatIA';

const categoryColors = {
  'RIEGO': '#38bdf8', // Azul claro (Tailwind sky-400)
  'MANTENIMIENTO': '#10b981', // Verde (Tailwind emerald-500)
  'OTRO': '#8884d8' // Morado
};

const RIEGO_ZONES = ['La Nana', 'El Moro'];

const formatDateToDDMMYY = (dateStr) => {
  if (!dateStr) return '';
  const datePart = dateStr.split(' ')[0]; // "YYYY-MM-DD"
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
  }
  return datePart;
};

const parseLocalYMD = (dateStr) => {
  if (!dateStr) return null;
  const clean = dateStr.split(' ')[0].split('T')[0];
  const parts = clean.split('-').map(Number);
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function Calendario() {
  const context = useOutletContext();
  const location = useLocation();
  const isSearchOpen = context?.isSearchOpen || false;
  const searchQuery = context?.searchQuery || '';
  const users = useMemo(() => context?.users || [], [context?.users]);
  const rawEvents = useMemo(() => context?.events || [], [context?.events]);
  const refetchEvents = context?.refetchEvents || (() => {});
  const currentUser = context?.currentUser || 'Usuario Login';

  const targetDateProp = location.state?.targetDate || null;
  const [prevTargetDateProp, setPrevTargetDateProp] = useState(targetDateProp);
  const [currentMonth, setCurrentMonth] = useState(() =>
    targetDateProp ? new Date(targetDateProp) : new Date()
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    targetDateProp ? new Date(targetDateProp) : new Date()
  );

  if (targetDateProp && targetDateProp !== prevTargetDateProp) {
    setPrevTargetDateProp(targetDateProp);
    const target = new Date(targetDateProp);
    setSelectedDate(target);
    setCurrentMonth(target);
  }
  
  // Form state
  // cambio de grafica del form: formulario superior colapsable (isAddFormOpen) separado de edición inline (isFormOpen)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newEndDate, setNewEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newEndTime, setNewEndTime] = useState('09:00');
  const [newCategory, setNewCategory] = useState('');
  const [newSubcategory, setNewSubcategory] = useState('');
  const [newRiegoZones, setNewRiegoZones] = useState([]);
  const [newResponsibles, setNewResponsibles] = useState([]);

  const toggleRiegoZone = (zone) => {
    setNewRiegoZones((prev) => {
      const exists = prev.includes(zone);
      const next = exists ? prev.filter((z) => z !== zone) : [...prev, zone];
      return RIEGO_ZONES.filter((z) => next.includes(z));
    });
  };
  const [newInfo, setNewInfo] = useState('');

  const events = useMemo(() => {
    return rawEvents.map(ev => ({
      EventID: ev.id,
      Date: ev.date ? (ev.date.split('T')[0] + " 00:00:00") : null,
      "End Date": ev.end_date ? (ev.end_date.split('T')[0] + " 00:00:00") : (ev.date ? (ev.date.split('T')[0] + " 00:00:00") : null),
      "Start Time": ev.start_time ? ev.start_time.substring(0,5) + ':00' : null,
      "End Time": ev.end_time ? ev.end_time.substring(0,5) + ':00' : null,
      Category: ev.category,
      Info: ev.info,
      Responsible: ev.responsibles && ev.responsibles.length > 0 ? (users.length > 0 && ev.responsibles.length === users.length ? 'Todos' : ev.responsibles.join(', ')) : 'Sin Asignar',
      responsibles: ev.responsibles || []
    }));
  }, [rawEvents, users]);

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

    if (newCategory === 'MANTENIMIENTO' && !newSubcategory) {
      alert("Por favor, selecciona una subcategoría para Mantenimiento (Poda, Limpieza, Fertilizado, Fitosanitarios).");
      return;
    }

    let finalCategory = newCategory;
    if (newCategory === 'RIEGO') {
      finalCategory = newRiegoZones.length > 0 ? `RIEGO - ${newRiegoZones.join(' y ')}` : 'RIEGO';
    } else if (newCategory === 'MANTENIMIENTO') {
      finalCategory = `MANTENIMIENTO - ${newSubcategory}`;
    }

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
    setIsAddFormOpen(false);
    setIsFormOpen(false);
    setEditingEvent(null);
  };

  const toggleAddForm = () => {
    setIsAddFormOpen((prev) => {
      const next = !prev;
      if (next) {
        setEditingEvent(null);
        setIsFormOpen(false);
        const dayIso = format(selectedDate, 'yyyy-MM-dd');
        setNewDate(dayIso);
        setNewEndDate(dayIso);
        setNewStartTime('08:00');
        setNewEndTime('09:00');
        setNewCategory('');
        setNewSubcategory('');
        setNewRiegoZones([]);
        setNewResponsibles([]);
        setNewInfo('');
      }
      return next;
    });
  };

  const openEdit = (ev) => {
    setIsAddFormOpen(false);
    setEditingEvent(ev);
    setNewDate(ev.Date ? ev.Date.split(' ')[0] : format(selectedDate, 'yyyy-MM-dd'));
    setNewEndDate(ev["End Date"] ? ev["End Date"].split(' ')[0] : format(selectedDate, 'yyyy-MM-dd'));
    setNewStartTime(ev["Start Time"] ? ev["Start Time"].substring(0,5) : '08:00');
    setNewEndTime(ev["End Time"] ? ev["End Time"].substring(0,5) : '09:00');
    
    const cat = ev.Category || '';
    if (cat.startsWith('RIEGO')) {
      setNewCategory('RIEGO');
      setNewSubcategory('');
      const lowerCat = cat.toLowerCase();
      setNewRiegoZones(RIEGO_ZONES.filter((z) => lowerCat.includes(z.toLowerCase())));
    } else if (cat.startsWith('MANTENIMIENTO')) {
      setNewCategory('MANTENIMIENTO');
      setNewRiegoZones([]);
      const rawSub = cat.includes(' - ') ? cat.split(' - ')[1] : '';
      setNewSubcategory(rawSub === 'Desbroza' ? 'Limpieza' : rawSub);
    } else {
      setNewCategory(cat);
      setNewSubcategory('');
      setNewRiegoZones([]);
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
    const dayIso = format(day, 'yyyy-MM-dd');
    setNewDate(dayIso);
    setNewEndDate(dayIso);
  }, []);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);
  const startDate = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const endDate = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);
  const days = useMemo(() => eachDayOfInterval({ start: startDate, end: endDate }), [startDate, endDate]);

  const selectedDayEvents = useMemo(() => {
    const currentDay = new Date(selectedDate);
    currentDay.setHours(0, 0, 0, 0);
    return events.filter(ev => {
      if (!ev.Date) return false;
      const startDate = parseLocalYMD(ev.Date);
      const endDate = parseLocalYMD(ev['End Date'] || ev.Date);
      return startDate && endDate && currentDay >= startDate && currentDay <= endDate;
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

  const isSearching = isSearchOpen && searchQuery.trim() !== '';

  // cambio de grafica del form: campos compartidos con mismos tamaños y gráfica que Transacciones
  const renderEventFormFields = (isEdit) => (
    <form onSubmit={handleAddEvent}>
      <div className="form-group" style={{ padding: 0, marginBottom: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', width: '100%', flexWrap: 'nowrap' }}>
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
                  minWidth: 0,
                  minHeight: '42px',
                  padding: '0.5rem 0.2rem',
                  borderRadius: '10px',
                  border: isSelected ? `2px solid #74c474` : `2px solid transparent`,
                  backgroundColor: isSelected ? '#9edb9e' : 'var(--primary)',
                  color: isSelected ? '#1a1a1a' : 'white',
                  fontWeight: '600',
                  fontSize: 'clamp(0.74rem, 3.1vw, 0.92rem)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {u.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.55rem', marginBottom: '0.55rem' }}>
        <div className="input-with-icon" style={{ flex: '1.15 1 0', marginBottom: 0, position: 'relative' }}>
          <Calendar className="input-icon" size={18} style={{ left: '0.7rem' }} />
          <input
            type="date"
            className="form-input"
            style={{ textAlign: 'right', paddingRight: '10px', fontSize: '0.92rem', paddingLeft: '2.35rem', height: '46px', borderRadius: '10px' }}
            required
            value={newDate}
            onChange={(e) => {
              const val = e.target.value;
              setNewDate(val);
              if (!editingEvent || !newEndDate || val > newEndDate) {
                setNewEndDate(val);
              }
            }}
          />
        </div>
        <div className="input-with-icon" style={{ flex: '0.85 1 0', marginBottom: 0, position: 'relative' }}>
          <Clock className="input-icon" size={18} style={{ left: '0.7rem' }} />
          <input
            type="time"
            className="form-input"
            style={{ textAlign: 'right', paddingRight: '10px', fontSize: '0.92rem', paddingLeft: '2.35rem', height: '46px', borderRadius: '10px' }}
            required
            value={newStartTime}
            onChange={(e) => setNewStartTime(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.55rem', marginBottom: '0.55rem' }}>
        <div className="input-with-icon" style={{ flex: '1.15 1 0', marginBottom: 0, position: 'relative' }}>
          <div className="input-icon" style={{ left: '0.7rem', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', pointerEvents: 'none', overflow: 'visible' }}>
            <Calendar size={18} color="var(--primary)" />
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ position: 'absolute' }}>
              <line x1="3" y1="19" x2="19" y2="3" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
              <line x1="3" y1="19" x2="19" y2="3" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <input
            type="date"
            className="form-input"
            style={{ textAlign: 'right', paddingRight: '10px', fontSize: '0.92rem', paddingLeft: '2.35rem', height: '46px', borderRadius: '10px' }}
            required
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
          />
        </div>
        <div className="input-with-icon" style={{ flex: '0.85 1 0', marginBottom: 0, position: 'relative' }}>
          <div className="input-icon" style={{ left: '0.7rem', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', pointerEvents: 'none', overflow: 'visible' }}>
            <Clock size={18} color="var(--primary)" />
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ position: 'absolute' }}>
              <line x1="3" y1="19" x2="19" y2="3" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
              <line x1="3" y1="19" x2="19" y2="3" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <input
            type="time"
            className="form-input"
            style={{ textAlign: 'right', paddingRight: '10px', fontSize: '0.92rem', paddingLeft: '2.35rem', height: '46px', borderRadius: '10px' }}
            required
            value={newEndTime}
            onChange={(e) => setNewEndTime(e.target.value)}
          />
        </div>
      </div>

      <div className="form-group" style={{ padding: 0, marginTop: '1.1rem', marginBottom: '0.4rem', display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setNewCategory('RIEGO')}
          style={{
            flex: 1,
            minHeight: '46px',
            padding: '0.55rem 0.35rem',
            borderRadius: '10px',
            border: newCategory === 'RIEGO' ? `2px solid #74c474` : `2px solid transparent`,
            backgroundColor: newCategory === 'RIEGO' ? '#9edb9e' : 'var(--primary)',
            color: newCategory === 'RIEGO' ? '#1a1a1a' : 'white',
            fontWeight: '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: categoryColors['RIEGO'], border: '2px solid #ffffff', marginRight: '0.4rem', flexShrink: 0 }} />
          Riego
        </button>
        <button
          type="button"
          onClick={() => setNewCategory('MANTENIMIENTO')}
          style={{
            flex: 1,
            minHeight: '46px',
            padding: '0.55rem 0.35rem',
            borderRadius: '10px',
            border: newCategory === 'MANTENIMIENTO' ? `2px solid #74c474` : `2px solid transparent`,
            backgroundColor: newCategory === 'MANTENIMIENTO' ? '#9edb9e' : 'var(--primary)',
            color: newCategory === 'MANTENIMIENTO' ? '#1a1a1a' : 'white',
            fontWeight: '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: categoryColors['MANTENIMIENTO'], border: '2px solid #ffffff', marginRight: '0.4rem', flexShrink: 0 }} />
          Mant.
        </button>
        <button
          type="button"
          onClick={() => setNewCategory('OTRO')}
          style={{
            flex: 1,
            minHeight: '46px',
            padding: '0.55rem 0.35rem',
            borderRadius: '10px',
            border: newCategory === 'OTRO' ? `2px solid #74c474` : `2px solid transparent`,
            backgroundColor: newCategory === 'OTRO' ? '#9edb9e' : 'var(--primary)',
            color: newCategory === 'OTRO' ? '#1a1a1a' : 'white',
            fontWeight: '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: categoryColors['OTRO'], border: '2px solid #ffffff', marginRight: '0.4rem', flexShrink: 0 }} />
          Otro
        </button>
      </div>

      {newCategory === 'RIEGO' && (
        <div style={{ marginTop: '0.65rem', marginBottom: '0.4rem' }}>
          <div className="form-group" style={{ padding: 0, margin: 0, display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
            {RIEGO_ZONES.map((zone) => {
              const isSelected = newRiegoZones.includes(zone);
              return (
                <button
                  key={zone}
                  type="button"
                  onClick={() => toggleRiegoZone(zone)}
                  style={{
                    flex: 1,
                    minHeight: '42px',
                    padding: '0.5rem 0.4rem',
                    borderRadius: '10px',
                    border: isSelected ? `2px solid #74c474` : `2px solid transparent`,
                    backgroundColor: isSelected ? '#9edb9e' : categoryColors['RIEGO'],
                    color: isSelected ? '#1a1a1a' : 'white',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  {zone}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.3rem', textAlign: 'center' }}>
            Opcional: selecciona uno, ambos o ninguno
          </div>
        </div>
      )}

      {newCategory === 'MANTENIMIENTO' && (
        <div className="form-group" style={{ padding: 0, marginTop: '0.65rem', marginBottom: '0.4rem', display: 'flex', flexDirection: 'row', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['Poda', 'Limpieza', 'Fertilizado', 'Fitosanitarios'].map(sub => (
            <button
              key={sub}
              type="button"
              onClick={() => setNewSubcategory(sub)}
              style={{
                flex: '1 1 calc(50% - 0.5rem)',
                minWidth: '42%',
                minHeight: '42px',
                padding: '0.5rem 0.4rem',
                borderRadius: '10px',
                border: newSubcategory === sub ? `2px solid #74c474` : `2px solid transparent`,
                backgroundColor: newSubcategory === sub ? '#9edb9e' : categoryColors['MANTENIMIENTO'],
                color: newSubcategory === sub ? '#1a1a1a' : 'white',
                fontWeight: '600',
                fontSize: '0.9rem',
                cursor: 'pointer',
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

      <div className="form-group" style={{ padding: 0, marginTop: '0.95rem', marginBottom: 0 }}>
        <div className="input-with-icon" style={{ marginBottom: 0 }}>
          <AlignLeft className="input-icon" size={19} />
          <input
            type="text"
            className="form-input"
            value={newInfo}
            onChange={(e) => setNewInfo(e.target.value)}
            placeholder="Detalles / Info"
            style={{ height: '48px', borderRadius: '10px', fontSize: '0.95rem' }}
          />
        </div>
      </div>

      {!isEdit ? (
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.35rem' }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700 }}>Agregar</button>
          <button type="button" className="btn" onClick={() => { setIsAddFormOpen(false); setIsFormOpen(false); setEditingEvent(null); }} style={{ backgroundColor: 'var(--danger)', color: 'white', flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700 }}>Cancelar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.35rem' }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700 }}>Guardar / Cerrar</button>
          <button type="button" onClick={(e) => { e.preventDefault(); setIsConfirmingDelete(true); }} className="btn" style={{ flex: 1, margin: 0, minHeight: '46px', padding: '0.65rem 0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700, backgroundColor: 'var(--danger)', color: 'white' }}>Borrar</button>
        </div>
      )}
    </form>
  );

  const renderForm = () => (
    <div
      id="event-form"
      className="form-container"
      style={{
        margin: '0.5rem 0',
        padding: '1.35rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0, marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#000000', fontWeight: 'bold' }}>Editar Evento</h2>
        <button type="button" onClick={() => { setIsFormOpen(false); setEditingEvent(null); }} style={{ background: 'none', border: 'none', color: '#000000', cursor: 'pointer', fontSize: '1.8rem', padding: 0, lineHeight: 1 }}>&times;</button>
      </div>
      {renderEventFormFields(true)}
    </div>
  );

  const renderEventRow = (ev, i, totalLen) => {
    const evColor = ev.Category?.startsWith('RIEGO')
      ? categoryColors['RIEGO']
      : ev.Category?.startsWith('MANTENIMIENTO')
      ? categoryColors['MANTENIMIENTO']
      : categoryColors[ev.Category] || 'var(--primary)';

    const startDateFmt = formatDateToDDMMYY(ev.Date);
    const endDateFmt = formatDateToDDMMYY(ev['End Date'] || ev.Date);
    const dateLabel = endDateFmt && endDateFmt !== startDateFmt
      ? `${startDateFmt} → ${endDateFmt}`
      : startDateFmt;

    const startTime = ev['Start Time'] ? ev['Start Time'].substring(0, 5) : '';
    const endTime = ev['End Time'] ? ev['End Time'].substring(0, 5) : '';
    const timeRange = startTime && endTime ? `${startTime} - ${endTime}` : startTime || 'Todo el día';

    return (
      <div
        key={ev.EventID || i}
        onClick={() => openEdit(ev)}
        style={{
          cursor: 'pointer',
          padding: '0.78rem 0.25rem',
          borderBottom: i < totalLen - 1 ? '1px solid #e2e8f0' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          transition: 'background-color 0.15s ease',
        }}
      >
        {/* Lado izquierdo: Círculo de color, Categoría, Fecha y Detalles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: evColor,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontWeight: 700,
                fontSize: '0.92rem',
                color: '#0f172a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {ev.Category}
            </span>
            <span style={{ fontSize: '0.78rem', color: '#64748b', opacity: 0.9, flexShrink: 0 }}>
              {dateLabel}
            </span>
          </div>

          <span
            style={{
              fontSize: '0.83rem',
              color: '#64748b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ev.Info || 'Sin detalles adicionales'}
          </span>
        </div>

        {/* Lado derecho: Horario y Responsables */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.96rem',
              color: '#0f172a',
            }}
          >
            {timeRange}
          </div>
          <div
            style={{
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              fontWeight: 600,
              color: '#64748b',
              opacity: 0.9,
              marginTop: '1px',
            }}
          >
            {ev.Responsible || 'Sin Asignar'}
          </div>
        </div>
      </div>
    );
  };

  const renderEventsList = (eventList, { insideCalendar = false } = {}) => {
    const editingIdx =
      isFormOpen && editingEvent
        ? eventList.findIndex((ev) => ev.EventID === editingEvent.EventID)
        : -1;

    const wrapCard = (children, key) =>
      insideCalendar ? (
        <div key={key}>{children}</div>
      ) : (
        <div
          key={key}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '0.25rem 1rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
          }}
        >
          {children}
        </div>
      );

    if (editingIdx === -1) {
      return wrapCard(eventList.map((ev, i) => renderEventRow(ev, i, eventList.length)));
    }

    const before = eventList.slice(0, editingIdx);
    const after = eventList.slice(editingIdx + 1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {before.length > 0 && wrapCard(before.map((ev, i) => renderEventRow(ev, i, before.length)), 'before')}
        {renderForm()}
        {after.length > 0 && wrapCard(after.map((ev, i) => renderEventRow(ev, i, after.length)), 'after')}
      </div>
    );
  };

  return (
    <div className="container" style={{ position: 'relative', minHeight: '100%', padding: '1rem', paddingBottom: '8rem' }}>
      
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

      {!isSearching && (
        <>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '1.25rem 1rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
            marginTop: '0.5rem',
            marginBottom: '1.5rem',
          }}>
          {/* Calendar Header: Título del mes y navegación DENTRO del div del mes */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={prevMonth}
              style={{ fontSize: '1.4rem', color: '#666666', border: 'none', background: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', padding: '0.4rem' }}
              title="Mes anterior"
              aria-label="Mes anterior"
            >
              ◀
            </button>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', fontWeight: 'bold' }}>
              {format(currentMonth, 'MMMM yyyy', { locale: es }).toUpperCase()}
            </h2>
            <button
              type="button"
              onClick={nextMonth}
              style={{ fontSize: '1.4rem', color: '#666666', border: 'none', background: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', padding: '0.4rem' }}
              title="Mes siguiente"
              aria-label="Mes siguiente"
            >
              ▶
            </button>
          </div>

          {/* Días de la semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.6rem' }}>
            <div style={{ color: '#666666' }}>L</div>
            <div style={{ color: '#666666' }}>M</div>
            <div style={{ color: '#666666' }}>X</div>
            <div style={{ color: '#666666' }}>J</div>
            <div style={{ color: '#666666' }}>V</div>
            <div style={{ color: '#999999' }}>S</div>
            <div style={{ color: '#999999' }}>D</div>
          </div>

          {/* Grid de días */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {days.map((day, i) => {
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              
              // Comprobar si hay evento en este día
              const currentDay = new Date(day);
              currentDay.setHours(0, 0, 0, 0);
              const eventsThisDay = events.filter(ev => {
                if (!ev.Date) return false;
                const startDate = parseLocalYMD(ev.Date);
                const endDate = parseLocalYMD(ev['End Date'] || ev.Date);
                return startDate && endDate && currentDay >= startDate && currentDay <= endDate;
              });
              const hasEvent = eventsThisDay.length > 0;
              const isToday = isSameDay(day, new Date());

              // Color del número:
              // - Días con eventos: verde turquesa (#00979d) igual que el botón más
              // - Fuera del mes actual: #cccccc
              // - Sábado y domingo: #999999
              // - Resto de días (lunes a viernes): #666666
              let dayColor;
              if (hasEvent) {
                dayColor = '#00979d';
              } else if (!isCurrentMonth) {
                dayColor = '#cccccc';
              } else if (isWeekend) {
                dayColor = '#999999';
              } else {
                dayColor = '#666666';
              }

              return (
                <div 
                  key={i} 
                  onClick={() => onDateClick(day)}
                  style={{
                    padding: '9px 0',
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    backgroundColor: isSelected
                      ? 'rgba(0, 151, 157, 0.28)'
                      : (isToday ? '#e2e8f0' : 'transparent'),
                    color: dayColor,
                    fontWeight: hasEvent ? 'bold' : 'normal',
                    fontSize: '1rem',
                    border: '2px solid transparent',
                    position: 'relative',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {format(day, 'd')}
                </div>
              );
            })}
          </div>

          {/* Previsualización integrada de las actividades del día seleccionado dentro del mismo div del calendario */}
          {selectedDayEvents.length > 0 && (
            <div
              style={{
                borderTop: '1px solid #e2e8f0',
                marginTop: '1rem',
                paddingTop: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', padding: '0 0.25rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'capitalize' }}>
                  {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                </span>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#00979d' }}>
                  {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'actividad' : 'actividades'}
                </span>
              </div>
              {renderEventsList(selectedDayEvents, { insideCalendar: true })}
            </div>
          )}
        </div>

          {/* cambio de grafica del form: Registrar Actividad debajo del calendario */}
          <div
            className="form-container"
            style={{
              padding: isAddFormOpen ? '1.35rem' : '0.95rem 1.35rem',
              marginTop: '3rem',
              marginBottom: '3rem',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
              transition: 'padding 0.2s ease',
            }}
          >
            <div
              onClick={toggleAddForm}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                marginBottom: isAddFormOpen ? '1.25rem' : 0,
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#000000', fontWeight: 'bold' }}>
                Registrar Actividad
              </h2>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAddForm();
                }}
                aria-label={isAddFormOpen ? 'Cerrar formulario' : 'Abrir formulario Registrar Actividad'}
                title={isAddFormOpen ? 'Cerrar formulario' : 'Registrar Actividad'}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(0, 151, 157, 0.35)',
                  transform: isAddFormOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.22s ease, background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <Plus size={24} />
              </button>
            </div>

            {isAddFormOpen && renderEventFormFields(false)}
          </div>
        </>
      )}

      {/* Resultados cuando el buscador superior está activo */}
      {isSearching && (
        <div style={{ marginTop: '0.75rem', paddingBottom: '2rem' }}>
          <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '0.85rem' }}>
            Resultados de búsqueda ({searchResults.length})
          </h3>
          {searchResults.length === 0 ? (
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                padding: '1.5rem 1rem',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '0.9rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
              }}
            >
              No se encontraron resultados.
            </div>
          ) : (
            renderEventsList(searchResults, { insideCalendar: false })
          )}
        </div>
      )}

      {/* Barra fija inferior de Chat IA para Calendario */}
      <SectionChatIA
        section="calendario"
        contextData={{
          events: rawEvents,
          users,
          selectedDateIso: format(selectedDate, 'yyyy-MM-dd'),
          currentUser,
        }}
        onRefresh={refetchEvents}
        onHighlightDate={(dateIso) => {
          if (!dateIso) return;
          const clean = dateIso.split('T')[0];
          const [y, m, d] = clean.split('-').map(Number);
          if (y && m && d) {
            const target = new Date(y, m - 1, d);
            setSelectedDate(target);
            setCurrentMonth(target);
          }
        }}
        onSelectResultItem={(ev) => {
          if (ev?.Date) {
            const clean = ev.Date.split(' ')[0];
            const [y, m, d] = clean.split('-').map(Number);
            if (y && m && d) {
              const target = new Date(y, m - 1, d);
              setSelectedDate(target);
              setCurrentMonth(target);
            }
          }
          openEdit(ev);
        }}
        categoryColors={categoryColors}
      />
    </div>
  );
}
