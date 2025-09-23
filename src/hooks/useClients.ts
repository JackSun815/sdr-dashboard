import { useEffect, useState } from 'react';
import { supabase, withRetry } from '../lib/supabase';
import { useAgency } from '../contexts/AgencyContext';
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

export function useClients(sdrId?: string | null, supabaseClient?: any) {
  const { agency } = useAgency();
  const client = supabaseClient || supabase;
  
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
      let assignmentsQuery = client
        .from('assignments')
        .select(`
          monthly_set_target,
          monthly_hold_target,
          clients!inner (
            id,
            name,
            monthly_set_target,
            monthly_hold_target,
            created_at,
            updated_at,
            archived_at
          )
        `)
        .is('clients.archived_at', null) // Only fetch assignments for non-archived clients
        .eq('sdr_id', sdrId as any)
        .eq('month', `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}` as any)
        .eq('is_active', true); // Only fetch active assignments
      
      if (agency) {
        assignmentsQuery = assignmentsQuery.eq('agency_id', agency.id);
      }
      
      const assignmentsResult = await (async () => await withRetry(() => assignmentsQuery))() as any;
      const assignmentsData = (typeof assignmentsResult === 'object' && assignmentsResult !== null && 'data' in assignmentsResult) ? assignmentsResult.data : [];
      const assignmentsError = (typeof assignmentsResult === 'object' && assignmentsResult !== null && 'error' in assignmentsResult) ? assignmentsResult.error : null;
      if (assignmentsError) throw assignmentsError;
      const assignments = assignmentsData || [];

      // Debug: Log assignments data in development
      if (import.meta.env.MODE === 'development' && sdrId) {
        console.log('🔍 useClients Debug:');
        console.log('SDR ID filter:', sdrId);
        console.log('Assignments count:', assignments.length);
        console.log('All SDR IDs in assignments:', [...new Set(assignments.map((a: any) => a.sdr_id))]);
        
        // Check if assignments filtering is working
        const filteredAssignments = assignments.filter((a: any) => a.sdr_id === sdrId);
        console.log('Filtered assignments count:', filteredAssignments.length);
        
        if (assignments.length !== filteredAssignments.length) {
          console.warn('⚠️ Assignments filtering issue detected!');
          console.warn('Expected only SDR ID:', sdrId);
          console.warn('Found SDR IDs:', [...new Set(assignments.map((a: any) => a.sdr_id))]);
        }
      }

      // Calculate total meeting goal from assignments (using set target)
      const totalGoal = Array.isArray(assignments) ? assignments.reduce((sum: any, assignment: any) => 
        sum + (assignment.monthly_set_target || 0), 0) : 0;
      setTotalMeetingGoal(totalGoal);

      // Fetch all meetings for this SDR (filter by created_at in JS)
      let meetingsQuery = client
        .from('meetings')
        .select('*, clients(name)')
        .eq('sdr_id', sdrId as any);
      
      if (agency) {
        meetingsQuery = meetingsQuery.eq('agency_id', agency.id);
      }
      
      const meetingsResult = await (async () => await withRetry(() => meetingsQuery))() as any;
      const meetingsData = (typeof meetingsResult === 'object' && meetingsResult !== null && 'data' in meetingsResult) ? meetingsResult.data : [];
      const meetingsError = (typeof meetingsResult === 'object' && meetingsResult !== null && 'error' in meetingsResult) ? meetingsResult.error : null;
      if (meetingsError) throw meetingsError;
      const meetings = meetingsData || [];

      // After fetching meetings and assignments, ensure they are arrays
      const safeMeetings = Array.isArray(meetings) ? meetings : [];
      const safeAssignments = Array.isArray(assignments) ? assignments : [];

      // After fetching meetings, filter clientMeetings by created_at in the current month
      const clientsWithMetrics = safeAssignments.map((assignment: any) => {
        // Only include meetings created this month
        const clientMeetings = safeMeetings.filter(
          (meeting) => meeting.client_id === assignment.clients.id &&
            new Date(meeting.created_at) >= monthStart &&
            new Date(meeting.created_at) <= monthEnd
        );

        // Confirmed meetings (status = confirmed, not no-show)
        const confirmedMeetings = clientMeetings.filter(
          meeting => meeting.status === 'confirmed' && !meeting.no_show
        ).length;

        // Pending meetings (status = pending, not no-show, not held)
        const pendingMeetings = clientMeetings.filter(
          meeting => meeting.status === 'pending' && !meeting.no_show && !meeting.held_at
        ).length;

        // Held meetings (must have held_at date and be confirmed, exclude no-shows)
        const heldMeetings = clientMeetings.filter(
          (meeting) =>
            meeting.status === 'confirmed' &&
            !meeting.no_show &&
            meeting.held_at !== null
        ).length;

        // Total meetings set (include all meetings, including no-shows)
        const totalMeetingsSet = clientMeetings.length;
        
        console.log(`Client ${assignment.clients.name} held meetings:`, heldMeetings);
        console.log(`Client ${assignment.clients.name} meetings with held_at:`, clientMeetings.filter(m => m.held_at !== null).length);
        console.log(`Client ${assignment.clients.name} confirmed meetings:`, clientMeetings.filter(m => m.status === 'confirmed').length);

        return {
          ...assignment.clients, // Spread all client properties (including created_at, updated_at)
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
      const monthlyMeetings = safeMeetings;

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
    if (agency) {
      fetchClients();

      // Subscribe to changes in meetings and assignments
      const channel = client.channel('client-changes')
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
        client.removeChannel(channel);
      };
    }
  }, [sdrId, client, agency]);

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
