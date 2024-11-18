"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { fetchAuthSession } from "aws-amplify/auth";
import { ArrowLeft } from "lucide-react";
import LoadingScreen from "../Loading/LoadingScreen";

export default function Session({ session, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const fetchSessionData = async () => {
      try {
        setLoading(true);
        const authSession = await fetchAuthSession();
        const token = authSession.tokens.idToken;

        // Fetch messages
        const messagesResponse = await fetch(
          `${
            process.env.NEXT_PUBLIC_API_ENDPOINT
          }admin/conversation_messages?session_id=${encodeURIComponent(
            session.session_id
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (!messagesResponse.ok) {
          throw new Error(`HTTP error! status: ${messagesResponse.status}`);
        }

        const messagesData = await messagesResponse.json();
        setMessages(messagesData.messages);

        // Fetch feedback
        const feedbackResponse = await fetch(
          `${
            process.env.NEXT_PUBLIC_API_ENDPOINT
          }admin/get_feedback?session_id=${encodeURIComponent(
            session.session_id
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          setFeedback(feedbackData);
        }
      } catch (error) {
        console.error("Error fetching session data:", error);
        setError("Failed to load session data. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchSessionData();
  }, [session.session_id]);

  const parseOptions = (options) => {
    if (!Array.isArray(options) || options.length === 0) return [];
    return options;
  };

  const MessageCard = ({ message }) => {
    const isAI = message.Type.toLowerCase() === "ai";

    return (
      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="space-y-3">
          <p>
            <span className="font-medium text-gray-600">From: </span>
            {message.Type}
          </p>
          <p>
            <span className="font-medium text-gray-600">Content: </span>
            {message.Content}
          </p>
          {isAI && message.Options && (
            <div>
              <span className="font-medium text-gray-600">Options: </span>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                {parseOptions(message.Options).map((option, idx) => (
                  <li
                    key={idx}
                    className="text-gray-700 cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    {option}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="w-full mx-auto p-4 px-12">
      <Button
        onClick={onBack}
        className="mb-4 bg-adminMain hover:bg-adminHover"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to History
      </Button>
      <h2 className="text-2xl font-bold mb-4">Session Details</h2>
      <p className="mb-2">
        <span className="font-medium">Role: </span>
        {session.role}
      </p>
      <p className="mb-2">
        <span className="font-medium">Session ID: </span>
        {session.session_id}
      </p>
      {feedback && (
        <div>
          {feedback.length > 0 ? (
            <p className="mb-2">
              <span className="font-medium">Average Feedback Rating: </span>
              {feedback.reduce(
                (sum, current) => sum + (current.feedback_rating || 0),
                0
              ) / feedback.length}
            </p>
          ) : (
            <p>No feedback available.</p>
          )}
          <p className="mb-2">
            <span className="font-medium">Feedback Descriptions: </span>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              {feedback.map((item, idx) => (
                <li key={idx} className="">
                  {item.feedback_rating && (
                    <span className="mr-2">
                      (Rating: {item.feedback_rating})
                    </span>
                  )}
                  {item.feedback_description === "null" ||
                  item.feedback_description === null
                    ? "None"
                    : item.feedback_description}
                  {item.timestamp && (
                    <span className="text-gray-600 ml-2">
                      (Timestamp: {new Date(item.timestamp).toLocaleString()})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </p>
        </div>
      )}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && !error && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Messages</h3>
          {messages.length === 0 ? (
            <p>No messages in this session.</p>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <MessageCard key={index} message={message} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
