"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  GraduationCap,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import LoadingScreen from "../Loading/LoadingScreen";
import { fetchAuthSession } from "aws-amplify/auth";
import Session from "../history/Session";

const FeedbackView = ({ role, feedbackData, onFeedbackClick }) => {
  const [isOpen, setIsOpen] = useState(true);

  const getRoleIcon = (role) => {
    switch (role) {
      case "public":
        return <Users className="mr-2" />;
      case "educator":
        return <GraduationCap className="mr-2" />;
      case "admin":
        return <ShieldCheck className="mr-2" />;
      default:
        return null;
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case "public":
        return "Student/General Public";
      case "educator":
        return "Educator/Educational Designer";
      case "admin":
        return "Post-Secondary Institution Admin/Leader";
      default:
        return role;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger asChild className="hover:cursor-pointer">
        <div className="flex items-center justify-between space-x-4 px-4 py-3 bg-gray-50 rounded-t-lg">
          <div className="flex items-center">
            {getRoleIcon(role)}
            <h2 className="text-lg font-semibold capitalize">
              {getRoleLabel(role)} Feedback
            </h2>
            <span className="ml-2 text-gray-500">
              (Avg Rating: {Number(feedbackData.average_rating).toFixed(1)},
              Total: {feedbackData.feedback_count})
            </span>
          </div>
          <Button variant="ghost" size="sm" className="w-9 p-0">
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span className="sr-only">Toggle</span>
          </Button>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        {feedbackData.feedback_details.map((feedback, index) => (
          <Button
            key={feedback.feedback_id + index}
            className="w-full justify-start font-normal hover:bg-gray-100 p-0 h-auto"
            variant="ghost"
            onClick={() => onFeedbackClick(feedback.session_id)}
          >
            <div className="w-full bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
              <div className="flex flex-col space-y-3">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Session ID:</span>
                  <code className="bg-gray-50 px-2 py-1 rounded text-sm">
                    {feedback.session_id}
                  </code>
                  <div
                    className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${
                      feedback.feedback_rating >= 4
                        ? "bg-green-100 text-green-800"
                        : feedback.feedback_rating >= 3
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    Rating: {feedback.feedback_rating}/5
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Feedback:</span>
                  <span className="text-sm">
                    {feedback.feedback_description &&
                    feedback.feedback_description !== "null"
                      ? feedback.feedback_description
                      : "None"}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Submitted:</span>
                  <span className="text-sm">
                    {formatDate(feedback.feedback_time)}
                  </span>
                </div>
              </div>
            </div>
          </Button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

const Feedback = () => {
  const [feedbackData, setFeedbackData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);

  function sortFeedbackByTimestamp(data) {
    return data.map((roleData) => {
      // Create a new object to avoid mutating the original
      const sortedData = { ...roleData };

      // Sort feedback_details in descending order (recent first)
      if (
        sortedData.feedback_details &&
        Array.isArray(sortedData.feedback_details)
      ) {
        sortedData.feedback_details = sortedData.feedback_details.sort(
          (a, b) => {
            return new Date(b.feedback_time) - new Date(a.feedback_time);
          }
        );
      }

      return sortedData;
    });
  }

  useEffect(() => {
    const fetchFeedbackData = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/feedback_by_role`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(data);
        const sortedData = sortFeedbackByTimestamp(data);
        setFeedbackData(sortedData);
      } catch (error) {
        console.error("Error fetching feedback:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeedbackData();
  }, []);

  const handleSessionClick = (sessionId) => {
    // Find the session object with the matching session_id
    for (const roleData of feedbackData) {
      const session = roleData.feedback_details.find(
        (feedback) => feedback.session_id === sessionId
      );

      if (session) {
        setSelectedSession({
          session_id: sessionId,
          role: roleData.user_role,
        });
        break;
      }
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (selectedSession) {
    return (
      <Session
        session={selectedSession}
        onBack={() => setSelectedSession(null)}
        from={"Feedback"}
      />
    );
  }

  return (
    <div className="w-full mx-auto space-y-4 p-4 overflow-y-auto mb-8">
      {feedbackData.map((roleData, index) => (
        <FeedbackView
          key={roleData.user_role + index}
          role={roleData.user_role}
          feedbackData={roleData}
          onFeedbackClick={handleSessionClick}
        />
      ))}
    </div>
  );
};

export default Feedback;
