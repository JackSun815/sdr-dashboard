import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAgency } from '../contexts/AgencyContext';
import type { Meeting } from '../types/database';

interface MeetingContact {
  contact_full_name: string;
  contact_email: string;
  contact_phone?: string;
}

export function useMeetings(sdrId?: string | null, supabaseClient?: any, fetchAll: boolean = false) {
  const { agency } = useAgency();
  const client = supabaseClient || supabase;
  
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchMeetings() {
    // Only fetch all meetings if fetchAll is true (manager dashboard)
    if (fetchAll) {
      try {
        let query = client
          .from('meetings')
          .select('*, clients(name)')
          .order('scheduled_date', { ascending: true });
        
        if (agency) {
          query = query.eq('agency_id', agency.id);
        }
        
        const { data, error } = await query as any;
        if (error) throw error;
        setMeetings((data || []) as unknown as Meeting[]);
        setError(null);
      } catch (err) {
        console.error('Meetings fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch meetings');
        setMeetings([]);
      } finally {
        setLoading(false);
      }
      return;
    }
    // For SDR dashboard: only fetch if sdrId is a valid, non-empty string
    if (typeof sdrId !== 'string' || sdrId.length === 0) {
      setMeetings([]);
      setLoading(false);
      return;
    }
    try {
      let query = client
        .from('meetings')
        .select('*, clients(name)')
        .order('scheduled_date', { ascending: true })
        .eq('sdr_id', sdrId as any);
      
      if (agency) {
        query = query.eq('agency_id', agency.id);
      }
      
      const { data, error } = await query as any;
      if (error) throw error;
      setMeetings((data || []) as unknown as Meeting[]);
      setError(null);
    } catch (err) {
      console.error('Meetings fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch meetings');
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (agency) {
      // Reset meetings state when sdrId changes
      setMeetings([]);
      setLoading(true);
      setError(null);
      fetchMeetings();

      // Subscribe to meeting changes, but only trigger refresh if the change affects this SDR
      const subscription = client
        .channel('meetings-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'meetings'
          },
          (payload: any) => {
            const changedMeetingSdrId = (payload.new as any)?.sdr_id;
            if (fetchAll || (sdrId && changedMeetingSdrId === sdrId)) {
              fetchMeetings();
            }
          }
        )
        .subscribe();

      return () => {
        client.removeChannel(subscription);
      };
    }
  }, [sdrId, client, fetchAll, agency]);

  async function addMeeting(
    clientId: string,
    scheduledDate: string,
    sdrId: string,
    meetingDetails: any
  ) {
    try {
      // Ensure we have an agency before creating a meeting
      if (!agency?.id) {
        throw new Error('Agency context is required to create meetings. Please refresh the page and try again.');
      }

      const { status: _, ...cleanDetails } = meetingDetails;
    
      // Create the insert data without ICP fields first
      const insertData: any = {
        client_id: clientId,
        sdr_id: sdrId,
        scheduled_date: scheduledDate,
        status: 'pending',  // Hardcoded to pending
        no_show: false,     // Explicit defaults
        held_at: null,
        created_at: new Date().toISOString(),
        agency_id: agency.id, // Add agency_id from context (already checked above)
        ...cleanDetails
      };

      // Try to add ICP status if the column exists
      try {
        insertData.icp_status = 'pending';
      } catch (err) {
        // If ICP column doesn't exist, continue without it
        console.log('ICP status column not available, skipping');
      }

      const { error } = await client
        .from('meetings')
        .insert([insertData]);

      if (error) {
        // If the error is about missing ICP column, try again without it
        if (error.message && error.message.includes('icp_status')) {
          console.log('Retrying without ICP status field');
          delete insertData.icp_status;
          
          const { error: retryError } = await client
            .from('meetings')
            .insert([insertData]);
            
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }
      
      await fetchMeetings();
      return null; // We don't need the returned data since we refresh the list
    } catch (err) {
      console.error('Error adding meeting:', err);
      throw err;
    }
  }
  async function updateMeeting(updatedMeeting: Meeting) {
  try {
    console.log('updateMeeting called with:', updatedMeeting);
    const updateData: any = {
      contact_full_name: updatedMeeting.contact_full_name,
      contact_email: updatedMeeting.contact_email,
      contact_phone: updatedMeeting.contact_phone,
      scheduled_date: updatedMeeting.scheduled_date,
      status: updatedMeeting.status,
      no_show: updatedMeeting.no_show,
      no_longer_interested: updatedMeeting.no_longer_interested,
      company: updatedMeeting.company,
      linkedin_page: updatedMeeting.linkedin_page,
      notes: updatedMeeting.notes,
      timezone: updatedMeeting.timezone, // Save prospect's timezone
      updated_at: new Date().toISOString(),
    };
    console.log('updateData being sent to database:', updateData);
    if (typeof updatedMeeting.held_at !== 'undefined') {
      updateData.held_at = updatedMeeting.held_at;
      if (updatedMeeting.held_at) {
        updateData.status = 'confirmed';
        updateData.no_show = false;
      }
    }
    if (typeof updatedMeeting.icp_status !== 'undefined') {
      updateData.icp_status = updatedMeeting.icp_status;
      updateData.icp_checked_at = new Date().toISOString();
      updateData.icp_checked_by = null; // Optionally set to SDR id if available
    }
    const { error } = await client
      .from('meetings')
      .update(updateData)
      .eq('id', updatedMeeting.id as any);

    if (error) throw error;
    await fetchMeetings();
  } catch (err) {
    console.error('Update meeting error:', err);
    throw new Error(err instanceof Error ? err.message : 'Failed to update meeting');
  }
}

  async function updateMeetingHeldDate(meetingId: string, heldDate: string | null) {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      
      if (heldDate) {
        updateData.held_at = heldDate;
        updateData.no_show = false; // Explicitly set no_show to false when marking as held
      } else {
        updateData.held_at = null;
        
        const { data: meeting } = await client
          .from('meetings')
          .select('scheduled_date')
          .eq('id', meetingId as any)
          .single();
          
        if (meeting && (meeting as any).scheduled_date) {
          const meetingDateString = (meeting as any).scheduled_date.split('T')[0];
          const todayString = new Date().toISOString().split('T')[0];
          
          if (meetingDateString < todayString) {
            updateData.no_show = true;
          }
        }
      }

      const { error } = await client
        .from('meetings')
        .update(updateData)
        .eq('id', meetingId as any);

      if (error) throw error;
      await fetchMeetings();
    } catch (err) {
      console.error('Update meeting held date error:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to update meeting held date');
    }
  }

  async function updateMeetingConfirmedDate(meetingId: string, confirmedDate: string | null) {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      
      if (confirmedDate) {
        updateData.confirmed_at = confirmedDate;
        updateData.status = 'confirmed';
      } else {
        updateData.confirmed_at = null;
        updateData.status = 'pending';
      }

      const { error } = await client
        .from('meetings')
        .update(updateData)
        .eq('id', meetingId as any);

      if (error) throw error;
      await fetchMeetings();
    } catch (err) {
      console.error('Update meeting confirmed date error:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to update meeting confirmed date');
    }
  }

  async function deleteMeeting(meetingId: string) {
    try {
      const { error } = await client
        .from('meetings')
        .delete()
        .eq('id', meetingId as any);

      if (error) throw error;
      await fetchMeetings();
    } catch (err) {
      console.error('Delete meeting error:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to delete meeting');
    }
  }

  // Calculate pending meetings using the same logic as Team Meetings
  const nowDate = new Date();
  const pendingMeetings = meetings.filter(
    meeting => meeting.status === 'pending' && !meeting.no_show && new Date(meeting.scheduled_date) >= nowDate
  ).length;

  return { 
    meetings, 
    loading, 
    error, 
    addMeeting, 
    updateMeeting,
    updateMeetingHeldDate,
    updateMeetingConfirmedDate,
    deleteMeeting, 
    fetchMeetings,
    pendingMeetings
  };
}