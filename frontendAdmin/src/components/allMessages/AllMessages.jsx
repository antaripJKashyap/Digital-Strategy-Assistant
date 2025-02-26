import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import { v4 as uuidv4 } from 'uuid';
import { useNotification } from "@/context/NotificationContext"; // Ensure you have this context

export default function AllMessages({ notifications, setNotifications, openWebSocket }) {
  const [loading, setLoading] = useState(false);
  const [previousFiles, setPreviousFiles] = useState([]);
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
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/csv=${encodeURIComponent(
                    session_id)}`,
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
      const session = await fetchAuthSession(); // change
      const token = session.tokens.idToken;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/fetch_chatlogs?session_id=${encodeURIComponent(session_id)}`,
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
        console.log("Chat logs fetched:", data);
        if (data.log_files) {
            const formattedLogs = Object.entries(data.log_files).map(([fileName, presignedUrl]) => ({
                date: convertToLocalTime(fileName), // Using file name as the date
                presignedUrl: presignedUrl,
            }));
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
    const match = fileName.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    if (!match) return fileName;
    
    const utcDate = new Date(match[0] + " UTC");
    return utcDate.toLocaleString(undefined, { timeZoneName: "short" });
  };

  const handleDownload = async () => {
    try {
      setLoading(true);
      const session = await fetchAuthSession();  //change this
      const token = session.tokens.idToken;
      
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
        openWebSocket(requestId, setNotificationForSession, () => {
          setTimeout(() => {
            checkNotificationStatus();
            fetchPreviousFiles();
          }, 2000);
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openWebSocket = (requestId, setNotification, onComplete) => {
    const wsUrl = constructWebSocketUrl(); // Implement this similarly to ChatLogs
    const ws = new WebSocket(wsUrl, "graphql-ws");

    ws.onopen = () => {
      const initMessage = { type: "connection_init" };
      ws.send(JSON.stringify(initMessage));

      const subscriptionId = uuidv4();
      const subscriptionMessage = {
        id: subscriptionId,
        type: "start",
        payload: {
          data: JSON.stringify({
            query: `subscription OnNotify($requestId: String!) {
              onNotify(requestId: $requestId) { message requestId }
            }`,
            variables: { requestId }
          }),
          extensions: { authorization: {/*...*/} }
        }
      };
      ws.send(JSON.stringify(subscriptionMessage));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "data" && message.payload?.data?.onNotify) {
        setNotification(requestId, true);
        alert("New messages CSV is ready!");
        ws.close();
        if (onComplete) onComplete();
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };

    setTimeout(() => ws.close(), 180000);
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