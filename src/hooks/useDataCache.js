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
    const { data } = await supabase.from('events').select('*, profiles(name)');
    if (data) setEvents(data);
  }, []);

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase.from('transactions').select('*, profiles(name)');
    if (data) setTransactions(data);
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchEvents();
    fetchTransactions();
  }, [fetchUsers, fetchEvents, fetchTransactions]);

  return {
    users,
    events,
    transactions,
    refetchUsers: fetchUsers,
    refetchEvents: fetchEvents,
    refetchTransactions: fetchTransactions
  };
}
