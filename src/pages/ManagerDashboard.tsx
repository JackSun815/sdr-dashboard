import React, { useState, useEffect } from 'react';
import { format, subMonths } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import { useSDRs } from '../hooks/useSDRs';
import { useMeetings } from '../hooks/useMeetings';
import { useAllClients } from '../hooks/useAllClients';
import { useAgency } from '../contexts/AgencyContext';
import { Users, Target, Calendar, AlertCircle, LogOut, ChevronDown, ChevronRight, Link, ListChecks, CheckCircle, XCircle, Clock, History, Shield, Rocket } from 'lucide-react';
import ClientManagement from '../components/ClientManagement';
import UnifiedUserManagement from '../components/UnifiedUserManagement';
import TeamMeetings from './TeamMeetings';
import ManagerMeetingHistory from '../components/ManagerMeetingHistory';
import ICPCheck from './ICPCheck';
import { supabase } from '../lib/supabase';
import { MeetingCard } from '../components/MeetingCard';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';

// Add custom CSS for flow animation
const flowStyles = `
  .flow-animation {
    animation: flowPulse 0.6s ease-in-out;
  }
  
  @keyframes flowPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
  
  .flow-particle {
    animation: flowFloat 2s ease-out forwards;
  }
  
  @keyframes flowFloat {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(var(--flow-x, 100px), var(--flow-y, -100px)) scale(0);
      opacity: 0;
    }
  }
`;

// Inject styles into document head
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = flowStyles;
  document.head.appendChild(styleElement);
}
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

