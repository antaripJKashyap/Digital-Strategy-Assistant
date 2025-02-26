"use client";
import React, { useEffect, useState } from "react";
import Login from "./auth/Login.jsx";
import { fetchAuthSession } from "aws-amplify/auth";
import Analytics from "./analytics/Analytics.jsx";
import Categories from "./categories/Categories.jsx";
import Prompt from "./prompt/Prompt.jsx";
import Files from "./files/Files.jsx";
import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";
import PostAuthHeader from "./PostAuthHeader.jsx";
import History from "./history/History.jsx";
import AllMessages from "./allMessages/AllMessages.jsx";
import Category_creation from "./categories/Category_creation.jsx";
import Edit_Category from "./categories/Edit_Category.jsx";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import LoadingScreen from "./Loading/LoadingScreen.jsx";
import Feedback from "./feedback/Feedback.jsx";
import Guidelines from "./guidelines/Guidelines.jsx";
const AdminHome = () => {
  const [user, setUser] = useState(null);
  const [userGroup, setUserGroup] = useState(null);
  const [selectedPage, setSelectedPage] = useState("analytics");
  const [nextCategoryNumber, setNextCategoryNumber] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchAuthData = () => {
      fetchAuthSession()
        .then(({ tokens }) => {
          if (tokens && tokens.accessToken) {
            const group = tokens.accessToken.payload["cognito:groups"];
            setUser(tokens.accessToken.payload);
            setUserGroup(group || []);
          }
        })
        .catch((error) => {
          console.log(error);
        })
        .finally(() => {
          setLoading(false);
        });
    };

    fetchAuthData(), checkNotificationStatus(token);
  }, []);



  const removeCompletedNotification = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;
  
      // Make DELETE request without session_id (deletes all completed notifications)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/csv`, // No session_id in URL
        {
          method: "DELETE",
          headers: { Authorization: token, "Content-Type": "application/json" },
        }
      );
  
      if (response.ok) {
        console.log("All completed notifications removed successfully.");
      } else {
        console.error("Failed to remove notifications:", response.statusText);
      }
    } catch (error) {
      console.error("Error removing completed notifications:", error);
    }
  };

  function openWebSocket(session_id, setNotificationForCourse, onComplete) {
    // Open WebSocket connection
    const wsUrl = constructWebSocketUrl();
    const ws = new WebSocket(wsUrl, "graphql-ws");
  
    // Handle WebSocket connection
    ws.onopen = () => {
      console.log("WebSocket connection established");
  
      // Initialize WebSocket connection
      const initMessage = { type: "connection_init" };
      ws.send(JSON.stringify(initMessage));
  
      // Subscribe to notifications
      const subscriptionId = uuidv4();
      const subscriptionMessage = {
          id: subscriptionId,
          type: "start",
          payload: {
            data: JSON.stringify({
              query: `subscription OnNotify($sessionId: String!) {
                onNotify(sessionId: $sessionId) {
                  message
                  sessionId
                }
              }`,
              variables: { sessionId: session_id },
            }),
            extensions: {
              authorization: {
                Authorization: "API_KEY=",
                host: new URL(process.env.NEXT_PUBLIC_APPSYNC_API_URL)
                  .hostname,
              },
            },
          },
      };
  
      ws.send(JSON.stringify(subscriptionMessage));
      console.log("Subscribed to WebSocket notifications");
    };
  
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("WebSocket message received:", message);
  
      // Handle notification
      if (message.type === "data" && message.payload?.data?.onNotify) {
        const receivedMessage = message.payload.data.onNotify.message;
        console.log("Notification received:", receivedMessage);
        
        // Sets icon to show new file on ChatLogs page
        // setNotificationForCourse(session_id, true);
        
        // Remove row from database
        removeCompletedNotification();
  
        // Notify the instructor
        alert(`Chat logs are now available`);
  
        // Close WebSocket after receiving the notification
        ws.close();
        console.log("WebSocket connection closed after handling notification");
  
        // Call the callback function after WebSocket completes
        if (typeof onComplete === "function") {
          onComplete();
        }
      }
    };
  
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };
  
    ws.onclose = () => {
      console.log("WebSocket closed");
    };
  
    // Set a timeout to close the WebSocket if no message is received
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.warn("WebSocket timeout reached, closing connection");
            ws.close();
        }
    }, 180000);
  };
  
  const checkNotificationStatus = async (token) => {
    
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/csv`,
        {
          method: "GET",
          headers: { Authorization: token, "Content-Type": "application/json" },
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.completionStatus === true) {
          console.log(`Getting chatlogs is completed. Notifying the user and removing row from database.`);

          // Sets icon to show new file on ChatLogs page
          // setNotificationForCourse(course.course_id, true);

          // Remove row from database
          removeCompletedNotification();

          // Notify the Instructor
          alert(`Chat logs are available for course: ${course.course_name}`);

        } else if (data.completionStatus === false) {
          // Reopen WebSocket to listen for notifications
          console.log(`Getting chatlogs for ${course.course_name} is not completed. Re-opening the websocket.`);
          openWebSocket(course.course_name, course.course_id, data.requestId, setNotificationForCourse);
        } else {
          console.log(`Either chatlogs for ${course.course_name} were not requested or instructor already received notification. No need to notify instructor or re-open websocket.`);
        }
      }
    } catch (error) {
      console.error("Error checking notification status for", course.course_id, error);
    }
    
  };

  const getHomePage = () => {
    if (userGroup && userGroup.includes("admin")) {
      switch (selectedPage) {
        case "analytics":
          return <Analytics />;
        case "categories":
          return (
            <Categories
              setSelectedPage={setSelectedPage}
              setNextCategoryNumber={setNextCategoryNumber}
              setSelectedCategory={setSelectedCategory}
            />
          );
        case "prompt":
          return <Prompt />;
        case "history":
          return <History />;
        case "files":
          return <Files />;
        case "category_creation":
          return (
            <Category_creation
              setSelectedPage={setSelectedPage}
              nextCategoryNumber={nextCategoryNumber}
              setNextCategoryNumber={setNextCategoryNumber}
            />
          );
        case "edit_category":
          return (
            <Edit_Category
              selectedCategory={selectedCategory}
              setSelectedPage={setSelectedPage}
            />
          );
        case "feedback":
          return <Feedback />;
        case "guidelines":
          return <Guidelines />;
        case "allMessages":
            return <AllMessages openWebSocket={openWebSocket}/>;
        default:
          return <Analytics />;
      }
    } else {
      return <Login />;
    }
  };
  if (loading) {
    return <LoadingScreen />;
  }

  if (userGroup && userGroup.includes("admin")) {
    return (
      <div className="flex flex-col">
        <PostAuthHeader page={selectedPage} />
        <div className="flex">
          <Sidebar
            selectedPage={selectedPage}
            setSelectedPage={setSelectedPage}
          />
          {getHomePage()}
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
      </div>
    );
  } else {
    return (
      <div>
        <Login />
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
      </div>
    );
  }
};

export default AdminHome;
