import {
  BarChart2,
  BookOpen,
  History,
  PenSquare,
  FileText,
  MessageCircle,
  ScrollText,
  MessageSquare,
} from "lucide-react";
import { useNotification } from "../context/NotificationContext";

const menuItems = [
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "categories", label: "Categories", icon: BookOpen },
  { id: "prompt", label: "Prompt", icon: PenSquare },
  { id: "history", label: "History", icon: History },
  { id: "files", label: "Files", icon: FileText },
  { id: "feedback", label: "Feedback", icon: MessageCircle },
  { id: "guidelines", label: "Guidelines", icon: ScrollText },
  { id: "allMessages", label: "Get Chat History", icon: MessageSquare },
];

export default function Sidebar({ selectedPage, setSelectedPage }) {
  const { hasChatHistoryNotification, setNotificationForSession } = useNotification();

  return (
    <nav className="w-64 border-r border-gray-200 bg-white">
      <div className="flex flex-col py-4 ml-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isChatHistory = item.id === "allMessages";

          return (
            <button
              key={item.id}
              className={`relative flex items-center w-full px-4 py-2 text-gray-700 hover:bg-gray-100 ${
                selectedPage === item.id ? "font-bold" : ""
              }`}
              onClick={() => {
                setSelectedPage(item.id);
                if (isChatHistory) setNotificationForSession(false); // Clear notification when clicked
              }}
            >
              {/* Wrapper for Icon + Dot */}
              <div className="relative w-6 h-6 flex items-center justify-center">
                <Icon className="w-5 h-5" />
                {/* Only show dot when NOT on "Get Chat History" */}
                {isChatHistory && hasChatHistoryNotification && selectedPage !== "allMessages" && (
                  <span className="absolute -top-1 -left-1 bg-blue-900 w-2 h-2 rounded-full"></span>
                )}
              </div>

              <span className="ml-3 text-sm">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
