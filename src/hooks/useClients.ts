import { useEffect, useState } from 'react';
import { supabase, withRetry } from '../lib/supabase';
import type { Client, Meeting } from '../types/database';

interface ClientWithMetrics extends Client {
  monthly_set_target: number;
  monthly_hold_target: number;
  confirmedMeetings: number;
  pendingMeetings: number;
  todaysMeetings: Meeting[];
  heldMeetings: number;
  totalMeetingsSet: number;
}

export function useClients(sdrId?: string | null, supabaseClient = supabase) {
  const [clients, setClients] = useState<ClientWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalMeetingGoal, setTotalMeetingGoal] = useState(0);
  const [totalBookedMeetings, setTotalBookedMeetings] = useState(0);
  const [totalPendingMeetings, setTotalPendingMeetings] = useState(0);

  async function fetchClients() {
    try {
      if (!sdrId) {
        setClients([]);
        setLoading(false);
        return;
      }

      // Get current month's start and end dates
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Fetch assigned clients with their targets for the current month
      const { data: assignments, error: assignmentsError } = await withRetry(() =>
        supabaseClient
          .from('assignments')
          .select(`
            monthly_set_target,
            monthly_hold_target,
            clients (
              id,
              name,
              monthly_set_target,
              monthly_hold_target
            )
          `)
          .eq('sdr_id', sdrId)
          .eq('month', `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`)
      );

      if (assignmentsError) throw assignmentsError;

      // Calculate total meeting goal from assignments (using set target)
      const totalGoal = assignments?.reduce((sum, assignment: any) => 
        sum + (assignment.monthly_set_target || 0), 0) || 0;
      setTotalMeetingGoal(totalGoal);

      // Fetch meetings for this month
      const { data: meetings, error: meetingsError } = await withRetry(() =>
        supabaseClient
          .from('meetings')
          .select('*, clients(name)')
          .eq('sdr_id', sdrId)
          .gte('scheduled_date', monthStart.toISOString())
          .lte('scheduled_date', monthEnd.toISOString())
      );

      if (meetingsError) throw meetingsError;

      // Update the counting logic in your map function:
      const clientsWithMetrics = (assignments || []).map((assignment: any) => {
      const clientMeetings = meetings?.filter(
        (meeting) => meeting.client_id === assignment.clients.id
      ) || [];

      // Pending meetings (status = pending, not no-show, not held)
      const pendingMeetings = clientMeetings.filter(
        meeting => meeting.status === 'pending' && !meeting.no_show && !meeting.held_at
      ).length;

      // Confirmed but not yet held meetings
      const confirmedMeetings = clientMeetings.filter(
        meeting => meeting.status === 'confirmed' && !meeting.no_show && !meeting.held_at
      ).length;

      // Held meetings (must have held_at date and be confirmed, exclude no-shows)
      const heldMeetings = clientMeetings.filter(
        (meeting) =>
          meeting.status === 'confirmed' &&
          !meeting.no_show &&
          meeting.held_at !== null
      ).length;
      
      console.log(`Client ${assignment.clients.name} held meetings:`, heldMeetings);
      console.log(`Client ${assignment.clients.name} meetings with held_at:`, clientMeetings.filter(m => m.held_at !== null).length);
      console.log(`Client ${assignment.clients.name} confirmed meetings:`, clientMeetings.filter(m => m.status === 'confirmed').length);

      // Total meetings set (pending + confirmed, whether held or not)
      const totalMeetingsSet = clientMeetings.filter(
        meeting => !meeting.no_show
      ).length;

      return {
        id: assignment.clients.id,
        name: assignment.clients.name,
        monthly_set_target: assignment.monthly_set_target || 0,
        monthly_hold_target: assignment.monthly_hold_target || 0,
        confirmedMeetings,
        pendingMeetings,
        heldMeetings,
        todaysMeetings: clientMeetings.filter(
          meeting => new Date(meeting.scheduled_date).toDateString() === new Date().toDateString()
        ),
        totalMeetingsSet
      };
    });
      // Then update your total counts to match:
      const monthlyMeetings = meetings || [];

      // Total confirmed (status = confirmed and not no-show)
      const totalConfirmed = monthlyMeetings.filter(
        meeting => meeting.status === 'confirmed' && !meeting.no_show
      ).length;

      // Total pending (status = pending and not no-show)
      const totalPending = monthlyMeetings.filter(
        meeting => meeting.status === 'pending' && !meeting.no_show
      ).length;

      // Total held (must have held_at date)
      const totalHeld = monthlyMeetings.filter(
        meeting => meeting.held_at !== null && meeting.status === 'confirmed'
      ).length;

      // Total no-shows
      const totalNoShows = monthlyMeetings.filter(
        meeting => meeting.no_show
      ).length;

      setTotalBookedMeetings(totalConfirmed);
      setTotalPendingMeetings(totalPending);
      setClients(clientsWithMetrics);

      setTotalBookedMeetings(totalConfirmed);
      setTotalPendingMeetings(totalPending);
      setClients(clientsWithMetrics);
    } catch (err) {
      console.error('Client data fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch client data');
      setClients([]);
      setTotalMeetingGoal(0);
      setTotalBookedMeetings(0);
      setTotalPendingMeetings(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchClients();

    // Subscribe to changes in meetings and assignments
    const channel = supabaseClient.channel('client-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignments'
        },
        () => fetchClients()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetings'
        },
        () => fetchClients()
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [sdrId, supabaseClient]);

  return { 
    clients, 
    loading, 
    error, 
    fetchClients, 
    totalMeetingGoal,
    totalBookedMeetings,
    totalPendingMeetings
  };
}
