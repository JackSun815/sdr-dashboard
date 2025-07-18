import React from 'react';
import { Calendar, Target, Plus, CheckCircle, Edit, User, Mail, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { formatTimeFromISOString } from '../utils/timeUtils';
import { MeetingCard } from './MeetingCard';

interface ClientCardProps {
  name: string;
  monthly_set_target: number;
  monthly_hold_target: number;
  confirmedMeetings: number;
  pendingMeetings: number;
  heldMeetings: number;
  todaysMeetings: Array<{
    id: string;
    scheduled_date: string;
    status: 'pending' | 'confirmed';
    contact_full_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
  }>;
  onAddMeeting: () => void;
  onConfirmMeeting: (meetingId: string) => void;
  onEditMeeting?: (meeting: any) => void;
  goalTiers?: Array<{
    percentage: number;
    bonus: number;
  }>;
}

export default function ClientCard({
  name,
  monthly_set_target,
  monthly_hold_target,
  confirmedMeetings,
  pendingMeetings,
  heldMeetings,
  todaysMeetings,
  onAddMeeting,
  onConfirmMeeting,
  onEditMeeting,
  goalTiers = []
}: ClientCardProps) {
  // Calculate progress percentages
  const setProgress = monthly_set_target > 0 ? ((confirmedMeetings + pendingMeetings) / monthly_set_target) * 100 : 0;
  const heldProgress = monthly_hold_target > 0 ? (heldMeetings / monthly_hold_target) * 100 : 0;
  
  // Calculate month progress
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthProgress = (dayOfMonth / daysInMonth) * 100;

  // Determine status color based on held progress
  const getStatusColor = () => {
    if (heldProgress >= monthProgress) return 'text-green-600';
    if (heldProgress >= monthProgress - 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Calculate meetings needed for each tier (using held target)
  const getTierProgress = (percentage: number) => {
    const targetMeetings = Math.ceil((percentage / 100) * monthly_hold_target);
    const meetingsNeeded = Math.max(0, targetMeetings - heldMeetings);
    const tierProgress = (heldMeetings / targetMeetings) * 100;
    return { targetMeetings, meetingsNeeded, tierProgress };
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
        <button
          onClick={() => {
            console.log("Add Meeting button clicked");
            onAddMeeting();
          }}
          className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <Plus className="w-4 h-4" />
          Add Meeting
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-gray-400" />
          <span className="text-sm text-gray-600">
            Set: {confirmedMeetings + pendingMeetings}/{monthly_set_target} | Held: {heldMeetings}/{monthly_hold_target}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-400" />
          <span className="text-sm text-gray-600">
            Pending: {pendingMeetings} meetings
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Held Progress</span>
            <span className={`font-semibold ${getStatusColor()}`}>
              {heldProgress.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${heldProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>0%</span>
            <span>Month Progress: {monthProgress.toFixed(1)}%</span>
            <span>100%</span>
          </div>
        </div>

        {goalTiers.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-900">Goal Tiers Progress</h4>
            {goalTiers
              .sort((a, b) => b.percentage - a.percentage)
              .map((tier, index) => {
                const { targetMeetings, meetingsNeeded, tierProgress } = getTierProgress(tier.percentage);
                const isAchieved = heldMeetings >= targetMeetings;

                return (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={`font-medium ${isAchieved ? 'text-green-600' : 'text-gray-600'}`}>
                        {tier.percentage}% ({targetMeetings} meetings)
                      </span>
                      <span className={`${isAchieved ? 'text-green-600' : 'text-gray-600'}`}>
                        {isAchieved ? 'Achieved!' : `${meetingsNeeded} more needed`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isAchieved ? 'bg-green-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.min(100, tierProgress)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {todaysMeetings.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Today's Meetings</h4>
            <div className="space-y-3">
              {todaysMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onEdit={onEditMeeting}
                  onUpdateConfirmedDate={onConfirmMeeting ? (id: string, date: string | null) => onConfirmMeeting(id) : undefined}
                  showDateControls={true}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}