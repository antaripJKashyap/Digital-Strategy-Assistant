"use client"; 
import React, { createContext, useState, useContext } from "react";

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState({});
  const [hasChatHistoryNotification, setHasChatHistoryNotification] = useState(false);

  // Keeping the function name the same but removing sessionId
  const setNotificationForSession = (hasNotification) => {
    setHasChatHistoryNotification(hasNotification);
  };

  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      setNotificationForSession, 
      hasChatHistoryNotification 
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};
