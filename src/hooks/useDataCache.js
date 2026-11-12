import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export function useDataCache() {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('name');
    if (data) setUsers(data);
  }, []);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*, profiles(name)')
      .order('date', { ascending: true });
    if (data) setEvents(data);
  }, []);

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*, profiles(name)')
      .order('date', { ascending: false });
    if (data) setTransactions(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase.from('events').select('*, profiles(name)').order('date', { ascending: true }),
      supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }),
    ]).then(([usersRes, eventsRes, txRes]) => {
      if (cancelled) return;
      if (usersRes.data) setUsers(usersRes.data);
      if (eventsRes.data) setEvents(eventsRes.data);
      if (txRes.data) setTransactions(txRes.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    users,
    events,
    transactions,
    refetchUsers: fetchUsers,
    refetchEvents: fetchEvents,
    refetchTransactions: fetchTransactions
  };
}
