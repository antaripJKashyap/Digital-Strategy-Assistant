import React, { useState, useRef, useEffect } from "react";
import Header from "../Header";
import MainMessage from "./MainMessage";
import OptionMessage from "./OptionMessage";
import UserMessage from "./UserMessage";
import Footer from "../Footer";
import {
  LuSendHorizonal,
  LuListRestart,
  LuMic,
  LuMicOff,
} from "react-icons/lu";
import { getFingerprint } from "@thumbmarkjs/thumbmarkjs";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import TypingIndicator from "./TypingIndicator";
import FeedbackComponent from "./Feedback";
import SyllabusComparisonModal from "./SyllabusComparison";
import { processAndUploadFiles } from "./Utility";
import { getUserRole } from "./Utility";
import { TbLayersDifference } from "react-icons/tb";
const Chat = ({ setPage }) => {
  const [fingerprint, setFingerprint] = useState("");
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState({ rating: "", description: [] });
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [showSyllabusModal, setShowSyllabusModal] = useState(false);
  const [textSyllabus, setTextSyllabus] = useState("");
  const [syllabusFiles, setSyllabusFiles] = useState([]);
  const [selectedCriteria, setSelectedCriteria] = useState([]);

  const INITIAL_MESSAGE = {
    Type: "ai",
    Content:
      "Hello! Please select the best role below that fits you. We can better answer your questions. Don't include personal details such as your name and private content.",
    Options: [
      "Student/general public",
      "Educator/educational designer",
      "Post-secondary institution admin/leader",
    ],
    user_role: "",
  };

  const handleFeedbackSubmit = async () => {
    if (!feedback.rating || isSendingFeedback) return;

    setIsSendingFeedback(true);

    // Check for feedback fields and set them to null if they don't exist
    const feedbackRating = feedback.rating || null;
    const feedbackDescription = feedback.description?.join(", ") || null;

    try {
      await fetch(
        `${
          process.env.NEXT_PUBLIC_API_ENDPOINT
        }/user/create_feedback?user_info=${encodeURIComponent(
          fingerprint
        )}&session_id=${encodeURIComponent(session)}&user_role=${getUserRole(
          messages
        )}&feedback_rating=${encodeURIComponent(
          feedbackRating
        )}&feedback_description=${encodeURIComponent(feedbackDescription)}`,
        { method: "POST" }
      );
      setMessages([
        ...messages,
        {
          Type: "ai",
          Content:
            "Thank you! Your feedback will help improve the Digital Strategy Assistant. You may continue asking questions or start a new session.",
        },
      ]);
      setShowFeedback(false);
    } catch (error) {
      console.error("Error sending feedback:", error);
      toast.error("Failed to send feedback. Please try again.");
    } finally {
      setIsSendingFeedback(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async (
    content,
    isOption = false,
    isComparison = false
  ) => {
    if (!session || !fingerprint || (!content.trim() && !isOption)) return;
    const currentMessages = [...messages];
    const userRole = getUserRole(currentMessages);
    if (!isOption && currentMessages.length === 1) {
      toast.error("Please select one of the options first!");
      return;
    }
    setMessageInput("");
    setIsLoading(true);
    try {
      const userMessage = { Type: "human", Content: content };
      setMessages((prev) => [...prev, userMessage]);

      // Prepare the request body conditionally
      const requestBody = isComparison
        ? {
            comparison: true,
            message_content: content,
            user_role: getUserRole([...currentMessages, userMessage]),
            criteria: selectedCriteria,
          }
        : {
            message_content: content,
            user_role: getUserRole([...currentMessages, userMessage]),
          };

      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_ENDPOINT
        }user/text_generation?session_id=${encodeURIComponent(
          session
        )}&user_info=${encodeURIComponent(fingerprint)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.log("response", error);
        throw new Error(error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          Type: "ai",
          Content: data.content,
          Options: data.options || [],
          user_role: data.user_role,
        },
      ]);
    } catch (error) {
      console.error("Error sending message:", error.message);
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && messageInput.trim()) {
        sendMessage(messageInput);
      }
    }
  };

  const createNewSession = async (currentFingerprint) => {
    if (!currentFingerprint) return;

    setIsCreatingSession(true);
    try {
      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_ENDPOINT
        }user/create_session?user_info=${encodeURIComponent(
          currentFingerprint
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const sessionDataJson = await response.json();
      const sessionData = sessionDataJson[0].session_id;
      setSession(sessionData);
      localStorage.setItem("chatSession", JSON.stringify(sessionData));

      const textGenResponse = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_ENDPOINT
        }user/text_generation?session_id=${encodeURIComponent(sessionData)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!textGenResponse.ok) {
        throw new Error(`HTTP error! status: ${textGenResponse.status}`);
      }
    } catch (error) {
      console.error("Error creating session:", error);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const fetchMessages = async (sessionId) => {
    if (!sessionId) return;

    try {
      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_ENDPOINT
        }user/get_messages?session_id=${encodeURIComponent(sessionId)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        setMessages([INITIAL_MESSAGE]);
        return;
      }

      const data = await response.json();
      let messagesList = data.messages || [];

      const hasInitialMessage =
        messagesList.length > 0 &&
        messagesList[0].Type === "ai" &&
        messagesList[0].Content.includes("Please select the best role below");

      if (!hasInitialMessage) {
        messagesList = [INITIAL_MESSAGE, ...messagesList];
      }

      setMessages(messagesList);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setMessages([INITIAL_MESSAGE]);
    }
  };

  useEffect(() => {
    getFingerprint()
      .then((result) => {
        setFingerprint(result);
      })
      .catch((error) => {
        console.error("Error getting fingerprint:", error);
      });
    const existingSession = localStorage.getItem("chatSession");
    if (existingSession) {
      const parsedSession = JSON.parse(existingSession);
      setSession(parsedSession);
      fetchMessages(parsedSession);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, showFeedback]);

  useEffect(() => {
    if (!fingerprint || session) return;
    createNewSession(fingerprint);
  }, [fingerprint, session]);

  useEffect(() => {
    if (session) {
      fetchMessages(session);
    }
  }, [session]);

  const handleSessionReset = () => {
    setShowFeedback(false);
    setSession(null);
    setMessages([]);
    localStorage.removeItem("chatSession");
    createNewSession(fingerprint);
  };

  const renderMessage = (message, index) => {
    if (message.Type === "human") {
      return <UserMessage key={index} text={message.Content} />;
    } else if (message.Type === "ai") {
      const userRole = getUserRole(messages);

      const isEduOrAdminRole =
        userRole.toLowerCase().includes("educator") ||
        userRole.toLowerCase().includes("admin");

      return (
        <React.Fragment key={index}>
          <MainMessage text={message.Content} />

          {/* Render existing options */}
          {message.Options &&
            message.Options.map((option, optIndex) => (
              <OptionMessage
                key={`${index}-${optIndex}`}
                text={option}
                onClick={() => !isLoading && sendMessage(option, true)}
              />
            ))}

          {/* Add "Compare Materials" option if the role is Educator/Admin */}
          {isEduOrAdminRole && index > 0 && (
            <OptionMessage
              key={`${index}-syllabus`}
              text="I want to compare my course materials with the Digital Strategy Guidelines"
              icon={TbLayersDifference}
              onClick={() => setShowSyllabusModal(true)}
            />
          )}

          {/* Existing "My task is done" option */}
          {index >= 4 &&
            !message.Content.includes(
              "Thank you! Your feedback will help improve the Digital Strategy Assistant."
            ) && (
              <OptionMessage
                key={`${index}-done`}
                text="My task is done"
                onClick={() => setShowFeedback(true)}
              />
            )}
        </React.Fragment>
      );
    }
    return null;
  };
  const constructWebSocketUrl = () => {
    const tempUrl = process.env.NEXT_PUBLIC_GRAPHQL_WS_URL;
    const apiKey = process.env.NEXT_PUBLIC_GRAPHQL_API_KEY;
    const apiUrl = tempUrl.replace("https://", "wss://");
    const urlObj = new URL(apiUrl);
    const tmpObj = new URL(tempUrl);
    const modifiedHost = urlObj.hostname.replace(
      "appsync-api",
      "appsync-realtime-api"
    );

    urlObj.hostname = modifiedHost;
    const host = tmpObj.hostname;
    const header = {
      host: host,
      "x-api-key": apiKey,
    };

    const encodedHeader = btoa(JSON.stringify(header));
    const payload = "e30=";

    return `${urlObj.toString()}?header=${encodedHeader}&payload=${payload}`;
  };

  const handleSyllabusSubmit = async () => {
    let ws = null;
    try {
      // Process and upload files
      await processAndUploadFiles(syllabusFiles, textSyllabus, session);

      const wsUrl = constructWebSocketUrl();
      console.log("wsUrl", wsUrl);
      ws = new WebSocket(wsUrl, 'graphql-ws');
      console.log("Establishing WebSocket connection...");

      // Handle WebSocket connection
      await new Promise((resolve, reject) => {
        ws.onopen = () => {
          console.log("WebSocket connection established");
          const initMessage = { type: "connection_init" };
          ws.send(JSON.stringify(initMessage));
          console.log("Sent:", initMessage);

          const subscriptionMessage = {
            id: session,
            type: "start",
            payload: {
              data: `{"query":"subscription OnNotify($sessionId: String!) { onNotify(sessionId: $sessionId) { message sessionId } }","variables":{"sessionId":"${session}"}}`,
              extensions: {
                authorization: {
                  "x-api-key": process.env.NEXT_PUBLIC_GRAPHQL_API_KEY,
                  host: new URL(process.env.NEXT_PUBLIC_GRAPHQL_WS_URL)
                    .hostname,
                },
              },
            },
          };
          ws.send(JSON.stringify(subscriptionMessage));
          console.log("Sent subscription message:", subscriptionMessage);
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          console.log("Received:", message);

          // Check if this is a complete message
          if (message.type === "data" && message.payload?.data?.onNotify) {
            resolve(message);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(error);
        };

        // Set a timeout for the WebSocket connection
        setTimeout(() => {
          reject(new Error("WebSocket connection timeout"));
        }, 30000); // 30 second timeout
      });

      // Close modal and send confirmation message
      setShowSyllabusModal(false);
      await sendMessage(
        "I've uploaded syllabus files for comparison",
        true,
        true
      );

      // Reset state
      setTextSyllabus("");
      setSyllabusFiles([]);
    } catch (error) {
      console.error("Syllabus upload error:", error);
      toast.error("Failed to upload syllabus: " + error.message);
    } finally {
      // Ensure WebSocket is properly closed
      if (ws) {
        console.log("Closing WebSocket connection");
        ws.close();
      }
    }
  };

  return (
    <div>
      <div className="w-full h-screen flex flex-col">
        <Header setPage={setPage} />
        <div className="flex-grow overflow-y-auto pt-8 flex flex-col">
          <div className="flex-grow px-8 flex flex-col overflow-y-auto">
            {messages.map((message, index) => renderMessage(message, index))}
            {(isLoading || isCreatingSession) && <TypingIndicator />}
            {showFeedback && (
              <FeedbackComponent
                feedback={feedback}
                setFeedback={setFeedback}
                onSubmit={handleFeedbackSubmit}
                isSubmitting={isSendingFeedback}
                onClose={() => setShowFeedback(false)}
              />
            )}
            <div ref={messagesEndRef} className="mb-8" />
          </div>
        </div>
        <div className="flex flex-col">
          <div className="border-t border-b border-black w-full flex items-center justify-between px-8">
            <div className="flex items-center space-x-2">
              <button onClick={handleSessionReset}>
                <LuListRestart size={20} />
              </button>
            </div>
            <div className="flex-grow mx-4 flex items-center">
              <textarea
                ref={textareaRef}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyPress}
                className="px-4 py-2 text-md w-full bg-white text-black resize-none overflow-hidden focus:outline-none flex items-center justify-center"
                placeholder="Type a message..."
                maxLength={2096}
                style={{
                  minHeight: "40px",
                  height: "auto",
                  display: "flex",
                  alignItems: "center",
                }}
                rows={1}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.max(
                    e.target.scrollHeight,
                    48
                  )}px`;
                }}
              />
            </div>
            <button
              onClick={() =>
                !isLoading && messageInput.trim() && sendMessage(messageInput)
              }
              className={`${
                isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              }`}
              disabled={isLoading}
            >
              <LuSendHorizonal size={20} />
            </button>
          </div>
          <Footer />
        </div>
      </div>
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
      <SyllabusComparisonModal
        isOpen={showSyllabusModal}
        onClose={() => setShowSyllabusModal(false)}
        onSubmit={handleSyllabusSubmit}
        textSyllabus={textSyllabus}
        setTextSyllabus={setTextSyllabus}
        files={syllabusFiles}
        setFiles={setSyllabusFiles}
        selectedCriteria={selectedCriteria}
        setSelectedCriteria={setSelectedCriteria}
      />
    </div>
  );
};

export default Chat;
