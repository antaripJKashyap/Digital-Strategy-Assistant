"use client"; 
import React, { createContext, useState, useContext } from "react";

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState({});

  const setNotificationForSession = (sessionId, hasNotification) => {
    setNotifications((prev) => ({ ...prev, [sessionId]: hasNotification }));
  };

  return (
    <NotificationContext.Provider value={{ notifications, setNotificationForSession }}>
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