export default function ManagerDashboard() {
  const { profile } = useAuth();

  // Export chart as PNG
  const exportChartAsPNG = async () => {
    const chartContainer = document.getElementById('client-progress-chart');
    if (!chartContainer) return;

    try {
      // Find the scrollable chart area within the container
      const scrollableArea = chartContainer.querySelector('.overflow-x-auto') as HTMLElement;
      if (!scrollableArea) {
        alert('Chart area not found. Please try again.');
        return;
      }

      // Store original styles
      const originalOverflow = scrollableArea.style.overflow;
      const originalWidth = scrollableArea.style.width;
      const originalHeight = scrollableArea.style.height;

      // Temporarily remove scroll and expand to full content
      scrollableArea.style.overflow = 'visible';
      scrollableArea.style.width = 'auto';
      scrollableArea.style.height = 'auto';

      // Get the full dimensions of the scrollable content
      const scrollableWidth = scrollableArea.scrollWidth;

      // Wait a moment for the layout to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Calculate the total width needed (Y-axis width + scrollable width)
      const yAxisWidth = 64; // w-16 = 64px
      const totalWidth = yAxisWidth + scrollableWidth;
      
      // Calculate the full height needed:
      // - Chart height (256px for h-64)
      // - Client names below bars (approximately 40px for text + padding)
      // - X-axis label (approximately 60px for text + margin)
      // - Extra padding for safety
      const chartHeight = 256; // h-64 = 256px
      const clientNamesHeight = 40; // Space for client names below bars
      const xAxisLabelHeight = 60; // Space for X-axis label
      const extraPadding = 40; // Extra padding for safety
      const totalHeight = chartHeight + clientNamesHeight + xAxisLabelHeight + extraPadding;

      const canvas = await html2canvas(chartContainer, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        width: totalWidth,
        height: totalHeight,
        // Ensure we capture the entire container including Y-axis and X-axis labels
        x: 0,
        y: 0
      });

      // Restore original styles
      scrollableArea.style.overflow = originalOverflow;
      scrollableArea.style.width = originalWidth;
      scrollableArea.style.height = originalHeight;

      // Create download link
      const link = document.createElement('a');
      link.download = `client-progress-${progressGoalType}-${selectedMonth}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error exporting chart:', error);
      alert('Failed to export chart. Please try again.');
    }
  };
  const { agency } = useAgency();
  const { sdrs, loading: sdrsLoading, error: sdrsError, fetchSDRs } = useSDRs();
  const { clients, loading: clientsLoading, error: clientsError } = useAllClients();
  // Ensures useMeetings fetches all meetings (SDR ID: null)
  console.log('[DEBUG] useMeetings called with SDR ID:', null);
  const { meetings, loading: meetingsLoading, updateMeetingHeldDate, updateMeetingConfirmedDate } = useMeetings(null, undefined, true);
  const [selectedSDR] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'users' | 'meetings' | 'history' | 'icp'>('overview');
  const [expandedSDRs, setExpandedSDRs] = useState<Record<string, boolean>>({});
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'set' | 'held' | 'pending' | 'sdrs' | 'setTarget' | 'heldTarget' | 'sdrClientMeetings' | null>(null);
  const [modalMeetings, setModalMeetings] = useState<any[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<any>(null);
  
  // Export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [sdrPerformanceExportModalOpen, setSdrPerformanceExportModalOpen] = useState(false);
  const [clientPerformanceExportModalOpen, setClientPerformanceExportModalOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    dateRange: 'all', // 'all', 'currentMonth', 'custom'
    startDate: '',
    endDate: '',
    status: 'all', // 'all', 'confirmed', 'pending', 'noShow'
    clientIds: [] as string[],
    sdrIds: [] as string[],
    includeFields: {
      clientInfo: true,
      sdrInfo: true,
      meetingDetails: true,
      targets: true,
      timestamps: true
    }
  });

  // Month selector state for clients performance
  const nowForMonth = new Date();
  const currentMonthForSelector = format(nowForMonth, 'yyyy-MM');
  
  // Initialize selectedMonth from localStorage or default to current month
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = localStorage.getItem('managerDashboardSelectedMonth');
    return saved || currentMonthForSelector;
  });

  // Generate month options: next month + current month + 5 previous months
  const nextMonth = new Date(nowForMonth.getFullYear(), nowForMonth.getMonth() + 1, 1);
  const monthOptions = [
    {
      value: format(nextMonth, 'yyyy-MM'),
      label: format(nextMonth, 'MMMM yyyy')
    },
    {
      value: format(nowForMonth, 'yyyy-MM'),
      label: format(nowForMonth, 'MMMM yyyy')
    },
    ...Array.from({ length: 5 }, (_, i) => {
      const date = subMonths(nowForMonth, i + 1);
      return {
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy')
      };
    })
  ];

  // Save selectedMonth to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('managerDashboardSelectedMonth', selectedMonth);
  }, [selectedMonth]);

  // State for assignments data
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  // State for client progress visualization
  const [progressGoalType, setProgressGoalType] = useState<'set' | 'held' | 'setProgress' | 'heldProgress'>('set');

  // Fetch assignments for the selected month
  useEffect(() => {
    async function fetchAssignments() {
      try {
        if (!agency?.id) {
          setAssignments([]);
          setAssignmentsLoading(false);
          return;
        }

        setAssignmentsLoading(true);
        const { data: assignmentsData, error: assignmentsError } = await supabase
          .from('assignments')
          .select('*')
          .eq('agency_id', agency.id)
          .eq('month', selectedMonth as any);

        if (assignmentsError) throw assignmentsError;
        setAssignments(assignmentsData || []);
      } catch (err) {
        console.error('Failed to fetch assignments:', err);
        setAssignments([]);
      } finally {
        setAssignmentsLoading(false);
      }
    }

    fetchAssignments();
  }, [selectedMonth, agency?.id]);

  // Debug: Log raw meetings and loading state
  useEffect(() => {
    console.log('[DEBUG] meetingsLoading:', meetingsLoading);
    console.log('[DEBUG] meetings count:', meetings.length);
    meetings.forEach(m => {
      console.log(`[DEBUG] meeting id=${m.id} scheduled_date=${m.scheduled_date} no_show=${m.no_show}`);
    });
  }, [meetings, meetingsLoading]);

  // Add SDR names to meetings
  const meetingsWithSDRNames = meetings.map(meeting => {
    const sdr = sdrs.find(sdr => sdr.id === meeting.sdr_id);
    return {
      ...meeting,
      sdr_name: sdr?.full_name || 'Unknown SDR'
    };
  });

  const todayMeetings = meetingsWithSDRNames.filter(
    (meeting) =>
      new Date(meeting.created_at).toDateString() === new Date().toDateString()
  );

  const confirmedToday = meetingsWithSDRNames.filter(
    (meeting) =>
      meeting.status === 'confirmed' &&
      meeting.confirmed_at &&
      new Date(meeting.confirmed_at).toDateString() === new Date().toDateString()
  );

  async function exportMeetings() {
    try {
      // Apply filters to meetings
      let filteredMeetings = [...meetings];
      
      // Filter by date range
      if (exportFilters.dateRange === 'currentMonth') {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        filteredMeetings = filteredMeetings.filter(meeting => {
          const createdDate = new Date(meeting.created_at);
          return createdDate >= monthStart && createdDate <= monthEnd;
        });
      } else if (exportFilters.dateRange === 'custom' && exportFilters.startDate && exportFilters.endDate) {
        filteredMeetings = filteredMeetings.filter(meeting => {
          const createdDate = new Date(meeting.created_at);
          const startDate = new Date(exportFilters.startDate);
          const endDate = new Date(exportFilters.endDate);
          return createdDate >= startDate && createdDate <= endDate;
        });
      }
      
      // Filter by status
      if (exportFilters.status !== 'all') {
        filteredMeetings = filteredMeetings.filter(meeting => {
          if (exportFilters.status === 'noShow') return meeting.no_show;
          return meeting.status === exportFilters.status;
        });
      }
      
      // Filter by client
      if (exportFilters.clientIds.length > 0) {
        filteredMeetings = filteredMeetings.filter(meeting => 
          exportFilters.clientIds.includes(meeting.client_id)
        );
      }
      
      // Filter by SDR
      if (exportFilters.sdrIds.length > 0) {
        filteredMeetings = filteredMeetings.filter(meeting => 
          exportFilters.sdrIds.includes(meeting.sdr_id)
        );
      }
      
      // Prepare export data
      const exportData = filteredMeetings.map(meeting => {
        const sdr = sdrs.find(s => s.id === meeting.sdr_id);
        const client = clients.find(c => c.id === meeting.client_id);
        
        const row: any = {};
        
        if (exportFilters.includeFields.meetingDetails) {
          row['Status'] = meeting.status;
          row['Scheduled Date'] = meeting.scheduled_date ? new Date(meeting.scheduled_date).toLocaleDateString() : '';
          row['No Show'] = meeting.no_show ? 'Yes' : 'No';
          row['Notes'] = meeting.notes || '';
        }
        
        if (exportFilters.includeFields.clientInfo) {
          row['Client Name'] = client?.name || 'Unknown Client';
        }
        
        if (exportFilters.includeFields.sdrInfo) {
          row['SDR Name'] = sdr?.full_name || 'Unknown SDR';
        }
        
        if (exportFilters.includeFields.targets) {
          // Find SDR's target for this client
          const sdrClient = sdr?.clients.find(c => c.id === meeting.client_id);
          row['Monthly Set Target'] = sdrClient?.monthly_set_target || 0;
          row['Monthly Hold Target'] = sdrClient?.monthly_hold_target || 0;
        }
        
        if (exportFilters.includeFields.timestamps) {
          row['Created'] = new Date(meeting.created_at).toLocaleDateString();
          row['Confirmed'] = meeting.confirmed_at ? new Date(meeting.confirmed_at).toLocaleDateString() : '';
          row['Held'] = meeting.held_at ? new Date(meeting.held_at).toLocaleDateString() : '';
        }
        
        return row;
      });
      
      // Convert to CSV and download
      if (exportData.length === 0) {
        alert('No meetings match the selected filters.');
        return;
      }
      
      const headers = Object.keys(exportData[0]);
      
      // Helper function to properly escape CSV values
      const escapeCSVValue = (value: any): string => {
        if (value === null || value === undefined) {
          return '';
        }
        
        const stringValue = String(value);
        
        // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        
        return stringValue;
      };

      const csvContent = [
        headers.map(escapeCSVValue).join(','),
        ...exportData.map(row => 
          headers.map(header => escapeCSVValue(row[header])).join(',')
        )
      ].join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `meetings_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setExportModalOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  }

  // Export SDR Performance function
  async function exportSDRPerformance() {
    try {
      // Calculate SDR performance metrics
      const sdrPerformanceData = sdrs.map(sdr => {
        const sdrMeetings = meetings.filter(meeting => meeting.sdr_id === sdr.id);
        const monthlyMeetings = sdrMeetings.filter(meeting => {
          const meetingDate = new Date(meeting.scheduled_date);
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          return meetingDate >= monthStart && meetingDate <= monthEnd;
        });

        const totalMeetings = monthlyMeetings.length;
        const heldMeetings = monthlyMeetings.filter(m => m.held_at && !m.no_show).length;
        const noShowMeetings = monthlyMeetings.filter(m => m.no_show).length;
        const pendingMeetings = monthlyMeetings.filter(m => m.status === 'pending' && !m.no_show).length;
        const confirmedMeetings = monthlyMeetings.filter(m => m.status === 'confirmed' && !m.held_at && !m.no_show).length;

        // Calculate targets (you may need to adjust this based on your data structure)
        const totalSetTarget = sdr.clients?.reduce((sum, client) => sum + (client.monthly_set_target || 0), 0) || 0;
        const totalHeldTarget = sdr.clients?.reduce((sum, client) => sum + (client.monthly_hold_target || 0), 0) || 0;

        const setTargetProgress = totalSetTarget > 0 ? (totalMeetings / totalSetTarget) * 100 : 0;
        const heldTargetProgress = totalHeldTarget > 0 ? (heldMeetings / totalHeldTarget) * 100 : 0;

        return {
          'SDR Name': sdr.full_name,
          'Total Meetings Set': totalMeetings,
          'Meetings Held': heldMeetings,
          'No Shows': noShowMeetings,
          'Pending Meetings': pendingMeetings,
          'Confirmed Meetings': confirmedMeetings,
          'Monthly Set Target': totalSetTarget,
          'Monthly Held Target': totalHeldTarget,
          'Set Target Progress (%)': setTargetProgress.toFixed(1),
          'Held Target Progress (%)': heldTargetProgress.toFixed(1),
          'Hold Rate (%)': totalMeetings > 0 ? ((heldMeetings / totalMeetings) * 100).toFixed(1) : '0.0',
          'No Show Rate (%)': totalMeetings > 0 ? ((noShowMeetings / totalMeetings) * 100).toFixed(1) : '0.0'
        };
      });

      // Helper function to properly escape CSV values
      const escapeCSVValue = (value: any): string => {
        if (value === null || value === undefined) {
          return '';
        }
        
        const stringValue = String(value);
        
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        
        return stringValue;
      };

      const headers = Object.keys(sdrPerformanceData[0] || {});
      const csvContent = [
        headers.map(escapeCSVValue).join(','),
        ...sdrPerformanceData.map(row => 
          headers.map(header => escapeCSVValue(row[header])).join(',')
        )
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `sdr_performance_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSdrPerformanceExportModalOpen(false);
    } catch (err) {
      console.error('SDR Performance export failed:', err);
      alert('SDR Performance export failed. Please try again.');
    }
  }

  // Export Client Performance function
  async function exportClientPerformance() {
    try {
      // Calculate client performance metrics
      const clientPerformanceData = clients.map(client => {
        const clientMeetings = meetings.filter(meeting => meeting.client_id === client.id);
        const monthlyMeetings = clientMeetings.filter(meeting => {
          const meetingDate = new Date(meeting.scheduled_date);
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          return meetingDate >= monthStart && meetingDate <= monthEnd;
        });

        const totalMeetings = monthlyMeetings.length;
        const heldMeetings = monthlyMeetings.filter(m => m.held_at && !m.no_show).length;
        const noShowMeetings = monthlyMeetings.filter(m => m.no_show).length;
        const pendingMeetings = monthlyMeetings.filter(m => m.status === 'pending' && !m.no_show).length;
        const confirmedMeetings = monthlyMeetings.filter(m => m.status === 'confirmed' && !m.held_at && !m.no_show).length;

        // Get SDRs assigned to this client
        const assignedSDRs = sdrs.filter(sdr => 
          sdr.clients?.some(c => c.id === client.id)
        ).map(sdr => sdr.full_name).join(', ');

        return {
          'Client Name': client.name,
          'Assigned SDRs': assignedSDRs || 'No SDRs Assigned',
          'Total Meetings Set': totalMeetings,
          'Meetings Held': heldMeetings,
          'No Shows': noShowMeetings,
          'Pending Meetings': pendingMeetings,
          'Confirmed Meetings': confirmedMeetings,
          'Monthly Set Target': client.monthly_set_target || 0,
          'Monthly Held Target': client.monthly_hold_target || 0,
          'Set Target Progress (%)': client.monthly_set_target > 0 ? ((totalMeetings / client.monthly_set_target) * 100).toFixed(1) : '0.0',
          'Held Target Progress (%)': client.monthly_hold_target > 0 ? ((heldMeetings / client.monthly_hold_target) * 100).toFixed(1) : '0.0',
          'Hold Rate (%)': totalMeetings > 0 ? ((heldMeetings / totalMeetings) * 100).toFixed(1) : '0.0',
          'No Show Rate (%)': totalMeetings > 0 ? ((noShowMeetings / totalMeetings) * 100).toFixed(1) : '0.0',
          'Client Created': new Date(client.created_at).toLocaleDateString()
        };
      });

      // Helper function to properly escape CSV values
      const escapeCSVValue = (value: any): string => {
        if (value === null || value === undefined) {
          return '';
        }
        
        const stringValue = String(value);
        
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        
        return stringValue;
      };

      const headers = Object.keys(clientPerformanceData[0] || {});
      const csvContent = [
        headers.map(escapeCSVValue).join(','),
        ...clientPerformanceData.map(row => 
          headers.map(header => escapeCSVValue(row[header])).join(',')
        )
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `client_performance_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setClientPerformanceExportModalOpen(false);
    } catch (err) {
      console.error('Client Performance export failed:', err);
      alert('Client Performance export failed. Please try again.');
    }
  }

  async function handleLogout() {
    localStorage.removeItem('currentUser');
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  function toggleSDRExpansion(sdrId: string) {
    setExpandedSDRs(prev => ({
      ...prev,
      [sdrId]: !prev[sdrId]
    }));
  }

  function toggleClientExpansion(clientId: string) {
    setExpandedClients(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  }

  function generateAccessToken(sdrId: string): string {
    const tokenData = {
      id: sdrId,
      timestamp: Date.now(),
      type: 'sdr_access'
    };
    return btoa(JSON.stringify(tokenData));
  }

  function getSDRDashboardUrl(sdrId: string): string {
    const token = generateAccessToken(sdrId);
    return `${window.location.origin}/dashboard/sdr/${token}`;
  }

  async function handleCopyUrl(sdrId: string) {
    const url = getSDRDashboardUrl(sdrId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(sdrId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }

  const handleCardClick = (type: 'set' | 'held' | 'pending' | 'sdrs' | 'setTarget' | 'heldTarget') => {
    let filteredMeetings: any[] = [];
    let title = '';
    let content = null;

    switch (type) {
      case 'set':
        filteredMeetings = monthlyMeetings;
        title = 'All Meetings Set';
        break;
      case 'held':
        filteredMeetings = monthlyMeetings.filter(m => m.status === 'confirmed' && !m.no_show && m.held_at !== null);
        title = 'Meetings Held';
        break;
      case 'pending':
        filteredMeetings = monthlyMeetings.filter(m => m.status === 'pending' && !m.no_show);
        title = 'Pending Meetings';
        break;
      case 'sdrs':
        title = 'SDR Team Details';
        content = {
          type: 'sdrs',
          data: sdrs
        };
        break;
      case 'setTarget':
        title = 'Monthly Set Targets by SDR';
        content = {
          type: 'setTarget',
          data: sdrs.map(sdr => ({
            name: sdr.full_name,
            totalTarget: sdr.clients.reduce((sum, client) => sum + (client.monthly_set_target || 0), 0),
            clients: sdr.clients.map(client => ({
              name: client.name,
              target: client.monthly_set_target || 0
            }))
          }))
        };
        break;
      case 'heldTarget':
        title = 'Monthly Held Targets by SDR';
        content = {
          type: 'heldTarget',
          data: sdrs.map(sdr => ({
            name: sdr.full_name,
            totalTarget: sdr.clients.reduce((sum, client) => sum + (client.monthly_hold_target || 0), 0),
            clients: sdr.clients.map(client => ({
              name: client.name,
              target: client.monthly_hold_target || 0
            }))
          }))
        };
        break;
    }

    setModalMeetings(filteredMeetings);
    setModalContent(content);
    setModalTitle(title);
    setModalType(type);
    setModalOpen(true);
  };

  const handleSDRClientClick = (sdrId: string, clientId: string, sdrName: string, clientName: string) => {
    // Filter meetings for this specific SDR and client
    const sdrClientMeetings = monthlyMeetings.filter(m => 
      m.sdr_id === sdrId && m.client_id === clientId
    );
    
    const setMeetings = sdrClientMeetings;
    const heldMeetings = sdrClientMeetings.filter(m => 
      m.status === 'confirmed' && !m.no_show && m.held_at !== null
    );

    setModalMeetings(sdrClientMeetings);
    setModalContent({
      type: 'sdrClientMeetings',
      sdrName,
      clientName,
      setMeetings,
      heldMeetings
    });
    setModalTitle(`${sdrName} - ${clientName} Meetings`);
    setModalType('sdrClientMeetings');
    setModalOpen(true);
  };

  const handleSDRClientClickFromSDR = (sdrId: string, clientId: string, sdrName: string, clientName: string) => {
    // Same functionality as handleSDRClientClick but for SDR Performance section
    handleSDRClientClick(sdrId, clientId, sdrName, clientName);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalType(null);
    setModalMeetings([]);
    setModalContent(null);
    setModalTitle('');
  };

  if (sdrsLoading || meetingsLoading || clientsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  console.log('All meetings:', meetings);
  console.log('Held meeting candidates:', meetings.filter(m => 
    m.status === 'confirmed' && 
    m.scheduled_date && 
    new Date(m.scheduled_date) < new Date() && 
    !m.no_show
  ));

  // Calculate month progress
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthProgress = (dayOfMonth / daysInMonth) * 100;

  // Calculate metrics similar to SDR dashboard
  const currentMonthIndex = now.getMonth();
  // Filter meetings by selected month
  const [year, month] = selectedMonth.split('-');
  const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
  const monthEnd = new Date(parseInt(year), parseInt(month), 0);

  const monthlyMeetings = meetings.filter(meeting => {
    const createdDate = new Date(meeting.created_at);
    return createdDate >= monthStart && createdDate <= monthEnd;
  });

  // Calculate total targets from all SDRs (separate set and held targets)
  const totalSetTarget = sdrs.reduce(
    (sum, sdr) => sum + sdr.clients.reduce((acc, client) => acc + (client.monthly_set_target || 0), 0),
    0
  );

  const totalHeldTarget = sdrs.reduce(
    (sum, sdr) => sum + sdr.clients.reduce((acc, client) => acc + (client.monthly_hold_target || 0), 0),
    0
  );

  // Debug logging
  console.log('SDRs data:', sdrs);
  console.log('Total Set Target:', totalSetTarget);
  console.log('Total Held Target:', totalHeldTarget);
  sdrs.forEach(sdr => {
    console.log(`SDR ${sdr.full_name}:`, sdr.clients.map(c => ({
      name: c.name,
      set_target: c.monthly_set_target,
      hold_target: c.monthly_hold_target
    })));
  });

  // Calculate monthly metrics
  const monthlyMeetingsSet = monthlyMeetings.length; // Include all meetings (including no-shows) in set count
  const monthlyHeldMeetings = monthlyMeetings.filter(m => 
    m.status === 'confirmed' && 
    !m.no_show && 
    m.held_at !== null
  ).length;
  const monthlyPendingMeetings = monthlyMeetings.filter(m => m.status === 'pending' && !m.no_show).length;
  const monthlyNoShowMeetings = monthlyMeetings.filter(m => m.no_show).length;

  // Calculate cumulative metrics (all time)
  const totalMeetingsSet = meetings.length;
  const totalHeldMeetings = meetings.filter(m => 
    m.status === 'confirmed' && 
    !m.no_show && 
    m.held_at !== null
  ).length;
  const totalPendingMeetings = meetings.filter(m => m.status === 'pending' && !m.no_show).length;
  const totalNoShowMeetings = meetings.filter(m => m.no_show).length;

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <header className="bg-gradient-to-r from-white via-indigo-50/30 to-white shadow-lg border-b border-indigo-100 relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-100/20 to-transparent"></div>
        <div className="absolute top-0 left-0 w-full h-full opacity-5">
          <div className="absolute top-4 left-8 w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
          <div className="absolute top-8 right-12 w-1 h-1 bg-purple-400 rounded-full animate-pulse delay-300"></div>
          <div className="absolute top-12 left-1/4 w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse delay-700"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-6">
              <div className="relative">
                <h1 
                  className="text-3xl font-bold cursor-pointer group transition-all duration-300 hover:scale-105 relative z-10"
                  onClick={() => {
                    // Easter egg: Flow effect animation
                    const logo = document.querySelector('.pypeflow-logo-manager');
                    if (logo) {
                      // Add flow animation class
                      logo.classList.add('flow-animation');
                      
                      // Create flowing particles effect
                      for (let i = 0; i < 8; i++) {
                        setTimeout(() => {
                          const particle = document.createElement('div');
                          particle.className = 'flow-particle';
                          particle.style.cssText = `
                            position: absolute;
                            width: 4px;
                            height: 4px;
                            background: linear-gradient(45deg, #6366f1, #8b5cf6);
                            border-radius: 50%;
                            pointer-events: none;
                            z-index: 10;
                          `;
                          
                          // Position particles around the logo
                          const rect = logo.getBoundingClientRect();
                          const startX = rect.left + Math.random() * rect.width;
                          const startY = rect.top + Math.random() * rect.height;
                          
                          particle.style.left = startX + 'px';
                          particle.style.top = startY + 'px';
                          
                          document.body.appendChild(particle);
                          
                          // Animate particle flow
                          const animation = particle.animate([
                            { 
                              transform: 'translate(0, 0) scale(1)',
                              opacity: 1
                            },
                            { 
                              transform: `translate(${Math.random() * 200 - 100}px, ${Math.random() * 200 - 100}px) scale(0)`,
                              opacity: 0
                            }
                          ], {
                            duration: 2000,
                            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
                          });
                          
                          animation.onfinish = () => {
                            particle.remove();
                          };
                        }, i * 100);
                      }
                      
                      // Remove animation class after effect
                      setTimeout(() => {
                        logo.classList.remove('flow-animation');
                      }, 3000);
                    }
                  }}
                  title="🌊 Click for a flow effect!"
                >
                  <span className="pypeflow-logo-manager relative">
                    <span className="bg-gradient-to-r from-indigo-600 to-indigo-500 bg-clip-text text-transparent">Pype</span>
                    <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">Flow</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg"></div>
                  </span>
                </h1>
              </div>
              
              <div className="flex flex-col">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-px bg-gradient-to-b from-indigo-300 to-purple-500"></div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-gray-800">Manager Dashboard</p>
                      {agency && (
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          {agency.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 font-medium">{currentMonth}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div 
                  className="flex items-center gap-3 cursor-pointer hover:scale-105 transition-all duration-300 bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-2 rounded-xl border border-indigo-200"
                  onClick={() => {
                    // Easter egg: confetti and rocket animation
                    confetti({
                      particleCount: 100,
                      spread: 70,
                      origin: { y: 0.6 }
                    });
                    
                    // Add a subtle bounce effect to the rocket
                    const rocket = document.querySelector('.rocket-easter-egg-manager');
                    if (rocket) {
                      rocket.classList.add('animate-bounce');
                      setTimeout(() => {
                        rocket.classList.remove('animate-bounce');
                      }, 1000);
                    }
                  }}
                  title="🎉 Click for a surprise!"
                >
                  <span className="text-sm font-semibold text-indigo-700 group-hover:text-indigo-800 transition-colors">{profile?.full_name || 'Manager'}</span>
                  <Rocket className="w-4 h-4 text-indigo-600 group-hover:text-indigo-700 transition-colors rocket-easter-egg-manager" />
                </div>
                
                {/* Dropdown menu */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 transform translate-y-0">
                  <div className="py-2">
                    <button
                      onClick={() => {
                        if (confirm('Export meetings data to CSV?')) {
                          setExportModalOpen(true);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {(sdrsError || clientsError) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <p>{sdrsError || clientsError}</p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-blue-500 hover:border-blue-300'
              } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('meetings')}
              className={`${
                activeTab === 'meetings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-blue-500 hover:border-blue-300'
              } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors`}
            >
              <ListChecks className="w-4 h-4" />
              Team's Meetings
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`${
                activeTab === 'clients'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-blue-500 hover:border-blue-300'
              } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Client Management
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-blue-500 hover:border-blue-300'
              } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors`}
            >
              <Users className="w-4 h-4" />
              User Management
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-blue-500 hover:border-blue-300'
              } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors`}
            >
              <History className="w-4 h-4" />
              Meeting History
            </button>
            <button
              onClick={() => setActiveTab('icp')}
              className={`${
                activeTab === 'icp'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-blue-500 hover:border-blue-300'
              } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors`}
            >
              <Shield className="w-4 h-4" />
              ICP Check
            </button>
          </nav>
        </div>

        {activeTab === 'overview' && (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Total SDRs Card (clickable for modal) */}
              <div 
                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg hover:border-2 hover:border-indigo-200 transition-all duration-200 border-2 border-transparent"
                onClick={() => handleCardClick('sdrs')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Total SDRs</h3>
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{sdrs.length}</p>
                <p className="text-xs text-indigo-600 mt-2 font-medium">Click to view details →</p>
              </div>

              {/* Monthly Set Target Card (clickable for modal) */}
              <div 
                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg hover:border-2 hover:border-indigo-200 transition-all duration-200 border-2 border-transparent"
                onClick={() => handleCardClick('setTarget')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Monthly Set Target</h3>
                  <Target className="w-6 h-6 text-indigo-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{totalSetTarget}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {monthProgress.toFixed(1)}% of month completed
                </p>
                <p className="text-xs text-indigo-600 mt-2 font-medium">Click to view details →</p>
              </div>

              {/* Monthly Held Target Card (clickable for modal) */}
              <div 
                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg hover:border-2 hover:border-indigo-200 transition-all duration-200 border-2 border-transparent"
                onClick={() => handleCardClick('heldTarget')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Monthly Held Target</h3>
                  <Target className="w-6 h-6 text-indigo-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{totalHeldTarget}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {monthProgress.toFixed(1)}% of month completed
                </p>
                <p className="text-xs text-indigo-600 mt-2 font-medium">Click to view details →</p>
              </div>
            </div>

            {/* Meetings Cards - New Line */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Meetings Set Card (clickable for modal) */}
              <div 
                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg hover:border-2 hover:border-green-200 transition-all duration-200 border-2 border-transparent"
                onClick={() => handleCardClick('set')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Meetings Set</h3>
                  <Calendar className="w-6 h-6 text-indigo-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{monthlyMeetingsSet}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {totalSetTarget > 0 ? ((monthlyMeetingsSet / totalSetTarget) * 100).toFixed(1) : '0.0'}% of target
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Cumulative: {totalMeetingsSet}
                </p>
                <p className="text-xs text-green-600 mt-2 font-medium">Click to view meetings →</p>
              </div>

              {/* Meetings Held Card (clickable for modal) */}
              <div 
                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg hover:border-2 hover:border-green-200 transition-all duration-200 border-2 border-transparent"
                onClick={() => handleCardClick('held')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Meetings Held</h3>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{monthlyHeldMeetings}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {totalHeldTarget > 0 ? ((monthlyHeldMeetings / totalHeldTarget) * 100).toFixed(1) : '0.0'}% of target
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Cumulative: {totalHeldMeetings}
                </p>
                <p className="text-xs text-green-600 mt-2 font-medium">Click to view meetings →</p>
              </div>

              {/* Pending Card (clickable for modal) */}
              <div 
                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg hover:border-2 hover:border-yellow-200 transition-all duration-200 border-2 border-transparent"
                onClick={() => handleCardClick('pending')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Pending</h3>
                  <Clock className="w-6 h-6 text-yellow-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{monthlyPendingMeetings}</p>
                <p className="text-sm text-gray-500 mt-2">
                  Pending confirmation
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Cumulative: {totalPendingMeetings}
                </p>
                <p className="text-xs text-yellow-600 mt-2 font-medium">Click to view meetings →</p>
              </div>
            </div>

            {/* Cumulative Performance Section */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Cumulative Performance (All Time)</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{totalMeetingsSet}</p>
                  <p className="text-sm text-gray-600">Total Meetings Set</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{totalHeldMeetings}</p>
                  <p className="text-sm text-gray-600">Total Meetings Held</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">{totalPendingMeetings}</p>
                  <p className="text-sm text-gray-600">Total Pending</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{totalNoShowMeetings}</p>
                  <p className="text-sm text-gray-600">Total No-Shows</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Held Rate (All Time):</span>
                  <span className="text-sm font-medium text-gray-900">
                    {totalMeetingsSet > 0 ? ((totalHeldMeetings / totalMeetingsSet) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-gray-600">No-Show Rate (All Time):</span>
                  <span className="text-sm font-medium text-gray-900">
                    {totalMeetingsSet > 0 ? ((totalNoShowMeetings / totalMeetingsSet) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
              </div>
            </div>

            {/* Data Visualizations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Monthly Performance Chart */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Performance</h3>
                <div className="h-64">
                  <Bar
                    data={{
                      labels: ['Set Meetings', 'Held Meetings'],
                      datasets: [
                        {
                          label: 'Target',
                          data: [totalSetTarget, totalHeldTarget],
                          backgroundColor: ['rgba(59, 130, 246, 0.3)', 'rgba(34, 197, 94, 0.3)'],
                          borderColor: ['rgba(59, 130, 246, 1)', 'rgba(34, 197, 94, 1)'],
                          borderWidth: 2,
                        },
                        {
                          label: 'Actual',
                          data: [monthlyMeetingsSet, monthlyHeldMeetings],
                          backgroundColor: ['rgba(59, 130, 246, 0.8)', 'rgba(34, 197, 94, 0.8)'],
                          borderColor: ['rgba(59, 130, 246, 1)', 'rgba(34, 197, 94, 1)'],
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'top' as const,
                        },
                        title: {
                          display: false,
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Meeting Status Distribution */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Meeting Status Distribution</h3>
                <div className="h-64">
                  <Doughnut
                    data={{
                      labels: ['Held', 'Pending', 'No-Show'],
                      datasets: [
                        {
                          data: [monthlyHeldMeetings, monthlyPendingMeetings, monthlyNoShowMeetings],
                          backgroundColor: [
                            'rgba(34, 197, 94, 0.8)',
                            'rgba(251, 191, 36, 0.8)',
                            'rgba(239, 68, 68, 0.8)',
                          ],
                          borderColor: [
                            'rgba(34, 197, 94, 1)',
                            'rgba(251, 191, 36, 1)',
                            'rgba(239, 68, 68, 1)',
                          ],
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom' as const,
                        },
                        title: {
                          display: false,
                        },
                      },
                    }}
                  />
                </div>
              </div>
            </div>



            {/* SDR Performance Table */}
            {(() => {
              // Filter SDRs to show only those with assignments for the selected month
              const activeSDRsForMonth = sdrs.filter(sdr => {
                // Check if SDR has assignments for the selected month
                const hasAssignments = assignments.some(assignment => 
                  assignment.sdr_id === sdr.id && 
                  !(assignment.sdr_id === null && assignment.monthly_set_target === -1) && // Exclude hidden markers
                  assignment.is_active !== false // Exclude inactive assignments
                );
                
                return hasAssignments;
              });

              return (
            <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-gray-900">SDR Performance</h2>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700">Month:</label>
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        disabled={assignmentsLoading}
                      >
                        {monthOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {selectedMonth === currentMonthForSelector && (
                        <span className="text-xs text-gray-500">(Current)</span>
                      )}
                      {assignmentsLoading && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSdrPerformanceExportModalOpen(true)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SDR Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Set Target
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Held Target
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Meetings Set
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Held
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activeSDRsForMonth.map((sdr) => {
                      // Calculate separate set and held targets for this SDR from assignments for the selected month
                      const sdrAssignments = assignments.filter(assignment => 
                        assignment.sdr_id === sdr.id && 
                        !(assignment.sdr_id === null && assignment.monthly_set_target === -1) && // Exclude hidden markers
                        assignment.is_active !== false // Exclude inactive assignments
                      );
                      
                      const totalSetTarget = sdrAssignments.reduce(
                        (sum, assignment) => sum + (assignment.monthly_set_target || 0),
                        0
                      );
                      const totalHeldTarget = sdrAssignments.reduce(
                        (sum, assignment) => sum + (assignment.monthly_hold_target || 0),
                        0
                      );

                      // Calculate monthly meetings for this SDR
                      const sdrMonthlyMeetings = monthlyMeetings.filter(m => m.sdr_id === sdr.id);
                      // Meetings set: include all meetings (including no-shows) in set count
                      const sdrMeetingsSet = sdrMonthlyMeetings.length;
                      const sdrHeldMeetings = sdrMonthlyMeetings.filter(m => 
                        m.status === 'confirmed' && 
                        !m.no_show && 
                        m.held_at !== null
                      ).length;

                      const setProgress = totalSetTarget > 0 ? (sdrMeetingsSet / totalSetTarget) * 100 : 0;
                      const heldProgress = totalHeldTarget > 0 ? (sdrHeldMeetings / totalHeldTarget) * 100 : 0;
                      const isSetOnTrack = setProgress >= monthProgress;
                      const isHeldOnTrack = heldProgress >= monthProgress;
                      const isExpanded = expandedSDRs[sdr.id];

                      return (
                        <React.Fragment key={sdr.id}>
                          <tr
                            className={`hover:bg-gray-50 cursor-pointer ${
                              selectedSDR === sdr.id ? 'bg-indigo-50' : ''
                            }`}
                            onClick={() => toggleSDRExpansion(sdr.id)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                )}
                                <div className="text-sm font-medium text-gray-900">
                                  {sdr.full_name}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{totalSetTarget}</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{totalHeldTarget}</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {sdrMeetingsSet}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span className="text-sm text-gray-900">
                                  {sdrHeldMeetings}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-4 whitespace-nowrap">
                              <div className="flex flex-col items-start">
                                {/* Meetings Set progress bar */}
                                <div className="flex items-center w-full">
                                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isSetOnTrack ? 'bg-green-600' : 'bg-yellow-600'
                                      }`}
                                      style={{ width: `${setProgress}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`text-sm font-medium ${
                                      isSetOnTrack ? 'text-green-600' : 'text-yellow-600'
                                    }`}
                                  >
                                    {isNaN(setProgress) ? '0.0' : setProgress.toFixed(1)}%
                                  </span>
                                  <div className="ml-2 text-sm text-gray-500">Set</div>
                                </div>
                                {/* Held meetings progress bar */}
                                <div className="flex items-center w-full mt-1">
                                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isHeldOnTrack ? 'bg-green-400' : 'bg-yellow-400'
                                      }`}
                                      style={{ width: `${heldProgress}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`text-sm font-medium ${
                                      isHeldOnTrack ? 'text-green-600' : 'text-yellow-600'
                                    }`}
                                  >
                                    {isNaN(heldProgress) ? '0.0' : heldProgress.toFixed(1)}%
                                  </span>
                                  <div className="ml-2 text-sm text-gray-500">Held</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyUrl(sdr.id);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                              >
                                {copiedId === sdr.id ? (
                                  <>
                                    <Link className="w-4 h-4" />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Link className="w-4 h-4" />
                                    Copy URL
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="px-6 py-4 bg-gray-50">
                                <div className="space-y-3">
                                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                                    Client Assignments
                                  </h4>
                                  {sdr.clients.map((client) => {
                                    // Calculate monthly meetings for this client
                                    const clientMonthlyMeetings = monthlyMeetings.filter(m => 
                                      m.sdr_id === sdr.id && m.client_id === client.id
                                    );
                                    // Meetings set: include all meetings (including no-shows) in set count
                                    const clientMeetingsSet = clientMonthlyMeetings.length;
                                    const clientHeldMeetings = clientMonthlyMeetings.filter(m => 
                                      m.status === 'confirmed' && 
                                      !m.no_show && 
                                      m.held_at !== null
                                    ).length;
                                    
                                    const clientSetProgress = (client.monthly_set_target || 0) > 0 ? 
                                      (clientMeetingsSet / (client.monthly_set_target || 0)) * 100 : 0;
                                    const isClientSetOnTrack = clientSetProgress >= monthProgress;

                                    return (
                                      <div
                                        key={client.id}
                                        className="flex items-center justify-between bg-white p-3 rounded-md shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => handleSDRClientClickFromSDR(sdr.id!, client.id!, sdr.full_name || '', client.name || '')}
                                      >
                                        <div>
                                          <p className="text-sm font-medium text-gray-900">
                                            {client.name}
                                          </p>
                                          <div className="flex items-center gap-4 mt-1">
                                            <span className="text-sm text-gray-500">
                                              Set Target: {client.monthly_set_target || 0}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                              Held Target: {client.monthly_hold_target || 0}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                              Set: {clientMeetingsSet}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                              Held: {clientHeldMeetings}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all duration-300 ${
                                                isClientSetOnTrack ? 'bg-green-600' : 'bg-yellow-600'
                                              }`}
                                              style={{ width: `${clientSetProgress}%` }}
                                            />
                                          </div>
                                          <span
                                            className={`text-sm font-medium ${
                                              isClientSetOnTrack ? 'text-green-600' : 'text-yellow-600'
                                            }`}
                                          >
                                            {isNaN(clientSetProgress) ? '0.0' : clientSetProgress.toFixed(1)}%
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {sdr.clients.length === 0 && (
                                    <p className="text-sm text-gray-500">
                                      No clients assigned
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
              );
            })()}

            {/* Clients Performance Table */}
            {(() => {
              // Filter clients to show only those active for the selected month
              // This logic matches the ClientManagement component's filtering
              const activeClientsForMonth = clients.filter(client => {
                // Check if client has assignments in the selected month
                const hasAssignments = assignments.some(assignment => 
                  assignment.client_id === client.id && 
                  !(assignment.sdr_id === null && assignment.monthly_set_target === -1) && // Exclude hidden markers
                  assignment.is_active !== false // Exclude inactive assignments
                );
                
                // Check if client was created in the selected month
                const clientCreatedDate = new Date(client.created_at);
                const selectedMonthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                const nextMonthDate = new Date(parseInt(year), parseInt(month), 1);
                
                const wasCreatedThisMonth = clientCreatedDate >= selectedMonthDate && clientCreatedDate < nextMonthDate;
                
                // Show client if it has assignments OR was created this month
                return hasAssignments || wasCreatedThisMonth;
              });

              return (
            <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-gray-900">Clients Performance</h2>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700">Month:</label>
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        disabled={assignmentsLoading}
                      >
                        {monthOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {selectedMonth === currentMonthForSelector && (
                        <span className="text-xs text-gray-500">(Current)</span>
                      )}
                      {assignmentsLoading && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setClientPerformanceExportModalOpen(true)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Set Target
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Held Target
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Meetings Set
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Held
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activeClientsForMonth.map((client) => {
                      // Calculate total targets from SDR assignments for this client for the selected month
                      const clientAssignments = assignments.filter(assignment => 
                        assignment.client_id === client.id && 
                        !(assignment.sdr_id === null && assignment.monthly_set_target === -1) && // Exclude hidden markers
                        assignment.is_active !== false // Exclude inactive assignments
                      );
                      
                      const assignedSDRs = clientAssignments.map(assignment => {
                        const sdr = sdrs.find(s => s.id === assignment.sdr_id);
                        return sdr ? {
                          ...sdr,
                          monthly_set_target: assignment.monthly_set_target,
                          monthly_hold_target: assignment.monthly_hold_target
                        } : null;
                      }).filter(Boolean);
                      
                      // Calculate meetings set and held from SDR assignments only
                      const clientMeetingsSet = assignedSDRs.reduce((sum, sdr) => {
                        if (!sdr) return sum;
                        const sdrClientMonthlyMeetings = monthlyMeetings.filter(m => 
                          m.sdr_id === sdr.id && m.client_id === client.id
                        );
                        return sum + sdrClientMonthlyMeetings.length;
                      }, 0);
                      
                      const clientHeldMeetings = assignedSDRs.reduce((sum, sdr) => {
                        if (!sdr) return sum;
                        const sdrClientMonthlyMeetings = monthlyMeetings.filter(m => 
                          m.sdr_id === sdr.id && m.client_id === client.id
                        );
                        return sum + sdrClientMonthlyMeetings.filter(m => 
                          m.status === 'confirmed' && 
                          !m.no_show && 
                          m.held_at !== null
                        ).length;
                      }, 0);
                      const totalSetTargetFromAssignments = assignedSDRs.reduce((sum, sdr) => {
                        return sum + (sdr?.monthly_set_target || 0);
                      }, 0);
                      const totalHeldTargetFromAssignments = assignedSDRs.reduce((sum, sdr) => {
                        return sum + (sdr?.monthly_hold_target || 0);
                      }, 0);

                      const setProgress = totalSetTargetFromAssignments > 0 ? 
                        (clientMeetingsSet / totalSetTargetFromAssignments) * 100 : 0;
                      const heldProgress = totalHeldTargetFromAssignments > 0 ? 
                        (clientHeldMeetings / totalHeldTargetFromAssignments) * 100 : 0;
                      const isSetOnTrack = setProgress >= monthProgress;
                      const isHeldOnTrack = heldProgress >= monthProgress;
                      const isExpanded = expandedClients[client.id];

                      return (
                        <React.Fragment key={client.id}>
                          <tr
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleClientExpansion(client.id)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                )}
                                <div className="text-sm font-medium text-gray-900">
                                  {client.name}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{totalSetTargetFromAssignments}</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{totalHeldTargetFromAssignments}</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {clientMeetingsSet}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span className="text-sm text-gray-900">
                                  {clientHeldMeetings}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-4 whitespace-nowrap">
                              <div className="flex flex-col items-start">
                                {/* Meetings Set progress bar */}
                                <div className="flex items-center w-full">
                                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isSetOnTrack ? 'bg-green-600' : 'bg-yellow-600'
                                      }`}
                                      style={{ width: `${setProgress}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`text-sm font-medium ${
                                      isSetOnTrack ? 'text-green-600' : 'text-yellow-600'
                                    }`}
                                  >
                                    {isNaN(setProgress) ? '0.0' : setProgress.toFixed(1)}%
                                  </span>
                                  <div className="ml-2 text-sm text-gray-500">Set</div>
                                </div>
                                {/* Held meetings progress bar */}
                                <div className="flex items-center w-full mt-1">
                                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isHeldOnTrack ? 'bg-green-400' : 'bg-yellow-400'
                                      }`}
                                      style={{ width: `${heldProgress}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`text-sm font-medium ${
                                      isHeldOnTrack ? 'text-green-600' : 'text-yellow-600'
                                    }`}
                                  >
                                    {isNaN(heldProgress) ? '0.0' : heldProgress.toFixed(1)}%
                                  </span>
                                  <div className="ml-2 text-sm text-gray-500">Held</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="px-6 py-4 bg-gray-50">
                                <div className="space-y-3">
                                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                                    SDR Assignments
                                  </h4>
                                  {assignedSDRs.map((sdr) => {
                                    if (!sdr) return null;

                                    // Calculate monthly meetings for this SDR and client
                                    const sdrClientMonthlyMeetings = monthlyMeetings.filter(m => 
                                      m.sdr_id === sdr.id && m.client_id === client.id
                                    );
                                    // Meetings set: include all meetings (including no-shows) in set count
                                    const sdrClientMeetingsSet = sdrClientMonthlyMeetings.length;
                                    const sdrClientHeldMeetings = sdrClientMonthlyMeetings.filter(m => 
                                      m.status === 'confirmed' && 
                                      !m.no_show && 
                                      m.held_at !== null
                                    ).length;
                                    
                                    const sdrClientSetProgress = (sdr.monthly_set_target || 0) > 0 ? 
                                      (sdrClientMeetingsSet / (sdr.monthly_set_target || 0)) * 100 : 0;
                                    const isSdrClientSetOnTrack = sdrClientSetProgress >= monthProgress;

                                    return (
                                      <div
                                        key={sdr.id}
                                        className="flex items-center justify-between bg-white p-3 rounded-md shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => handleSDRClientClick(sdr.id!, client.id!, sdr.full_name || '', client.name || '')}
                                      >
                                        <div>
                                          <p className="text-sm font-medium text-gray-900">
                                            {sdr.full_name}
                                          </p>
                                          <div className="flex items-center gap-4 mt-1">
                                            <span className="text-sm text-gray-500">
                                              Set Target: {sdr.monthly_set_target || 0}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                              Held Target: {sdr.monthly_hold_target || 0}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                              Set: {sdrClientMeetingsSet}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                              Held: {sdrClientHeldMeetings}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all duration-300 ${
                                                isSdrClientSetOnTrack ? 'bg-green-600' : 'bg-yellow-600'
                                              }`}
                                              style={{ width: `${sdrClientSetProgress}%` }}
                                            />
                                          </div>
                                          <span
                                            className={`text-sm font-medium ${
                                              isSdrClientSetOnTrack ? 'text-green-600' : 'text-yellow-600'
                                            }`}
                                          >
                                            {isNaN(sdrClientSetProgress) ? '0.0' : sdrClientSetProgress.toFixed(1)}%
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {assignedSDRs.length === 0 && (
                                    <p className="text-sm text-gray-500">
                                      No SDRs assigned to this client for {monthOptions.find(m => m.value === selectedMonth)?.label}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {activeClientsForMonth.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          No clients with assignments found for {monthOptions.find(m => m.value === selectedMonth)?.label}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
              );
            })()}

            {/* Today's Activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Meetings Booked Today ({todayMeetings.length})
                </h3>
                <div className="space-y-3">
                  {todayMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg ${
                        meeting.status === 'pending' ? 'animate-glow-orange ring-2 ring-orange-400' : ''
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {(meeting as any).clients?.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(meeting.scheduled_date).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          Booked by {meeting.sdr_name}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          meeting.status === 'confirmed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {meeting.status}
                      </span>
                    </div>
                  ))}
                  {todayMeetings.length === 0 && (
                    <p className="text-sm text-gray-500">No meetings booked today</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Meetings Confirmed Today ({confirmedToday.length})
                </h3>
                <div className="space-y-3">
                  {confirmedToday.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {(meeting as any).clients?.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(meeting.scheduled_date).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          Booked by {meeting.sdr_name}
                        </p>
                      </div>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                        confirmed
                      </span>
                    </div>
                  ))}
                  {confirmedToday.length === 0 && (
                    <p className="text-sm text-gray-500">No meetings confirmed today</p>
                  )}
                </div>
              </div>
            </div>

            {/* SDR Performance Chart - Moved to bottom */}
            <div className="bg-white rounded-lg shadow-md p-6 mt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">SDR Performance Comparison</h3>
              <div className="h-80">
                <Bar
                  data={{
                    labels: sdrs.map(sdr => sdr.full_name),
                    datasets: [
                      {
                        label: 'Set Target',
                        data: sdrs.map(sdr => sdr.clients.reduce((sum, client) => sum + (client.monthly_set_target || 0), 0)),
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 2,
                      },
                      {
                        label: 'Set Actual',
                        data: sdrs.map(sdr => {
                          const sdrMonthlyMeetings = monthlyMeetings.filter(m => m.sdr_id === sdr.id);
                          return sdrMonthlyMeetings.length;
                        }),
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 2,
                      },
                      {
                        label: 'Held Target',
                        data: sdrs.map(sdr => sdr.clients.reduce((sum, client) => sum + (client.monthly_hold_target || 0), 0)),
                        backgroundColor: 'rgba(34, 197, 94, 0.2)',
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2,
                      },
                      {
                        label: 'Held Actual',
                        data: sdrs.map(sdr => {
                          const sdrMonthlyMeetings = monthlyMeetings.filter(m => m.sdr_id === sdr.id);
                          return sdrMonthlyMeetings.filter(m => 
                            m.status === 'confirmed' && !m.no_show && m.held_at !== null
                          ).length;
                        }),
                        backgroundColor: 'rgba(34, 197, 94, 0.8)',
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'top' as const,
                      },
                      title: {
                        display: false,
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                      },
                    },
                  }}
                />
              </div>
            </div>

            {/* Client Progress Visualization */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-6 mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Target className="w-6 h-6 text-blue-600" />
                  Client Progress Visualization
                </h2>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Goal Type:</label>
                    <select
                      value={progressGoalType}
                      onChange={(e) => setProgressGoalType(e.target.value as 'set' | 'held' | 'setProgress' | 'heldProgress')}
                      className="border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="set">Set Goals</option>
                      <option value="held">Held Goals</option>
                      <option value="setProgress">Set Progress %</option>
                      <option value="heldProgress">Held Progress %</option>
                    </select>
                  </div>
                  <div className="text-sm text-gray-500">
                    {monthOptions.find(m => m.value === selectedMonth)?.label}
                  </div>
                  <button
                    onClick={exportChartAsPNG}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export PNG
                  </button>
                </div>
              </div>

              {(() => {
                // Filter clients that have assignments for the selected month
                const activeClientsForProgress = clients.filter(client => {
                  const hasAssignments = assignments.some(assignment => 
                    assignment.client_id === client.id && 
                    !(assignment.sdr_id === null && assignment.monthly_set_target === -1) && // Exclude hidden markers
                    assignment.is_active !== false // Exclude inactive assignments
                  );
                  return hasAssignments;
                });

                console.log('📊 Client Progress Visualization Debug:');
                console.log('Selected month:', selectedMonth);
                console.log('Total clients from useAllClients:', clients.length);
                console.log('Total assignments fetched:', assignments.length);
                console.log('Active clients for progress:', activeClientsForProgress.length);
                console.log('All assignments:', assignments);

                // Calculate progress for each client
                const clientsWithProgress = activeClientsForProgress.map(client => {
                  const clientAssignments = assignments.filter(assignment => 
                    assignment.client_id === client.id && 
                    !(assignment.sdr_id === null && assignment.monthly_set_target === -1) && // Exclude hidden markers
                    assignment.is_active !== false // Exclude inactive assignments
                  );

                  console.log(`Client "${client.name}" assignments:`, clientAssignments);

                  const totalAssignedSet = clientAssignments.reduce((sum, assignment) => sum + (assignment.monthly_set_target || 0), 0);
                  const totalAssignedHeld = clientAssignments.reduce((sum, assignment) => sum + (assignment.monthly_hold_target || 0), 0);

                  // Calculate actual meetings for this client in the selected month
                  // Use the same logic as the client performance table
                  const [year, month] = selectedMonth.split('-');
                  const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
                  const monthEnd = new Date(parseInt(year), parseInt(month), 0);
                  
                  // Filter meetings by created_at date (same as client performance table)
                  const clientMeetings = meetings.filter(meeting => {
                    const createdDate = new Date(meeting.created_at);
                    return createdDate >= monthStart && createdDate <= monthEnd;
                  });

                  // Only count meetings from assigned SDRs for this client (same as client performance table)
                  const assignedSDRs = clientAssignments.map(assignment => {
                    const sdr = sdrs.find(s => s.id === assignment.sdr_id);
                    return sdr ? sdr.id : null;
                  }).filter(Boolean);

                  const actualMeetingsSet = clientMeetings.filter(m => 
                    m.client_id === client.id && 
                    assignedSDRs.includes(m.sdr_id)
                  ).length;

                  const actualMeetingsHeld = clientMeetings.filter(m => 
                    m.client_id === client.id && 
                    assignedSDRs.includes(m.sdr_id) &&
                    m.status === 'confirmed' && 
                    !m.no_show && 
                    m.held_at !== null
                  ).length;

                  const setProgress = client.monthly_set_target > 0 ? (totalAssignedSet / client.monthly_set_target) * 100 : 0;
                  const heldProgress = client.monthly_hold_target > 0 ? (totalAssignedHeld / client.monthly_hold_target) * 100 : 0;
                  
                  // Calculate actual progress percentages (meetings vs goals)
                  const setProgressActual = client.monthly_set_target > 0 ? (actualMeetingsSet / client.monthly_set_target) * 100 : 0;
                  const heldProgressActual = client.monthly_hold_target > 0 ? (actualMeetingsHeld / client.monthly_hold_target) * 100 : 0;

                  return {
                    ...client,
                    setProgress: Math.min(setProgress, 100), // Cap at 100%
                    heldProgress: Math.min(heldProgress, 100), // Cap at 100%
                    setProgressActual: Math.min(setProgressActual, 100), // Cap at 100%
                    heldProgressActual: Math.min(heldProgressActual, 100), // Cap at 100%
                    totalAssignedSet,
                    totalAssignedHeld,
                    actualMeetingsSet,
                    actualMeetingsHeld,
                    unassignedSet: Math.max(0, client.monthly_set_target - totalAssignedSet),
                    unassignedHeld: Math.max(0, client.monthly_hold_target - totalAssignedHeld)
                  };
                });

                // Sort by progress (least to most)
                const sortedClients = clientsWithProgress.sort((a, b) => {
                  let aProgress, bProgress;
                  
                  switch (progressGoalType) {
                    case 'set':
                      aProgress = a.setProgress;
                      bProgress = b.setProgress;
                      break;
                    case 'held':
                      aProgress = a.heldProgress;
                      bProgress = b.heldProgress;
                      break;
                    case 'setProgress':
                      aProgress = a.setProgressActual;
                      bProgress = b.setProgressActual;
                      break;
                    case 'heldProgress':
                      aProgress = a.heldProgressActual;
                      bProgress = b.heldProgressActual;
                      break;
                    default:
                      aProgress = a.setProgress;
                      bProgress = b.setProgress;
                  }
                  
                  return aProgress - bProgress;
                });

                return (
                  <div className="w-full">
                    {sortedClients.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Target className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No active clients found for {monthOptions.find(m => m.value === selectedMonth)?.label}</p>
                      </div>
                    ) : (
                      <div className="w-full">
                        {/* Chart Container */}
                        <div id="client-progress-chart" className="bg-white border border-gray-300 rounded-lg p-6">
                          {/* Y-axis and Chart */}
                          <div className="flex">
                            {/* Y-axis labels */}
                            <div className="w-16 flex flex-col justify-between h-64 text-sm text-gray-600 font-medium">
                              <div className="text-right">100%</div>
                              <div className="text-right">75%</div>
                              <div className="text-right">50%</div>
                              <div className="text-right">25%</div>
                              <div className="text-right">0%</div>
                            </div>
                            
                            {/* Chart area with horizontal scroll */}
                            <div className="flex-1 overflow-x-auto">
                              <div className="relative h-64" style={{ width: `${Math.max(400, sortedClients.length * 80)}px` }}>
                                {/* Grid lines */}
                                <div className="absolute inset-0">
                                  <div className="absolute top-0 left-0 right-0 h-px bg-gray-200"></div>
                                  <div className="absolute left-0 right-0 h-px bg-gray-100" style={{ top: '25%' }}></div>
                                  <div className="absolute left-0 right-0 h-px bg-gray-100" style={{ top: '50%' }}></div>
                                  <div className="absolute left-0 right-0 h-px bg-gray-100" style={{ top: '75%' }}></div>
                                  <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200"></div>
                                </div>
                                
                                {/* Chart content */}
                                <div className="relative h-full">
                                  {/* Client bars and names in a single container */}
                                  <div className="flex items-end h-full">
                                    {sortedClients.map((client) => {
                                      let progress, totalAssigned, totalTarget, unassigned, actualMeetings;
                                      
                                      switch (progressGoalType) {
                                        case 'set':
                                          progress = client.setProgress;
                                          totalAssigned = client.totalAssignedSet;
                                          totalTarget = client.monthly_set_target;
                                          unassigned = client.unassignedSet;
                                          actualMeetings = client.actualMeetingsSet;
                                          break;
                                        case 'held':
                                          progress = client.heldProgress;
                                          totalAssigned = client.totalAssignedHeld;
                                          totalTarget = client.monthly_hold_target;
                                          unassigned = client.unassignedHeld;
                                          actualMeetings = client.actualMeetingsHeld;
                                          break;
                                        case 'setProgress':
                                          progress = client.setProgressActual;
                                          totalAssigned = client.actualMeetingsSet;
                                          totalTarget = client.monthly_set_target;
                                          unassigned = Math.max(0, client.monthly_set_target - client.actualMeetingsSet);
                                          actualMeetings = client.actualMeetingsSet;
                                          break;
                                        case 'heldProgress':
                                          progress = client.heldProgressActual;
                                          totalAssigned = client.actualMeetingsHeld;
                                          totalTarget = client.monthly_hold_target;
                                          unassigned = Math.max(0, client.monthly_hold_target - client.actualMeetingsHeld);
                                          actualMeetings = client.actualMeetingsHeld;
                                          break;
                                        default:
                                          progress = client.setProgress;
                                          totalAssigned = client.totalAssignedSet;
                                          totalTarget = client.monthly_set_target;
                                          unassigned = client.unassignedSet;
                                          actualMeetings = client.actualMeetingsSet;
                                      }

                                      const getBarColor = (progress: number) => {
                                        if (progress >= 100) return 'bg-green-300';
                                        if (progress >= 75) return 'bg-yellow-300';
                                        if (progress >= 50) return 'bg-orange-300';
                                        return 'bg-red-300';
                                      };

                                      const barHeight = Math.min(progress, 100) * 2.56; // 256px / 100% = 2.56px per %
                                      const isOver100 = progress > 100;

                                      return (
                                        <div key={client.id} className="flex flex-col items-center group relative" style={{ width: '80px' }}>
                                          {/* Bar container */}
                                          <div className="relative w-8 h-full flex flex-col justify-end mb-2">
                                            {/* Main bar */}
                                            <div
                                              className={`w-full ${getBarColor(progress)} rounded-t transition-all duration-300 hover:opacity-80 cursor-pointer`}
                                              style={{ 
                                                height: `${barHeight}px`,
                                                minHeight: progress > 0 ? '2px' : '0px'
                                              }}
                                              title={
                                                progressGoalType === 'setProgress' || progressGoalType === 'heldProgress'
                                                  ? `${client.name}: ${progress.toFixed(1)}% (${actualMeetings.toLocaleString()}/${totalTarget.toLocaleString()} meetings)`
                                                  : `${client.name}: ${progress.toFixed(1)}% (${totalAssigned.toLocaleString()}/${totalTarget.toLocaleString()})`
                                              }
                                            />
                                            
                                            {/* Over-100 indicator */}
                                            {isOver100 && (
                                              <div className="absolute -top-1 left-0 right-0 h-1 bg-green-400 rounded-full" />
                                            )}
                                          </div>
                                          
                                          {/* Client name and percentage below the bar */}
                                          <div className="w-full text-center">
                                            <div className="text-xs text-gray-700 font-medium truncate" title={client.name}>
                                              {client.name}
                                            </div>
                                            <div className="text-xs font-bold text-gray-900 mt-1">
                                              {progress.toFixed(0)}%
                                            </div>
                                          </div>
                                          
                                          {/* Hover tooltip - Fixed position */}
                                          <div className="fixed top-4 right-4 px-4 py-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-[9999] shadow-2xl border border-gray-600 min-w-max max-w-xs">
                                            <div className="font-semibold text-sm">{client.name}</div>
                                            <div className="mt-1">Progress: {progress.toFixed(1)}%</div>
                                            <div>Assigned: {totalAssigned.toLocaleString()}</div>
                                            <div>Target: {totalTarget.toLocaleString()}</div>
                                            {unassigned > 0 && (
                                              <div className="text-red-300">Unassigned: {unassigned.toLocaleString()}</div>
                                            )}
                                            {isOver100 && (
                                              <div className="text-green-300">Exceeds target!</div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* X-axis label */}
                        <div className="mt-4 text-center text-sm text-gray-600 font-medium">
                          Clients (sorted by progress: least to most)
                        </div>
                        
                        {/* Summary statistics */}
                        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {(() => {
                            const totalTarget = sortedClients.reduce((sum, client) => {
                              return sum + (progressGoalType === 'set' || progressGoalType === 'setProgress' 
                                ? client.monthly_set_target 
                                : client.monthly_hold_target);
                            }, 0);
                            
                            const totalAssigned = sortedClients.reduce((sum, client) => {
                              if (progressGoalType === 'set') return sum + client.totalAssignedSet;
                              if (progressGoalType === 'held') return sum + client.totalAssignedHeld;
                              if (progressGoalType === 'setProgress') return sum + client.actualMeetingsSet;
                              if (progressGoalType === 'heldProgress') return sum + client.actualMeetingsHeld;
                              return sum;
                            }, 0);
                            
                            const totalUnassigned = sortedClients.reduce((sum, client) => {
                              if (progressGoalType === 'set') return sum + client.unassignedSet;
                              if (progressGoalType === 'held') return sum + client.unassignedHeld;
                              if (progressGoalType === 'setProgress') return sum + Math.max(0, client.monthly_set_target - client.actualMeetingsSet);
                              if (progressGoalType === 'heldProgress') return sum + Math.max(0, client.monthly_hold_target - client.actualMeetingsHeld);
                              return sum;
                            }, 0);
                            
                            const overallProgress = totalTarget > 0 ? (totalAssigned / totalTarget) * 100 : 0;
                            
                            const getProgressLabel = () => {
                              switch (progressGoalType) {
                                case 'set': return 'Goal Assignment';
                                case 'held': return 'Goal Assignment';
                                case 'setProgress': return 'Meeting Progress';
                                case 'heldProgress': return 'Meeting Progress';
                                default: return 'Goal Assignment';
                              }
                            };
                            
                            const getAssignedLabel = () => {
                              switch (progressGoalType) {
                                case 'set': return 'Assigned';
                                case 'held': return 'Assigned';
                                case 'setProgress': return 'Meetings Set';
                                case 'heldProgress': return 'Meetings Held';
                                default: return 'Assigned';
                              }
                            };
                            
                            const getUnassignedLabel = () => {
                              switch (progressGoalType) {
                                case 'set': return 'Unassigned';
                                case 'held': return 'Unassigned';
                                case 'setProgress': return 'Remaining';
                                case 'heldProgress': return 'Remaining';
                                default: return 'Unassigned';
                              }
                            };
                            
                            return (
                              <>
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                  <div className="text-lg font-bold text-gray-900">{totalTarget.toLocaleString()}</div>
                                  <div className="text-xs text-gray-600">Total Target</div>
                                </div>
                                <div className="bg-blue-50 rounded-lg p-3 text-center">
                                  <div className="text-lg font-bold text-blue-600">{totalAssigned.toLocaleString()}</div>
                                  <div className="text-xs text-blue-600">{getAssignedLabel()}</div>
                                </div>
                                <div className="bg-orange-50 rounded-lg p-3 text-center">
                                  <div className="text-lg font-bold text-orange-600">{totalUnassigned.toLocaleString()}</div>
                                  <div className="text-xs text-orange-600">{getUnassignedLabel()}</div>
                                </div>
                                <div className="bg-green-50 rounded-lg p-3 text-center">
                                  <div className="text-lg font-bold text-green-600">{overallProgress.toFixed(1)}%</div>
                                  <div className="text-xs text-green-600">{getProgressLabel()}</div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {activeTab === 'meetings' && (
          <>
            <TeamMeetings meetings={meetings} fetchSDRs={fetchSDRs} />
          </>
        )}


        {activeTab === 'clients' && (
          <ClientManagement sdrs={sdrs} onUpdate={fetchSDRs} />
        )}

        {activeTab === 'users' && (
          <UnifiedUserManagement 
            sdrs={sdrs} 
            clients={clients as any} 
            onUpdate={fetchSDRs} 
          />
        )}

                {activeTab === 'history' && (
          <ManagerMeetingHistory 
            meetings={meetings} 
            loading={meetingsLoading} 
            error={null} 
            onUpdateHeldDate={updateMeetingHeldDate}
            onUpdateConfirmedDate={updateMeetingConfirmedDate}
          />
        )}

        {activeTab === 'icp' && (
          <ICPCheck />
        )}

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">{modalTitle}</h2>
                <button
                  onClick={closeModal}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ×
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                {modalContent?.type === 'sdrs' ? (
                  <div className="space-y-4">
                    {modalContent.data.map((sdr: any) => (
                      <div key={sdr.id} className="bg-gray-50 p-4 rounded-md shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">{sdr.full_name}</h3>
                        <p className="text-sm text-gray-700">Email: {sdr.email}</p>
                        <div className="mt-3">
                          <h4 className="text-sm font-medium text-gray-900 mb-1">Clients:</h4>
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {sdr.clients.map((client: any) => (
                              <li key={client.id}>{client.name}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : modalContent?.type === 'setTarget' ? (
                  <div className="space-y-4">
                    {modalContent.data.map((sdr: any) => (
                      <div key={sdr.name} className="bg-gray-50 p-4 rounded-md shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">{sdr.name}</h3>
                        <p className="text-sm text-gray-700">Total Set Target: {sdr.totalTarget}</p>
                        <div className="mt-3">
                          <h4 className="text-sm font-medium text-gray-900 mb-1">Clients:</h4>
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {sdr.clients.map((client: any) => (
                              <li key={client.name}>{client.name}: Set Target {client.target}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : modalContent?.type === 'heldTarget' ? (
                  <div className="space-y-4">
                    {modalContent.data.map((sdr: any) => (
                      <div key={sdr.name} className="bg-gray-50 p-4 rounded-md shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">{sdr.name}</h3>
                        <p className="text-sm text-gray-700">Total Held Target: {sdr.totalTarget}</p>
                        <div className="mt-3">
                          <h4 className="text-sm font-medium text-gray-900 mb-1">Clients:</h4>
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {sdr.clients.map((client: any) => (
                              <li key={client.name}>{client.name}: Held Target {client.target}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : modalContent?.type === 'sdrClientMeetings' ? (
                  <div className="space-y-6">
                    <div className="bg-blue-50 p-4 rounded-md">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {modalContent.sdrName} - {modalContent.clientName}
                      </h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Meetings Set:</span> {modalContent.setMeetings.length}
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Meetings Held:</span> {modalContent.heldMeetings.length}
                        </div>
                      </div>
                    </div>
                    
                    {/* Meetings Held Section */}
                    {modalContent.heldMeetings.length > 0 && (
                      <div>
                        <h4 className="text-md font-medium text-green-700 mb-3 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Meetings Held ({modalContent.heldMeetings.length})
                        </h4>
                        <div className="space-y-3">
                          {modalContent.heldMeetings.map((meeting: any) => (
                            <div key={meeting.id} className="bg-green-50">
                              <MeetingCard
                                meeting={meeting}
                                showSDR={false}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other Meetings Section */}
                    {modalContent.setMeetings.filter((m: any) => 
                      !(m.status === 'confirmed' && !m.no_show && m.held_at !== null)
                    ).length > 0 && (
                      <div>
                        <h4 className="text-md font-medium text-gray-700 mb-3 flex items-center gap-2">
                          <Clock className="w-5 h-5" />
                          Other Meetings ({modalContent.setMeetings.filter((m: any) => 
                            !(m.status === 'confirmed' && !m.no_show && m.held_at !== null)
                          ).length})
                        </h4>
                        <div className="space-y-3">
                          {modalContent.setMeetings
                            .filter((m: any) => !(m.status === 'confirmed' && !m.no_show && m.held_at !== null))
                            .map((meeting: any) => (
                              <div key={meeting.id} className="bg-gray-50">
                                <MeetingCard
                                  meeting={meeting}
                                  showSDR={false}
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {modalMeetings.length === 0 && (
                      <p className="text-gray-500 text-center py-4">No meetings found for this SDR and client combination.</p>
                    )}
                  </div>
                ) : modalMeetings.length > 0 ? (
                  <div className="space-y-4">
                    {modalMeetings.map((meeting) => (
                      <MeetingCard
                        key={meeting.id}
                        meeting={meeting}
                        showSDR={true}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    No information available for this category.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {exportModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">Export Meetings Data</h2>
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ×
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] space-y-6">
                
                {/* Date Range Filter */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Date Range</h3>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="dateRange"
                        value="all"
                        checked={exportFilters.dateRange === 'all'}
                        onChange={(e) => setExportFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                        className="mr-2"
                      />
                      All time
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="dateRange"
                        value="currentMonth"
                        checked={exportFilters.dateRange === 'currentMonth'}
                        onChange={(e) => setExportFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                        className="mr-2"
                      />
                      Current month only
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="dateRange"
                        value="custom"
                        checked={exportFilters.dateRange === 'custom'}
                        onChange={(e) => setExportFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                        className="mr-2"
                      />
                      Custom range
                    </label>
                    {exportFilters.dateRange === 'custom' && (
                      <div className="ml-6 space-y-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Start Date</label>
                          <input
                            type="date"
                            value={exportFilters.startDate}
                            onChange={(e) => setExportFilters(prev => ({ ...prev, startDate: e.target.value }))}
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">End Date</label>
                          <input
                            type="date"
                            value={exportFilters.endDate}
                            onChange={(e) => setExportFilters(prev => ({ ...prev, endDate: e.target.value }))}
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Meeting Status</h3>
                  <select
                    value={exportFilters.status}
                    onChange={(e) => setExportFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="all">All statuses</option>
                    <option value="confirmed">Confirmed only</option>
                    <option value="pending">Pending only</option>
                    <option value="noShow">No-show only</option>
                  </select>
                </div>

                {/* Client Filter */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Clients</h3>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md p-2">
                    {clients.map(client => (
                      <label key={client.id} className="flex items-center mb-2">
                        <input
                          type="checkbox"
                          checked={exportFilters.clientIds.includes(client.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExportFilters(prev => ({ 
                                ...prev, 
                                clientIds: [...prev.clientIds, client.id] 
                              }));
                            } else {
                              setExportFilters(prev => ({ 
                                ...prev, 
                                clientIds: prev.clientIds.filter(id => id !== client.id) 
                              }));
                            }
                          }}
                          className="mr-2"
                        />
                        {client.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {exportFilters.clientIds.length === 0 ? 'All clients' : `${exportFilters.clientIds.length} client(s) selected`}
                  </p>
                </div>

                {/* SDR Filter */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">SDRs</h3>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md p-2">
                    {sdrs.map(sdr => (
                      <label key={sdr.id} className="flex items-center mb-2">
                        <input
                          type="checkbox"
                          checked={exportFilters.sdrIds.includes(sdr.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExportFilters(prev => ({ 
                                ...prev, 
                                sdrIds: [...prev.sdrIds, sdr.id] 
                              }));
                            } else {
                              setExportFilters(prev => ({ 
                                ...prev, 
                                sdrIds: prev.sdrIds.filter(id => id !== sdr.id) 
                              }));
                            }
                          }}
                          className="mr-2"
                        />
                        {sdr.full_name}
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {exportFilters.sdrIds.length === 0 ? 'All SDRs' : `${exportFilters.sdrIds.length} SDR(s) selected`}
                  </p>
                </div>

                {/* Fields to Include */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Fields to Include</h3>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportFilters.includeFields.meetingDetails}
                        onChange={(e) => setExportFilters(prev => ({ 
                          ...prev, 
                          includeFields: { ...prev.includeFields, meetingDetails: e.target.checked } 
                        }))}
                        className="mr-2"
                      />
                      Meeting details (ID, status, scheduled date, no-show, notes)
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportFilters.includeFields.clientInfo}
                        onChange={(e) => setExportFilters(prev => ({ 
                          ...prev, 
                          includeFields: { ...prev.includeFields, clientInfo: e.target.checked } 
                        }))}
                        className="mr-2"
                      />
                      Client information (name, ID)
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportFilters.includeFields.sdrInfo}
                        onChange={(e) => setExportFilters(prev => ({ 
                          ...prev, 
                          includeFields: { ...prev.includeFields, sdrInfo: e.target.checked } 
                        }))}
                        className="mr-2"
                      />
                      SDR information (name, ID)
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportFilters.includeFields.targets}
                        onChange={(e) => setExportFilters(prev => ({ 
                          ...prev, 
                          includeFields: { ...prev.includeFields, targets: e.target.checked } 
                        }))}
                        className="mr-2"
                      />
                      Target information (monthly set/hold targets)
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportFilters.includeFields.timestamps}
                        onChange={(e) => setExportFilters(prev => ({ 
                          ...prev, 
                          includeFields: { ...prev.includeFields, timestamps: e.target.checked } 
                        }))}
                        className="mr-2"
                      />
                      Timestamps (created, confirmed, held dates)
                    </label>
                  </div>
                </div>

                {/* Export Button */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => setExportModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={exportMeetings}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                  >
                    Export to CSV
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SDR Performance Export Modal */}
        {sdrPerformanceExportModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Export SDR Performance</h3>
                  <button
                    onClick={() => setSdrPerformanceExportModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>

                <div className="mb-6">
                  <p className="text-sm text-gray-600 mb-4">
                    This will export SDR performance metrics including:
                  </p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Total meetings set vs targets</li>
                    <li>• Meetings held vs targets</li>
                    <li>• Hold rates and no-show rates</li>
                    <li>• Progress percentages</li>
                    <li>• Meeting status breakdowns</li>
                  </ul>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setSdrPerformanceExportModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={exportSDRPerformance}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    Export 
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Client Performance Export Modal */}
        {clientPerformanceExportModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Export Client Performance</h3>
                  <button
                    onClick={() => setClientPerformanceExportModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>

                <div className="mb-6">
                  <p className="text-sm text-gray-600 mb-4">
                    This will export client performance metrics including:
                  </p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Client meeting activity</li>
                    <li>• Assigned SDRs</li>
                    <li>• Target progress</li>
                    <li>• Hold rates and no-show rates</li>
                    <li>• Meeting status breakdowns</li>
                  </ul>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setClientPerformanceExportModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={exportClientPerformance}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}