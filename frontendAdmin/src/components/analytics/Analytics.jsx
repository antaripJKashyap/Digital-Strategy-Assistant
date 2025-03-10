"use client";

import React, { useEffect, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { fetchAuthSession } from "aws-amplify/auth";
import LoadingScreen from "../Loading/LoadingScreen";

export default function AnalyticsDashboard() {
  const [avg_feedback_per_role, setAvgFeedbackPerRole] = useState([]);
  const [unique_users_per_time, setUniqueUsersPerTime] = useState([]);
  const [messages_per_role_per_time, setMessagesPerRolePerTime] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeView, setTimeView] = useState('month');

  const getMaxValue = (data, keys) => {
    return Math.max(
      ...data.flatMap((item) => keys.map((key) => item[key] || 0))
    );
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/analytics?view=${timeView}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setAvgFeedbackPerRole(data.avg_feedback_per_role);
          setUniqueUsersPerTime(data.unique_users_per_time_unit);
          setMessagesPerRolePerTime(data.messages_per_role_per_time_unit);
        } else {
          console.error("Failed to fetch analytics");
        }
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [timeView]); // Re-fetch when timeView changes

  if (loading) {
    return <LoadingScreen />;
  }

  const roleDisplayMap = {
    public: "Public",
    educator: "Educator/Educational Designer",
    admin: "Institutional Admin/Leader",
  };

  const orderedRoles = ["public", "educator", "admin"];
  const displayedFeedback = orderedRoles.map((role) => {
    const feedback = avg_feedback_per_role.find(
      (item) => item.user_role === role
    ) || { avg_feedback_rating: 3 };
    return {
      userType: roleDisplayMap[role],
      score: feedback.avg_feedback_rating,
    };
  });

  // Format x-axis labels based on timeView
  const formatXAxisLabel = (value) => {
    if (timeView === 'day') {
      // For day view, just return the day number
      return value;
    } else {
      // For month view, return month abbreviation
      const parts = value.split(' ');
      return parts[0];
    }
  };

  // Get title based on timeView
  const getUsersTitle = () => {
    if (timeView === 'day') {
      return 'Number of Users by Month';
    } else {
      return 'Number of Users (Past 12 Months)';
    }
  };

  const getEngagementTitle = () => {
    if (timeView === 'day') {
      return 'User Engagement by Month';
    } else {
      return 'User Engagement (Past 12 Months)';
    }
  };

  // Function to calculate max value for Y-axis with padding
  const getYAxisMax = (data, key) => {
    if (!data || data.length === 0) return 10;
    
    const maxVal = Math.max(...data.map(item => Number(item[key] || 0)));
    // Add 20% padding to the maximum value to prevent out-of-bounds issues
    return Math.ceil(maxVal * 1.2);
  };

  const usersYAxisMax = getYAxisMax(unique_users_per_time, "unique_users");
  
  const maxMessageValue = getMaxValue(messages_per_role_per_time, [
    "public",
    "educator",
    "admin",
  ]);
  
  // Add 20% padding to messages chart
  const messagesYAxisMax = Math.ceil(maxMessageValue * 1.2);

  return (
    <main className="ml-12 flex-1 p-6 w-full">
      {/* Toggle for Day/Month View */}
      <div className="flex justify-end mb-4 space-x-2 items-center">
        <span className="text-sm font-medium">View:</span>
        <div className="border rounded-md">
          <button
            onClick={() => setTimeView('day')}
            className={`px-3 py-1 text-sm ${
              timeView === 'day' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-transparent'
            }`}
          >
            Current Month
          </button>
          <button
            onClick={() => setTimeView('month')}
            className={`px-3 py-1 text-sm ${
              timeView === 'month' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-transparent'
            } rounded-r-md`}
          >
            Past 12 Months
          </button>
        </div>
      </div>

      <div className="text-lg mb-4">
        {getUsersTitle()}
      </div>
      <ChartContainer
        config={{
          unique_users: {
            label: "Unique Users",
            color: "hsl(var(--chart-1))",
          },
        }}
        className="h-[350px] w-10/12"
      >
        <LineChart
          data={unique_users_per_time}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <XAxis
            dataKey={timeView === 'day' ? 'day' : 'month'}
            label={{ value: timeView === 'day' ? "Day" : "Month", position: "bottom", offset: 0 }}
            tickFormatter={formatXAxisLabel}
          />
          <YAxis
            label={{
              value: "Unique Users",
              angle: -90,
              position: "insideLeft",
            }}
            domain={[0, usersYAxisMax]}
            allowDataOverflow={false}
          />
          <Line
            type="monotone"
            dataKey="unique_users"
            stroke="var(--color-unique_users)"
            strokeWidth={2}
            dot={true}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </LineChart>
      </ChartContainer>

      <div className="text-lg mb-4">
        {getEngagementTitle()}
      </div>
      <ChartContainer
        config={{
          public: {
            label: "Public Users",
            color: "hsl(var(--chart-1))",
          },
          educator: {
            label: "Educators",
            color: "hsl(var(--chart-2))",
          },
          admin: {
            label: "Admins",
            color: "hsl(var(--chart-3))",
          },
        }}
        className="h-[350px] w-10/12"
      >
        <LineChart
          data={messages_per_role_per_time}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <XAxis
            dataKey={timeView === 'day' ? 'day' : 'month'}
            label={{ value: timeView === 'day' ? "Day" : "Month", position: "bottom", offset: 0 }}
            tickFormatter={formatXAxisLabel}
          />
          <YAxis
            label={{
              value: "Message Count",
              angle: -90,
              position: "insideLeft",
            }}
            domain={[0, messagesYAxisMax]}
            allowDataOverflow={false}
          />
          <Line
            type="monotone"
            dataKey="public"
            stroke="var(--color-public)"
            strokeWidth={2}
            dot={true}
          />
          <Line
            type="monotone"
            dataKey="educator"
            stroke="var(--color-educator)"
            strokeWidth={2}
            dot={true}
          />
          <Line
            type="monotone"
            dataKey="admin"
            stroke="var(--color-admin)"
            strokeWidth={2}
            dot={true}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </LineChart>
      </ChartContainer>

      <div className=" mb-12 mt-12 space-y-6 mr-12 ">
        <div>
          <div className=" mx-4 flex justify-between">
            <div className=" text-lg font-medium text-black">User Feedback</div>
            <div className="mr-4 text-lg font-medium text-black">Score</div>
          </div>
          <hr className="mr-4 mt-2 border-t border-gray-500" />
        </div>
        <div className="space-y-4 mx-12">
          {displayedFeedback.map((feedback) => (
            <div key={feedback.userType} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{feedback.userType}</span>
                <span className="text-sm text-muted-foreground">
                  {Number(feedback.score).toFixed(1)}
                </span>
              </div>
              <Progress
                value={((feedback.score - 1) / 4) * 100}
                className="h-2 bg-adminAccent [&>div]:bg-adminMain"
              />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}