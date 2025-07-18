import React, { useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { Meeting } from '../types/database';
import '../index.css';
import { Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

// setup locales for date-fns
const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

export interface MeetingEvent {
  id: string;
  title?: string;
  start: Date;
  end: Date;
  created_at: string;
  status: 'pending' | 'confirmed' | 'no_show';
  contact_full_name?: string;
  contact_email?: string;
  contact_phone?: string;
  held_at?: string;
  no_show?: boolean;
  sdr_name?: string;
  scheduled_date?: string;
  client_name?: string;
  sdr_full_name?: string;
  company?: string;
  linkedin_url?: string;
  notes?: string;
}

interface CalendarViewProps {
  meetings: Meeting[];
}

export default function CalendarView({ meetings }: CalendarViewProps) {
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingEvent | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Debug logging
  console.log('CalendarView received meetings:', meetings.length);
  console.log('Sample meeting data:', meetings.slice(0, 3));

  const events: MeetingEvent[] = meetings.map((m) => {
    // Parse the scheduled_date properly, handling timezone conversion
    let start: Date;
    let end: Date;
    
    if (m.scheduled_date) {
      // Parse the ISO string and convert to EST
      const utcDate = new Date(m.scheduled_date);
      
      // Convert to EST (UTC-5) or EDT (UTC-4) based on daylight saving
      const estOffset = utcDate.getTimezoneOffset() + (utcDate.getMonth() >= 3 && utcDate.getMonth() <= 10 ? 240 : 300); // EDT or EST
      start = new Date(utcDate.getTime() + (estOffset * 60 * 1000));
      end = new Date(start.getTime() + 30 * 60 * 1000); // 30 minute duration
    } else {
      // Fallback for meetings without scheduled_date
      start = new Date();
      end = new Date(start.getTime() + 30 * 60 * 1000);
    }
    
    const event = {
      id: m.id,
      title: m.title || `${m.contact_full_name || 'Meeting'} - ${m.clients?.name || 'Client'}`,
      start: start,
      end,
      created_at: m.created_at,
      status: m.status,
      contact_full_name: m.contact_full_name,
      contact_email: m.contact_email,
      contact_phone: m.contact_phone,
      held_at: m.held_at,
      no_show: m.no_show,
      sdr_name: m.sdrs?.full_name,
      client_name: m.clients?.name,
      sdr_full_name: m.sdrs?.full_name,
      scheduled_date: m.scheduled_date,
      company: m.company,
      linkedin_url: m.linkedin_page,
      notes: m.notes
    };

    // Debug logging for date parsing
    console.log(`Meeting ${m.id}:`, {
      original: m.scheduled_date,
      utcDate: new Date(m.scheduled_date),
      parsed: start,
      event: event
    });

    return event;
  });

  console.log('Calendar events created:', events.length);

  // Style events for month/week/day views - no background colors
  const eventStyleGetter = (event: MeetingEvent) => {
    return { style: { backgroundColor: '#82ed94', color: '#111827', borderRadius: '4px', border: '1px solid #E5E7EB' } };
  };

  // Custom event component for month/week/day views (used for month, week, and day)
  const CustomEvent = ({ event }: { event: MeetingEvent }) => {
    let preview = '';
    if (event.contact_full_name && event.client_name) {
      preview = `${event.contact_full_name} - ${event.client_name}`;
    } else if (event.contact_full_name) {
      preview = event.contact_full_name;
    } else if (event.client_name) {
      preview = event.client_name;
    } else {
      preview = event.title;
    }
    return (
      <div className="rbc-event-content">
        {preview}
      </div>
    );
  };

  // Custom event component specifically for agenda view
  const CustomAgendaEvent = ({ event }: { event: MeetingEvent }) => {
    let statusText = '';
    let statusColor = '';
    let backgroundColor = '';
    
    switch (event.status) {
      case 'pending': 
        statusColor = '#F59E0B';
        statusText = 'Pending';
        backgroundColor = '#FEF3C7'; // Light yellow background
        break;
      case 'confirmed': 
        statusColor = '#10B981';
        statusText = 'Confirmed';
        backgroundColor = '#D1FAE5'; // Light green background
        break;
      case 'no_show': 
        statusColor = '#EF4444';
        statusText = 'No Show';
        backgroundColor = '#FEE2E2'; // Light red background
        break;
      default: 
        statusColor = '#6B7280';
        statusText = 'Unknown';
        backgroundColor = '#F3F4F6'; // Light gray background
    }

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
      });
    };

    return (
      <div 
        className="agenda-event-item"
        style={{ 
          backgroundColor: backgroundColor, 
          borderRadius: '8px', 
          padding: '12px',
          margin: '4px 0',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span 
                className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border"
                style={{
                  color: statusColor,
                  borderColor: statusColor,
                  backgroundColor: 'white'
                }}
              >
                {statusText}
              </span>
              {event.held_at && (
                <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border border-green-500 text-green-700 bg-white">
                  Held
                </span>
              )}
            </div>
            
            <h4 className="font-semibold text-gray-900 mb-1">
              {event.client_name || event.contact_full_name || 'Untitled Meeting'}
            </h4>
            
            <div className="text-sm text-gray-600 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Time:</span>
                <span>{formatTime(event.start)} - {formatTime(event.end)}</span>
              </div>
              
              {event.contact_full_name && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Contact:</span>
                  <span>{event.contact_full_name}</span>
                </div>
              )}
              
              {event.contact_email && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Email:</span>
                  <span className="text-blue-600">{event.contact_email}</span>
                </div>
              )}
              
              {event.company && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Company:</span>
                  <span>{event.company}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <div className="text-xs text-gray-500">
              {event.start.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}
            </div>
            {event.notes && (
              <div className="text-xs text-gray-500 max-w-xs truncate" title={event.notes}>
                📝 {event.notes.substring(0, 50)}...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleSelectEvent = (event: MeetingEvent) => {
    setSelectedMeeting(event);
    setShowDetails(false);
    console.log('Selected meeting:', event);
  };

  return (
    <div className="calendar-wrapper" style={{ height: '700px' }}>
      <style>
        {`
          .rbc-agenda-view {
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          
          .rbc-agenda-view table {
            border-collapse: separate;
            border-spacing: 0;
          }
          
          .rbc-agenda-view .rbc-agenda-date-cell {
            background: #F9FAFB;
            font-weight: 600;
            color: #374151;
            padding: 12px 16px;
            border-bottom: 1px solid #E5E7EB;
          }
          
          .rbc-agenda-view .rbc-agenda-time-cell {
            padding: 8px 16px;
            color: #6B7280;
            font-size: 0.875rem;
          }
          
          .rbc-agenda-view .rbc-agenda-event-cell {
            padding: 8px 16px;
            border-bottom: 1px solid #F3F4F6;
          }
          
          .agenda-event-item:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
          }
          
          .rbc-agenda-view .rbc-agenda-content {
            background: white;
          }
          
          .rbc-agenda-view .rbc-agenda-empty {
            padding: 40px;
            text-align: center;
            color: #6B7280;
            font-style: italic;
          }
        `}
      </style>
      
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        defaultView="week"
        views={['month', 'week', 'day', 'agenda']}
        style={{ height: '100%' }}
        eventPropGetter={eventStyleGetter}
        onSelectEvent={handleSelectEvent}
        components={{
          event: CustomEvent,
          agenda: {
            event: CustomAgendaEvent
          }
        }}
        formats={{
          eventTimeRangeFormat: () => '',
          eventTimeRangeStartFormat: () => '',
          eventTimeRangeEndFormat: () => '',
          agendaTimeFormat: 'h:mm a', // keep time in agenda view
        }}
        step={30}
        timeslots={2}
        min={new Date(0, 0, 0, 6, 0, 0)} // Start at 6 AM
        max={new Date(0, 0, 0, 22, 0, 0)} // End at 10 PM
      />
      {selectedMeeting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg max-w-md w-full">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                {selectedMeeting.client_name || selectedMeeting.contact_full_name || selectedMeeting.title}
              </h2>
            </div>
            <div className="text-sm text-gray-700 space-y-2">
              <div>
                <span className="font-medium text-gray-700">Meeting Time: </span>
                <span className="text-gray-900">{selectedMeeting.start.toLocaleString()}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Created Time: </span>
                <span className="text-gray-900">
                  {new Date(selectedMeeting.created_at).toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true,
                  })}
                </span>
              </div>
              {selectedMeeting.contact_full_name && (
                <div>
                  <span className="font-medium text-gray-700">Contact: </span>
                  <span className="text-gray-900">{selectedMeeting.contact_full_name}</span>
                </div>
              )}
              {selectedMeeting.contact_email && (
                <div>
                  <span className="font-medium text-gray-700">Email: </span>
                  <span className="text-gray-900">{selectedMeeting.contact_email}</span>
                </div>
              )}
              {selectedMeeting.contact_phone && (
                <div>
                  <span className="font-medium text-gray-700">Phone: </span>
                  <span className="text-gray-900">{selectedMeeting.contact_phone}</span>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-700">Status: </span>
                <span className="text-gray-900">
                  {selectedMeeting.status.charAt(0).toUpperCase() + selectedMeeting.status.slice(1)}
                </span>
              </div>
              <button
                onClick={() => {
                  console.log(showDetails ? 'Hiding details for' : 'Showing details for', selectedMeeting);
                  setShowDetails(!showDetails);
                }}
                className="mt-2 text-sm text-indigo-600 hover:underline"
              >
                {showDetails ? (
                  <><ChevronUp className="inline-block w-4 h-4 mr-1" /> Hide Details</>
                ) : (
                  <><ChevronDown className="inline-block w-4 h-4 mr-1" /> Show Details</>
                )}
              </button>
              
              {showDetails && (
                
                <div className="mt-2 space-y-2">
                  {selectedMeeting.company && (
                    <div>
                      <span className="font-medium text-gray-700">Company: </span>
                      <span className="text-gray-900">{selectedMeeting.company}</span>
                    </div>
                  )}
                  {selectedMeeting.title && (
                    <div>
                      <span className="font-medium text-gray-700">Title: </span>
                      <span className="text-gray-900">{selectedMeeting.title}</span>
                    </div>
                  )}
                  {selectedMeeting.linkedin_url && (
                    <div>
                      <span className="font-medium text-gray-700">LinkedIn: </span>
                      <span className="text-gray-900">{selectedMeeting.linkedin_url}</span>
                    </div>
                  )}
                  {selectedMeeting.notes && (
                    <div>
                      <span className="font-medium text-gray-700">Notes: </span>
                      <span className="text-gray-900 whitespace-pre-wrap">{selectedMeeting.notes}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedMeeting(null)}
                className="px-4 py-2 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}