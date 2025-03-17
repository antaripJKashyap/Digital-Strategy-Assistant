"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import { v4 as uuidv4 } from 'uuid';
import { useNotification } from "@/context/NotificationContext"; // Ensure you have this context

export default function AllMessages({ notifications, setNotifications, openWebSocket }) {
  const [loading, setLoading] = useState(false);
  const [previousFiles, setPreviousChatLogs] = useState([]);
  const [isDownloadEnabled, setIsDownloadEnabled] = useState(true);
  const { setNotificationForSession } = useNotification();

  useEffect(() => {
    checkNotificationStatus();
    fetchPreviousFiles();
    const interval = setInterval(fetchPreviousFiles, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkNotificationStatus = async () => {
    try {
      const session = await fetchAuthSession();  // change this
      const token = session.tokens.idToken;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/csv`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setIsDownloadEnabled(data.isEnabled);
      } else {
        console.error("Failed to fetch notification status:", response.statusText);
      }
    } catch (error) {
      console.error("Error checking notification status:", error);
    }
  };

  const fetchPreviousFiles = async () => {
    try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;

        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/fetch_chatlogs`,
            {
                method: "GET",
                headers: {
                    Authorization: token,
                    "Content-Type": "application/json",
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            

            if (data.log_files) {
                const formattedLogs = Object.entries(data.log_files).map(([fileName, presignedUrl]) => {
                    const extractedTimestamp = fileName.split("/").pop(); // Extracts just the filename
                    const dateObject = convertToLocalTime(extractedTimestamp); // Convert to Date object

                    return {
                        date: dateObject.toLocaleString(undefined, { timeZoneName: "short" }), // Formatted for display
                        timestamp: dateObject.getTime(), // Store timestamp for sorting
                        presignedUrl: presignedUrl,
                    };
                });

                // Sort logs by timestamp (latest first)
                formattedLogs.sort((a, b) => b.timestamp - a.timestamp);

                setPreviousChatLogs(formattedLogs);
            } else {
                setPreviousChatLogs([]);
            }
        } else {
            console.error("Failed to fetch chat logs:", response.statusText);
        }
    } catch (error) {
        console.error("Error fetching chat logs:", error);
    } finally {
        setLoading(false);
    }
};

const convertToLocalTime = (fileName) => {
  try {
      const match = fileName.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.csv/);
      if (!match) return new Date(0); // Return an invalid date as fallback

      let formattedTimestamp = match[1].replace(/_/g, " ");
      formattedTimestamp = formattedTimestamp.replace(/(\d{2})-(\d{2})-(\d{2})$/, "$1:$2:$3");

      const utcDate = new Date(formattedTimestamp + " UTC");
      return isNaN(utcDate.getTime()) ? new Date(0) : utcDate;
  } catch (error) {
      console.error("Error parsing timestamp:", error);
      return new Date(0);
  }
};

  const handleDownload = async () => {
    try {
      // Ensure openWebSocket is a function before proceeding
      if (typeof openWebSocket !== "function") {
        console.error("Error: openWebSocket is not a function!");
        return;
      }
  
      setLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;
      // Generate a unique session_id
      const session_id = uuidv4();
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/chat_history`,
        {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ session_id: session_id }),
        }
      );
  
      if (response.ok) {
        
        setIsDownloadEnabled(false);
        openWebSocket(session_id, setNotificationForSession, () => {
          
          setTimeout(() => {
            checkNotificationStatus();
            fetchPreviousFiles();
          }, 2000);
        });
      } else {
        console.error("Failed to submit job:", response.statusText);
      }
    } catch (error) {
      console.error("Error submitting job:", error);
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-4">
      <div className="w-full max-w-3xl text-center">
        <Button 
          onClick={handleDownload} 
          disabled={!isDownloadEnabled || loading}
          className="w-full md:w-auto mb-6"
        >
          {loading ? "Generating..." : "Generate New CSV"}
        </Button>

        <div className="border rounded-lg overflow-hidden w-full">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Generated Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Download
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {previousFiles.map((file, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                    {file.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <Button
                      onClick={() => window.open(file.presignedUrl, "_blank")}
                      variant="outline"
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Download
                    </Button>
                  </td>
                </tr>
              ))}
              {previousFiles.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                    No generated files available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}