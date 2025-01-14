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
import Link from "next/link";

const menuItems = [
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart2,
  },
  {
    id: "categories",
    label: "Categories",
    icon: BookOpen,
  },
  {
    id: "prompt",
    label: "Prompt",
    icon: PenSquare,
  },
  {
    id: "history",
    label: "History",
    icon: History,
  },
  {
    id: "files",
    label: "Files",
    icon: FileText,
  },
  {
    id: "feedback",
    label: "Feedback",
    icon: MessageCircle,
  },
  {
    id: "guidelines",
    label: "Guidelines",
    icon: ScrollText,
  },
  {
    id: "allMessages",
    label: "Get Chat History",
    icon: MessageSquare,
  },
];

export default function Component( {selectedPage, setSelectedPage} ) {
  return (
    <nav className="w-64 border-r border-gray-200 bg-white">
      <div className="flex flex-col py-4 ml-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100"
              onClick={() => {
                console.log(item.id)
                    setSelectedPage(item.id)}}
            >
              <Icon className="w-5 h-5 mr-3" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
