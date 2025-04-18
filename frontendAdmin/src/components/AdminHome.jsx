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
import { v4 as uuidv4 } from 'uuid';
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
            checkNotificationStatus(tokens.idToken);
          }
        })
        .catch((error) => {
          console.log(error);
        })
        .finally(() => {
          setLoading(false);
        });
    };

    fetchAuthData();
  }, []);


  function constructWebSocketUrl() {
    const tempUrl = process.env.NEXT_PUBLIC_APPSYNC_API_URL; // Replace with your WebSocket URL
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
        Authorization: "API_KEY",
    };
  
    const encodedHeader = btoa(JSON.stringify(header));
    const payload = "e30=";
  
    return `${urlObj.toString()}?header=${encodedHeader}&payload=${payload}`;
  };

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

  function openWebSocket(session_id, setNotificationForSession, onComplete) {
    // Open WebSocket connection
    const wsUrl = constructWebSocketUrl();
    const ws = new WebSocket(wsUrl, "graphql-ws");
  
    // Handle WebSocket connection
    ws.onopen = () => {
  
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
      
    };
  
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
  
      // Handle notification
      if (message.type === "data" && message.payload?.data?.onNotify) {
        const receivedMessage = message.payload.data.onNotify.message;
        
        
        // Sets icon to show new file on ChatLogs page
        setNotificationForSession(true);
        
        // Remove row from database
        removeCompletedNotification();
  
        // Notify the instructor
        toast.success("Chat logs are now available!", {
          position: "top-center",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "colored",
        });
        
  
        // Close WebSocket after receiving the notification
        ws.close();
        
  
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
          

          // Sets icon to show new file on Allmessages page
          setNotificationForSession(true);

          // Remove row from database
          removeCompletedNotification();

          // Notify the Instructor
          toast.success("Chat logs are now available!", {
            position: "top-center",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "colored",
          });
          

        } else if (data.completionStatus === false) {
          // Reopen WebSocket to listen for notifications
          
          openWebSocket(session_id, setNotificationForSession);
        } else {
          console.log(`Either chatlogs for  were not requested or instructor already received notification. No need to notify instructor or re-open websocket.`);
        }
      }
    } catch (error) {
      console.error("Error checking notification status for", error);
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
