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
  const [unique_users_per_month, setUniqueUsersPerMonth] = useState([]);
  const [messages_per_role_per_month, setMessagesPerRolePerMonth] = useState([]);
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
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/analytics`,
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
          setUniqueUsersPerMonth(data.unique_users_per_month);
          setMessagesPerRolePerMonth(data.messages_per_role_per_month);
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
  }, []);

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

  // Process Unique Users Data
  const processUniqueUsersData = (data, view) => {
    const groupedData = data.reduce((acc, item) => {
      const [year, month] = item.month.split("-");
      const key = view === 'month' 
        ? `${year}-${month}` 
        : year;
      
      const existingItem = acc.find(d => d.month === key);
      if (existingItem) {
        existingItem.unique_users = (existingItem.unique_users || 0) + parseInt(item.unique_users, 10);
      } else {
        acc.push({
          month: key,
          unique_users: parseInt(item.unique_users, 10)
        });
      }
      return acc;
    }, []);

    return groupedData.map(item => ({
      month: view === 'month' 
        ? formatMonthLabel(item.month) 
        : item.month,
      unique_users: item.unique_users
    })).sort((a, b) => {
      const parseKey = (key) => view === 'month' 
        ? new Date(key) 
        : parseInt(key);
      return parseKey(a.month) > parseKey(b.month) ? 1 : -1;
    });
  };

  // Process Messages per Role Data
  const processMessagesData = (data, view) => {
    const uniqueTimeKeys = [
      ...new Set(data.map((item) => {
        const [year, month] = new Date(item.month).toISOString().split("-");
        return view === 'month' ? `${year}-${month}` : year;
      }))
    ];

    return uniqueTimeKeys.map((timeKey) => {
      const monthData = data.filter((item) => {
        const [year, month] = new Date(item.month).toISOString().split("-");
        const key = view === 'month' ? `${year}-${month}` : year;
        return key === timeKey;
      });

      return {
        month: view === 'month' 
          ? formatMonthLabel(timeKey) 
          : timeKey,
        public: monthData
          .filter((item) => item.user_role === "public")
          .reduce((sum, item) => sum + item.message_count, 0),
        educator: monthData
          .filter((item) => item.user_role === "educator")
          .reduce((sum, item) => sum + item.message_count, 0),
        admin: monthData
          .filter((item) => item.user_role === "admin")
          .reduce((sum, item) => sum + item.message_count, 0),
      };
    }).sort((a, b) => {
      const parseKey = (key) => view === 'month' 
        ? new Date(key) 
        : parseInt(key);
      return parseKey(a.month) > parseKey(b.month) ? 1 : -1;
    });
  };

  // Helper to format month labels
  const formatMonthLabel = (key) => {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const [year, month] = key.split("-");
    return month 
      ? `${monthNames[parseInt(month, 10) - 1]} ${year}` 
      : key;
  };

  // Process data based on current view
  const processedUniqueUsersData = processUniqueUsersData(unique_users_per_month, timeView);
  const processedMessagesData = processMessagesData(messages_per_role_per_month, timeView);

  const maxValue = getMaxValue(processedMessagesData, [
    "public",
    "educator",
    "admin",
  ]);

  return (
    <main className="ml-12 flex-1 p-6 w-full">
      {/* Toggle for Month/Year View */}
      <div className="flex justify-end mb-4 space-x-2 items-center">
        <span className="text-sm font-medium">View:</span>
        <div className="border rounded-md">
          <button
            onClick={() => setTimeView('month')}
            className={`px-3 py-1 text-sm ${
              timeView === 'month' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-transparent'
            } rounded-l-md`}
          >
            Month
          </button>
          <button
            onClick={() => setTimeView('year')}
            className={`px-3 py-1 text-sm ${
              timeView === 'year' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-transparent'
            } rounded-r-md`}
          >
            Year
          </button>
        </div>
      </div>

      <div className="text-lg mb-4">Number of Users by {timeView === 'month' ? 'Month' : 'Year'}</div>
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
          data={processedUniqueUsersData}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <XAxis
            dataKey="month"
            label={{ value: timeView === 'month' ? "Month" : "Year", position: "bottom", offset: 0 }}
          />
          <YAxis
            label={{
              value: "Unique Users",
              angle: -90,
              position: "insideLeft",
            }}
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

      <div className="text-lg mb-4">User Engagement by {timeView === 'month' ? 'Month' : 'Year'}</div>
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
          data={processedMessagesData}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <XAxis
            dataKey="month"
            label={{ value: timeView === 'month' ? "Month" : "Year", position: "bottom", offset: 0 }}
          />
          <YAxis
            label={{
              value: "Message Count",
              angle: -90,
              position: "insideLeft",
            }}
            domain={[0, maxValue]}
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