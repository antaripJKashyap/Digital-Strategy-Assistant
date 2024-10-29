"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
export default function AnalyticsDashboard() {
  const feedbackScores = [
    { userType: "Student", score: 4.5 },
    { userType: "Educator", score: 4.5 },
    { userType: "Institutional Administrator", score: 4.5 },
  ];

  return (
    <main className="flex-1 p-6">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Administrator Dashboard</h1>

        <div className="grid gap-6">
          {/* Users by Month Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Number of Users by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-[2/1] w-full rounded-lg border p-4"></div>
            </CardContent>
          </Card>

          {/* User Engagement Chart */}
          <Card>
            <CardHeader>
              <CardTitle>User Engagement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-[2/1] w-full rounded-lg border p-4"></div>
            </CardContent>
          </Card>

          {/* User Feedback Section */}
          <Card>
            <CardHeader>
              <CardTitle>User Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {feedbackScores.map((feedback) => (
                  <div key={feedback.userType} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {feedback.userType}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {feedback.score}
                      </span>
                    </div>
                    <Progress
                      value={(feedback.score / 5) * 100}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
