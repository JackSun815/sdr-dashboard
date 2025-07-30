import React, { useState } from 'react';
import { Calendar, CheckCircle, AlertCircle, TrendingUp, Target, Clock, Search, Download } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { MeetingCard } from '../components/MeetingCard';
import type { Meeting } from '../types/database';
import { DateTime } from 'luxon';
import { supabase } from '../lib/supabase';
import type { Assignment, Client } from '../types/database';

interface MeetingStats {
  totalBooked: number;
  totalHeld: number;
  totalNoShow: number;
  showRate: number;
  percentToGoal: number;
}

interface MeetingsHistoryProps {
  meetings: Meeting[];
  loading: boolean;
  error: string | null;
  onUpdateHeldDate: (meetingId: string, heldDate: string | null) => void;
  onUpdateConfirmedDate: (meetingId: string, confirmedDate: string | null) => void;
  sdrId: string; // <-- Accept sdrId as a prop
}

export default function MeetingsHistory({ 
  meetings, 
  loading, 
  error,
  onUpdateHeldDate,
  onUpdateConfirmedDate,
  sdrId
}: MeetingsHistoryProps) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>(
    now.toISOString().slice(0, 7)
  );
  const [searchTerm, setSearchTerm] = useState('');
  // Export modal state
  const [showExport, setShowExport] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'client', 'contact', 'email', 'phone', 'date', 'status', 'notes'
  ]);

  // Assignment and modal state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'set' | 'held' | 'booked' | 'held' | 'noShows' | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allClientsLoading, setAllClientsLoading] = useState(false);

  const columnOptions = [
    { key: 'client', label: 'Client Name' },
    { key: 'contact', label: 'Contact Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status' },
    { key: 'notes', label: 'Notes' },
  ];

  function getMeetingField(meeting: Meeting, key: string) {
    switch (key) {
      case 'client': return (meeting as any).clients?.name || '';
      case 'contact': return meeting.contact_full_name || '';
      case 'email': return meeting.contact_email || '';
      case 'phone': return meeting.contact_phone || '';
      case 'date':
        if (meeting.scheduled_date) {
          const timezone = meeting.timezone || 'America/New_York';
          const dt = DateTime.fromISO(meeting.scheduled_date, { zone: timezone });
          return dt.toFormat('ccc, LLL d, h:mm a') + ' ' + (dt.offsetNameShort || timezone);
        }
        return '';
      case 'status':
        if (meeting.no_show) return 'No Show';
        if (meeting.held_at) return 'Held';
        return meeting.status === 'confirmed' ? 'Confirmed' : 'Pending';
      case 'notes': return meeting.notes || '';
      default: return '';
    }
  }

  function exportCSV() {
    const header = selectedColumns.map(key => {
      const col = columnOptions.find(c => c.key === key);
      return col ? col.label : key;
    });
    const rows = filteredMeetings.map(meeting =>
      selectedColumns.map(key => {
        let val = getMeetingField(meeting, key);
        // Escape quotes and commas
        if (typeof val === 'string') {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      })
    );
    const csvContent = [header, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meetings_export_${selectedMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExport(false);
  }

  // Fetch assignments for the selected month and sdrId
  React.useEffect(() => {
    if (!sdrId || !selectedMonth) {
      console.log('[DEBUG] Missing required data:', { sdrId, selectedMonth });
      return;
    }
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    console.log('[DEBUG] Fetching assignments for:', { sdrId, selectedMonth });
    
    // First, let's check if there are any assignments at all for this SDR
    supabase
      .from('assignments')
      .select('*')
      .eq('sdr_id', sdrId as any)
      .then(({ data: allAssignments, error: allError }) => {
        console.log('[DEBUG] All assignments for SDR:', allAssignments);
        if (allError) console.log('[DEBUG] Error fetching all assignments:', allError);
      });

    // Now fetch assignments for the specific month with assignment targets
    supabase
      .from('assignments')
      .select(`
        id,
        sdr_id,
        client_id,
        monthly_target,
        monthly_set_target,
        monthly_hold_target,
        month,
        clients (
          id,
          name,
          monthly_set_target,
          monthly_hold_target
        )
      `)
      .eq('sdr_id', sdrId as any)
      .eq('month', selectedMonth as any)
      .then(({ data, error }) => {
        if (error) {
          console.log('[DEBUG] Error fetching assignments:', error);
          setAssignmentsError(error.message);
        } else {
          console.log('[DEBUG] Assignments data for month:', data);
          setAssignments((data ?? []) as unknown as Assignment[]);
        }
        setAssignmentsLoading(false);
      });
  }, [sdrId, selectedMonth]);

  // Fetch all clients if no assignments exist (fallback)
  React.useEffect(() => {
    if (assignments.length === 0 && !assignmentsLoading && sdrId) {
      console.log('[DEBUG] No assignments found, fetching all clients as fallback');
      setAllClientsLoading(true);
      supabase
        .from('clients')
        .select('*')
        .then(({ data, error }) => {
          if (error) {
            console.log('[DEBUG] Error fetching all clients:', error);
          } else {
            console.log('[DEBUG] All clients data:', data);
            setAllClients((data ?? []) as unknown as Client[]);
          }
          setAllClientsLoading(false);
        });
    }
  }, [assignments.length, assignmentsLoading, sdrId]);

  // Fetch clients for assignments (when modal opens)
  React.useEffect(() => {
    if (!modalOpen || assignments.length === 0) return;
    setClientsLoading(true);
    setClientsError(null);
    const clientIds = assignments.map(a => a.client_id);
    if (clientIds.length === 0) {
      setClients([]);
      setClientsLoading(false);
      return;
    }
    supabase
      .from('clients')
      .select('*')
      .in('id', clientIds as any)
      .then(({ data, error }) => {
        if (error) setClientsError(error.message);
        else setClients((data ?? []) as unknown as Client[]);
        setClientsLoading(false);
      });
  }, [modalOpen, assignments]);

  // Calculate targets from assignments (sum up assignment targets, not client targets)
  const totalSetTarget = assignments.length > 0 
    ? assignments.reduce((sum, a) => {
        return sum + ((a as any).monthly_set_target || 0);
      }, 0)
    : allClients.reduce((sum, client) => sum + (client.monthly_set_target || 0), 0);
  
  const totalHeldTarget = assignments.length > 0
    ? assignments.reduce((sum, a) => {
        return sum + ((a as any).monthly_hold_target || 0);
      }, 0)
    : allClients.reduce((sum, client) => sum + (client.monthly_hold_target || 0), 0);
  
  console.log('[DEBUG] totalSetTarget:', totalSetTarget, 'totalHeldTarget:', totalHeldTarget, 'assignments:', assignments, 'allClients:', allClients);

  // Modal open helpers
  const openTargetModal = (type: 'set' | 'held') => {
    setModalType(type);
    setModalOpen(true);
  };
  
  const openMeetingsModal = (type: 'booked' | 'held' | 'noShows') => {
    setModalType(type);
    setModalOpen(true);
  };
  
  const closeModal = () => {
    setModalOpen(false);
    setModalType(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-md">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Calculate all-time statistics
  const calculateAllTimeStats = (): MeetingStats => {
    const totalBooked = meetings.length;
    const totalHeld = meetings.filter(m => m.held_at !== null && !m.no_show).length;
    const totalNoShow = meetings.filter(m => m.no_show).length;
    const showRate = totalBooked > 0 ? (totalHeld / totalBooked) * 100 : 0;
    const monthlyTarget = 50; // Example monthly target
    const averageMonthlyBookings = totalBooked / 12; // Simplified calculation
    const percentToGoal = (averageMonthlyBookings / monthlyTarget) * 100;

    return {
      totalBooked,
      totalHeld,
      totalNoShow,
      showRate,
      percentToGoal
    };
  };

  // Filter meetings for selected month (use created_at instead of scheduled_date)
  const monthMeetings = meetings.filter(meeting => 
    meeting.created_at.startsWith(selectedMonth)
  );

  // Calculate monthly statistics (align with dashboard)
  const calculateMonthlyStats = (monthMeetings: Meeting[]): MeetingStats => {
    const totalBooked = monthMeetings.length;
    const totalHeld = monthMeetings.filter(m => m.held_at !== null && !m.no_show).length;
    const totalNoShow = monthMeetings.filter(m => m.no_show).length;
    const showRate = totalBooked > 0 ? (totalHeld / totalBooked) * 100 : 0;
    const monthlyTarget = 50; // Example monthly target
    const percentToGoal = (totalBooked / monthlyTarget) * 100;

    return {
      totalBooked,
      totalHeld,
      totalNoShow,
      showRate,
      percentToGoal
    };
  };

  // Generate month options for the last 12 months
  let monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(now, i);
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy')
    };
  });
  // Always add the next month as an option at the start
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  monthOptions = [
    {
      value: format(nextMonth, 'yyyy-MM'),
      label: format(nextMonth, 'MMMM yyyy')
    },
    ...monthOptions
  ];

  // Filter meetings based on search term
  const filteredMeetings = monthMeetings.filter(meeting => {
    const searchString = `${(meeting as any).clients?.name || ''} ${meeting.contact_full_name || ''} ${meeting.contact_email || ''} ${meeting.contact_phone || ''}`.toLowerCase();
    return searchString.includes(searchTerm.toLowerCase());
  });

  const allTimeStats = calculateAllTimeStats();
  const monthlyStats = calculateMonthlyStats(monthMeetings);
  const selectedMonthLabel = monthOptions.find(m => m.value === selectedMonth)?.label;

  return (
    <div className="space-y-6">
      {/* All-time Stats */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">All-time Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div>
            <p className="text-sm text-gray-500">Total Meetings Booked</p>
            <p className="text-2xl font-bold text-gray-900">{allTimeStats.totalBooked}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Meetings Held</p>
            <p className="text-2xl font-bold text-green-600">{allTimeStats.totalHeld}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total No Shows</p>
            <p className="text-2xl font-bold text-red-600">{allTimeStats.totalNoShow}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Show Rate</p>
            <p className="text-2xl font-bold text-indigo-600">
              {allTimeStats.showRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Avg. % to Goal</p>
            <p className="text-2xl font-bold text-gray-900">
              {allTimeStats.percentToGoal.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Stats and Controls */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">{selectedMonthLabel}</h2>
          <div className="flex gap-2 items-center">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {monthOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium shadow transition"
              onClick={() => setShowExport(true)}
              title="Export meetings"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Export Modal */}
        {showExport && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Export Meetings</h3>
              <div className="mb-4">
                <p className="text-sm text-gray-700 mb-2">Select columns to include:</p>
                <div className="grid grid-cols-2 gap-2">
                  {columnOptions.map(col => (
                    <label key={col.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(col.key)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedColumns([...selectedColumns, col.key]);
                          } else {
                            setSelectedColumns(selectedColumns.filter(k => k !== col.key));
                          }
                        }}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  onClick={() => setShowExport(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold"
                  onClick={exportCSV}
                  disabled={selectedColumns.length === 0}
                >
                  Export
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NEW TARGETS TO BE ADDED HERE */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
          {/* Monthly Set Target Card */}
          <div
            className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:bg-indigo-50 transition"
            onClick={() => openTargetModal('set')}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Monthly Set Target</h3>
              <Target className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-indigo-600">{totalSetTarget}</p>
          </div>
          {/* Monthly Held Target Card */}
          <div
            className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:bg-green-50 transition"
            onClick={() => openTargetModal('held')}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Monthly Held Target</h3>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600">{totalHeldTarget}</p>
          </div>
          {/* Existing monthly stats cards */}
          <div 
            className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:bg-indigo-50 transition-all duration-200 border-2 border-transparent hover:border-indigo-200"
            onClick={() => openMeetingsModal('booked')}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Meetings Booked</h3>
              <Calendar className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{monthlyStats.totalBooked}</p>

          </div>

          <div 
            className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:bg-green-50 transition-all duration-200 border-2 border-transparent hover:border-green-200"
            onClick={() => openMeetingsModal('held')}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Meetings Held</h3>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600">{monthlyStats.totalHeld}</p>

          </div>

          <div 
            className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:bg-red-50 transition-all duration-200 border-2 border-transparent hover:border-red-200"
            onClick={() => openMeetingsModal('noShows')}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">No Shows</h3>
              <Clock className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-600">{monthlyStats.totalNoShow}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Show Rate</h3>
              <Target className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-indigo-600">
              {monthlyStats.showRate.toFixed(1)}%
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">% to Goal</h3>
              <TrendingUp className="w-5 h-5 text-gray-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {monthlyStats.percentToGoal.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        </div>

        {/* Meetings List */}
        <div className="space-y-4">
          {filteredMeetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onUpdateHeldDate={onUpdateHeldDate}
              onUpdateConfirmedDate={onUpdateConfirmedDate}
              showDateControls={true}
            />
          ))}
          {filteredMeetings.length === 0 && (
            <p className="text-center text-gray-500">
              {searchTerm ? 'No meetings found matching your search' : 'No meetings for this month'}
            </p>
          )}
        </div>
      </div>
      {/* Modal for assigned clients and meetings */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {modalType === 'set' ? 'Monthly Set Target Clients' : 
                 modalType === 'held' ? 'Monthly Held Target Clients' :
                 modalType === 'booked' ? 'Meetings Booked This Month' :
                 modalType === 'noShows' ? 'No-Show Meetings This Month' : 'Modal'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
            </div>
            
            {/* Target modals (existing functionality) */}
            {(modalType === 'set' || modalType === 'held') && (
              <>
                {assignmentsLoading || clientsLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                  </div>
                ) : assignmentsError || clientsError ? (
                  <div className="text-red-600">{assignmentsError || clientsError}</div>
                ) : (
                  <div>
                    {assignments.length === 0 && allClients.length === 0 ? (
                      <p className="text-gray-500">No assignments or clients for this month.</p>
                    ) : (
                      <ul className="divide-y divide-gray-200">
                        {assignments.length > 0 ? (
                          // Show assignments with assignment targets
                          assignments.map(a => {
                            const clientName = (a as any).clients?.name || clients.find(c => c.id === a.client_id)?.name || 'Client';
                            const target = modalType === 'set' ? (a as any).monthly_set_target : (a as any).monthly_hold_target;
                            return (
                              <li key={a.id} className="py-2 flex justify-between items-center">
                                <span className="font-medium text-gray-900">{clientName}</span>
                                <span className="text-gray-600">Target: {target}</span>
                              </li>
                            );
                          })
                        ) : (
                          // Show all clients as fallback
                          allClients.map(client => {
                            const target = modalType === 'set' ? client.monthly_set_target : client.monthly_hold_target;
                            return (
                              <li key={client.id} className="py-2 flex justify-between items-center">
                                <span className="font-medium text-gray-900">{client.name}</span>
                                <span className="text-gray-600">Target: {target}</span>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Meetings modals (new functionality) */}
            {(modalType === 'booked' || modalType === 'held' || modalType === 'noShows') && (
              <div className="space-y-4">
                {/* Summary section */}
                <div className={`p-4 rounded-lg ${
                  modalType === 'booked' ? 'bg-indigo-50' :
                  modalType === 'held' ? 'bg-green-50' :
                  'bg-red-50'
                }`}>
                  <h4 className={`text-lg font-semibold mb-2 ${
                    modalType === 'booked' ? 'text-indigo-900' :
                    modalType === 'held' ? 'text-green-900' :
                    'text-red-900'
                  }`}>
                    {modalType === 'booked' ? 'Meetings Booked This Month' :
                     modalType === 'held' ? 'Meetings Held This Month' :
                     'No-Show Meetings This Month'}
                  </h4>
                  <p className={`text-2xl font-bold ${
                    modalType === 'booked' ? 'text-indigo-700' :
                    modalType === 'held' ? 'text-green-700' :
                    'text-red-700'
                  }`}>
                    {modalType === 'booked' ? monthlyStats.totalBooked :
                     modalType === 'held' ? monthlyStats.totalHeld :
                     monthlyStats.totalNoShow}
                  </p>
                  <p className={`text-sm ${
                    modalType === 'booked' ? 'text-indigo-600' :
                    modalType === 'held' ? 'text-green-600' :
                    'text-red-600'
                  }`}>
                    {modalType === 'booked' ? 'Total meetings scheduled' :
                     modalType === 'held' ? 'Successfully completed meetings' :
                     'Meetings marked as no-shows'}
                  </p>
                </div>

                {/* Meetings list */}
                <div className="space-y-3">
                  {(() => {
                    let filteredMeetings: Meeting[] = [];
                    if (modalType === 'booked') {
                      filteredMeetings = monthMeetings;
                    } else if (modalType === 'held') {
                      filteredMeetings = monthMeetings.filter(m => m.held_at !== null && !m.no_show);
                    } else if (modalType === 'noShows') {
                      filteredMeetings = monthMeetings.filter(m => m.no_show);
                    }
                    
                    return filteredMeetings.length > 0 ? (
                      filteredMeetings.map((meeting) => (
                        <MeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          onUpdateHeldDate={onUpdateHeldDate}
                          onUpdateConfirmedDate={onUpdateConfirmedDate}
                          showDateControls={true}
                        />
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>
                          {modalType === 'booked' ? 'No meetings booked this month' :
                           modalType === 'held' ? 'No meetings held this month' :
                           'No no-show meetings this month'}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}