// src/pages/gasto-ingreso.jsx
import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { Filter, X, FileText, Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { formatCurrency, highlightText } from '../utils/helpers';
import SectionChatIA from '../components/SectionChatIA';
import BalancesSummary from '../components/finances/BalancesSummary';
import AddTransactionForm from '../components/finances/AddTransactionForm';
import TransactionsFilterDrawer from '../components/finances/TransactionsFilterDrawer';
import TransactionDetailModal from '../components/finances/TransactionDetailModal';

export default function GastoIngreso() {
  const { users, transactions, refetchTransactions, searchQuery = '', isSearchOpen = false, currentUser = 'Usuario Login' } =
    useOutletContext();

  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [user, setUser] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const [showFinanceDetails, setShowFinanceDetails] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterUser, setFilterUser] = useState('ALL');

  const [formErrors, setFormErrors] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', desc: '', user: '', type: '', image: null, currentImage: null });
  const [expandedImage, setExpandedImage] = useState(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isConfirmingImageDelete, setIsConfirmingImageDelete] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const records = useMemo(() => {
    return (transactions || []).map((tx) => ({
      TransactionID: tx.id,
      Date: tx.date ? tx.date.split('T')[0] + ' 00:00:00' : '',
      Timestamp: tx.date ? new Date(tx.date).getTime() : 0,
      User: tx.profiles ? tx.profiles.name : 'Desconocido',
      Category: tx.type,
      Value: Math.abs(tx.amount),
      Amount: tx.amount,
      Description: tx.description,
      Imagen: tx.image_url,
      status: tx.status || 'ACTIVE',
      deleted_at: tx.deleted_at || null,
    }));
  }, [transactions]);

  const finances = useMemo(() => {
    const activeRecords = records.filter((r) => r.status === 'ACTIVE');
    const financesTmp = (users || []).map((u) => {
      const userRecords = activeRecords.filter((r) => r.User === u.name);
      const gasto = userRecords
        .filter((r) => r.Category === 'Gasto' || parseFloat(r.Amount || 0) > 0)
        .reduce((acc, r) => acc + Math.abs(parseFloat(r.Amount || 0)), 0);
      const venta = userRecords
        .filter((r) => r.Category === 'Retiro' || parseFloat(r.Amount || 0) < 0)
        .reduce((acc, r) => acc + Math.abs(parseFloat(r.Amount || 0)), 0);
      return { user: u.name, gasto, venta, balance: gasto - venta };
    });
    const maxBalance = financesTmp.length > 0 ? Math.max(...financesTmp.map((f) => f.balance)) : 0;
    return financesTmp.map((f) => ({
      user: f.user,
      gasto: f.gasto,
      venta: f.venta,
      balance: f.balance,
      diferencia: f.balance - maxBalance,
    }));
  }, [users, records]);

  const hasActiveFilters = filterCategory !== 'ALL' || filterUser !== 'ALL';

  const displayRecords = useMemo(() => {
    let list = records.filter((r) => r.status === 'ACTIVE');

    list = [...list].sort((a, b) => {
      const dayDiff = new Date(b.Date) - new Date(a.Date);
      if (dayDiff !== 0) return dayDiff;
      return (b.Timestamp || 0) - (a.Timestamp || 0);
    });

    if (isSearchOpen && searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          (r.User && r.User.toLowerCase().includes(q)) ||
          (r.Description && r.Description.toLowerCase().includes(q)) ||
          (r.Category && r.Category.toLowerCase().includes(q)) ||
          (r.Category === 'Retiro' && ('ingreso'.includes(q) || 'venta'.includes(q))) ||
          (r.Category === 'Gasto' && 'gasto'.includes(q))
      );
    }

    if (filterCategory === 'Gasto') list = list.filter((r) => r.Category === 'Gasto');
    else if (filterCategory === 'Retiro') list = list.filter((r) => r.Category === 'Retiro');

    if (filterUser !== 'ALL') list = list.filter((r) => r.User === filterUser);

    return list;
  }, [records, isSearchOpen, searchQuery, filterCategory, filterUser]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!user) errors.user = 'Selecciona un usuario';
    if (!type || (type !== 'Gasto' && type !== 'Retiro')) errors.type = 'Selecciona si es Gasto o Ingreso';
    if (!amount || parseFloat(amount) <= 0) errors.amount = 'Ingresa una cantidad válida';
    if (!description || !description.trim()) errors.description = 'Ingresa una descripción';

    if (Object.keys(errors).length > 0) {
      const missing = [];
      if (errors.user) missing.push('Usuario');
      if (errors.type) missing.push('Gasto o Ingreso');
      if (errors.amount) missing.push('Cantidad');
      if (errors.description) missing.push('Descripción');
      errors.general = `Falta información: Por favor selecciona ${missing.join(', ')}.`;
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setLoading(true);

    const respUser = users.find((u) => u.name === user);
    const userId = respUser ? respUser.id : null;

    let imageUrl = null;
    if (image) {
      const fileExt = image.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error } = await supabase.storage.from('comprobantes').upload(fileName, image);
      if (!error) {
        const { data: publicData } = supabase.storage.from('comprobantes').getPublicUrl(fileName);
        imageUrl = publicData.publicUrl;
      }
    }

    const finalAmount = type === 'Retiro' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));

    const { error } = await supabase.from('transactions').insert([
      {
        date: new Date().toISOString(),
        user_id: userId,
        type,
        amount: finalAmount,
        description: description.trim(),
        image_url: imageUrl,
      },
    ]);

    if (!error) {
      const msgType = type === 'Gasto' ? 'Gasto' : 'Ingreso';
      setSuccessMsg(`${msgType} de ${amount}€ registrado exitosamente!`);
      setTimeout(() => setSuccessMsg(null), 2500);
      setAmount('');
      setDescription('');
      setUser('');
      setType('');
      setImage(null);
      setFormErrors({});
      setIsAddFormOpen(false);
      refetchTransactions();
    } else {
      alert('Error guardando transacción: ' + error.message);
    }
    setLoading(false);
  };

  const renderEditForm = () => (
    <TransactionDetailModal
      selectedRecord={selectedRecord}
      setSelectedRecord={setSelectedRecord}
      users={users}
      editForm={editForm}
      setEditForm={setEditForm}
      editErrors={editErrors}
      setEditErrors={setEditErrors}
      isConfirmingDelete={isConfirmingDelete}
      setIsConfirmingDelete={setIsConfirmingDelete}
      isConfirmingImageDelete={isConfirmingImageDelete}
      setIsConfirmingImageDelete={setIsConfirmingImageDelete}
      setExpandedImage={setExpandedImage}
      refetchTransactions={refetchTransactions}
    />
  );

  const renderItem = (r, i, totalLen = 1) => {
    const key = r.TransactionID || i;
    const isDeleted = r.status === 'DELETED';
    const isRetiro = r.Category === 'Retiro';
    const activeSearchHighlight = isSearchOpen && searchQuery.trim() ? searchQuery : '';
    const itemColor = isDeleted ? '#b91c1c' : isRetiro ? '#166534' : '#5c4436';

    return (
      <div
        key={key}
        style={{
          cursor: 'pointer',
          padding: '0.78rem 0.25rem',
          borderBottom: i < totalLen - 1 ? '1px solid rgba(43, 29, 20, 0.12)' : 'none',
          backgroundColor: isDeleted ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          transition: 'background-color 0.15s ease',
        }}
        onClick={() => {
          setSelectedRecord(r);
          setEditForm({
            amount: Math.abs(r.Amount),
            desc: r.Description || '',
            user: r.User || '',
            type: r.Category === 'Retiro' ? 'Retiro' : 'Gasto',
            image: null,
            currentImage: r.Imagen || null,
          });
          setIsConfirmingDelete(false);
          setEditErrors({});
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: isDeleted ? '#b91c1c' : '#2b1d14' }}>
              {highlightText(r.User, activeSearchHighlight)}
            </span>
            <span style={{ fontSize: '0.78rem', color: '#5c4436', opacity: 0.9 }}>
              {r.Date ? r.Date.split(' ')[0] : ''}
            </span>
            {r.Imagen && (
              <span title="Justificante adjunto" style={{ display: 'inline-flex', color: '#5c4436' }}>
                <FileText size={15} />
              </span>
            )}
            {isDeleted && <span style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600 }}>(Eliminada)</span>}
          </div>

          {r.Description && (
            <span style={{ fontSize: '0.83rem', color: '#5c4436', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {highlightText(r.Description, activeSearchHighlight)}
            </span>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: itemColor }}>{formatCurrency(Math.abs(r.Amount))}</div>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, color: itemColor, opacity: 0.9, marginTop: '1px' }}>
            {isRetiro ? 'INGRESO' : 'GASTO'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container" style={{ padding: '1rem', paddingBottom: '8rem' }}>
      {!(isSearchOpen && searchQuery.trim() !== '') && (
        <BalancesSummary
          finances={finances}
          showFinanceDetails={showFinanceDetails}
          setShowFinanceDetails={setShowFinanceDetails}
        />
      )}

      <div
        style={{
          backgroundColor: '#f1ebe6',
          borderRadius: '14px',
          border: '1px solid #e7e0d8',
          padding: '1.15rem 1rem 0.5rem 1rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
          marginTop: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isAddFormOpen || hasActiveFilters || displayRecords.length > 0 || selectedRecord ? '0.65rem' : '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
            <h2 className="section-title" style={{ margin: 0, padding: 0, fontSize: '1.5rem', fontWeight: 'bold', color: '#2b1d14' }}>
              {isSearchOpen && searchQuery.trim() !== '' ? `Resultados de búsqueda (${displayRecords.length})` : 'Transacciones'}
            </h2>
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              title={isFilterOpen ? 'Cerrar filtros' : 'Filtrar transacciones'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.4rem',
                borderRadius: '6px',
                backgroundColor: isFilterOpen || hasActiveFilters ? 'rgba(0, 151, 157, 0.16)' : 'transparent',
                color: isFilterOpen || hasActiveFilters ? '#00979d' : '#5c4436',
                border: isFilterOpen || hasActiveFilters ? '1px solid #00979d' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <Filter size={22} />
              {hasActiveFilters && (
                <span
                  style={{
                    position: 'absolute',
                    top: '3px',
                    right: '3px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#00979d',
                    boxShadow: '0 0 0 2px #f1ebe6',
                  }}
                />
              )}
            </button>
          </div>

          {!(isSearchOpen && searchQuery.trim() !== '') && (
            <button
              type="button"
              onClick={() => setIsAddFormOpen((prev) => !prev)}
              aria-label={isAddFormOpen ? 'Cerrar formulario' : 'Abrir formulario Agregar Movimiento'}
              title={isAddFormOpen ? 'Cerrar formulario' : 'Agregar Movimiento'}
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
          )}
        </div>

        {!(isSearchOpen && searchQuery.trim() !== '') && (
          <AddTransactionForm
            isAddFormOpen={isAddFormOpen}
            setIsAddFormOpen={setIsAddFormOpen}
            users={users}
            user={user}
            setUser={setUser}
            amount={amount}
            setAmount={setAmount}
            type={type}
            setType={setType}
            description={description}
            setDescription={setDescription}
            image={image}
            setImage={setImage}
            formErrors={formErrors}
            setFormErrors={setFormErrors}
            loading={loading}
            handleAdd={handleAdd}
          />
        )}

        {hasActiveFilters && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              alignItems: 'center',
              marginBottom: '0.9rem',
              padding: '0.6rem 0.8rem',
              backgroundColor: 'rgba(0, 151, 157, 0.08)',
              borderRadius: '8px',
              border: '1px solid rgba(0, 151, 157, 0.2)',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#00979d', fontWeight: 600 }}>Filtros activos:</span>
            {filterCategory === 'Gasto' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                Categoría: Gasto <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterCategory('ALL')} />
              </span>
            )}
            {filterCategory === 'Retiro' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: 600, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                Categoría: Ingreso <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterCategory('ALL')} />
              </span>
            )}
            {filterUser !== 'ALL' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(0, 151, 157, 0.15)', color: '#007a7f', fontWeight: 600, border: '1px solid rgba(0, 151, 157, 0.3)' }}>
                Usuario: {filterUser} <X size={13} style={{ cursor: 'pointer' }} onClick={() => setFilterUser('ALL')} />
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setFilterCategory('ALL');
                setFilterUser('ALL');
              }}
              style={{ background: 'none', border: 'none', color: '#5c4436', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', marginLeft: 'auto' }}
            >
              Limpiar todos
            </button>
          </div>
        )}

        {!selectedRecord ? (
          displayRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.6rem 1rem 1.8rem 1rem', color: '#5c4436' }}>
              <div style={{ fontSize: '2.1rem', marginBottom: '0.45rem' }}>🍃</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#2b1d14' }}>
                No hay transacciones
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: '#5c4436' }}>
                {hasActiveFilters
                  ? 'No se encontraron resultados con los filtros aplicados.'
                  : 'No se han registrado movimientos todavía.'}
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterCategory('ALL');
                    setFilterUser('ALL');
                  }}
                  style={{ marginTop: '1rem', padding: '0.5rem 1.2rem', borderRadius: '8px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Restablecer Filtros
                </button>
              )}
            </div>
          ) : (
            <div>{displayRecords.map((r, i) => renderItem(r, i, displayRecords.length))}</div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(() => {
              const selectedIdx = displayRecords.findIndex((r) => r.TransactionID === selectedRecord.TransactionID);
              if (selectedIdx === -1) {
                return (
                  <>
                    {renderEditForm()}
                    {displayRecords.length > 0 && <div>{displayRecords.map((r, i) => renderItem(r, i, displayRecords.length))}</div>}
                  </>
                );
              }
              const before = displayRecords.slice(0, selectedIdx);
              const after = displayRecords.slice(selectedIdx + 1);
              return (
                <>
                  {before.length > 0 && <div>{before.map((r, i) => renderItem(r, i, before.length))}</div>}
                  {renderEditForm()}
                  {after.length > 0 && <div>{after.map((r, i) => renderItem(r, i, after.length))}</div>}
                </>
              );
            })()}
          </div>
        )}
      </div>

      <TransactionsFilterDrawer
        isFilterOpen={isFilterOpen}
        setIsFilterOpen={setIsFilterOpen}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        filterUser={filterUser}
        setFilterUser={setFilterUser}
        records={records}
        users={users}
        displayRecordsCount={displayRecords.length}
      />

      {expandedImage &&
        createPortal(
          <div
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '1rem' }}
            onClick={() => setExpandedImage(null)}
          >
            <button style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'white', fontSize: '3rem', cursor: 'pointer' }}>&times;</button>
            <img src={expandedImage} alt="Expanded" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>,
          document.body
        )}

      {successMsg &&
        createPortal(
          <div
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, padding: '1.5rem' }}
          >
            <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem 1.5rem', borderRadius: '8px', textAlign: 'center', width: '100%', maxWidth: '400px', border: '1px solid var(--primary)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '1.3rem' }}>¡Éxito!</h3>
              <p style={{ color: 'white', fontSize: '1.1rem', margin: 0 }}>{successMsg}</p>
            </div>
          </div>,
          document.body
        )}

      <SectionChatIA
        section="gasto-ingreso"
        contextData={{
          records,
          finances,
          users,
          currentUser,
        }}
        onRefresh={refetchTransactions}
        onSelectResultItem={(r) => {
          if (!r) return;
          setSelectedRecord(r);
          setEditForm({
            amount: Math.abs(r.Amount),
            desc: r.Description || '',
            user: r.User || '',
            type: r.Category === 'Retiro' ? 'Retiro' : 'Gasto',
            image: null,
            currentImage: r.Imagen || null,
          });
          setIsConfirmingDelete(false);
          setEditErrors({});
          setTimeout(() => {
            const el = document.getElementById('edit-tx-form');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
        }}
      />
    </div>
  );
}
