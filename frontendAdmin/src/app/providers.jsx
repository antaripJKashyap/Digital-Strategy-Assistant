"use client";
import { NotificationProvider } from "../context/NotificationContext";

export default function Providers({ children }) {
  return (
    <NotificationProvider>
      {children}
    </NotificationProvider>
  );
}
