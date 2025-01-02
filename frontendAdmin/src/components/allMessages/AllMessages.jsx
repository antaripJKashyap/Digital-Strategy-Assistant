import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { fetchAuthSession } from "aws-amplify/auth";

export default function AllMessages() {
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);

  useEffect(() => {
    fetchLastGeneratedInfo();
  }, []);

  const fetchLastGeneratedInfo = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/messages/last-generated`,
        {
          headers: {
            Authorization: token,
          }
        }
      );

      const data = await response.json();
      setLastGenerated(data);
    } catch (error) {
      console.error("Error fetching last generated info:", error);
    }
  };

  const handleDownload = async () => {
    try {
      setLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/messages`,
        {
          headers: {
            Authorization: token,
          }
        }
      );

      const data = await response.json();
      await fetchLastGeneratedInfo(); // Refresh last generated info
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const downloadPrevious = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/messages/download-previous`,
        {
          headers: {
            Authorization: token,
          }
        }
      );

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "previous-messages.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading previous file:", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-4">
      <div className="w-full max-w-3xl text-center">
        <Button 
          onClick={handleDownload} 
          disabled={loading} 
          className="w-full md:w-auto mb-6"
        >
          Generate New CSV
        </Button>

        <div className="border rounded-lg overflow-hidden w-full">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Generated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lastGenerated && (
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                    {new Date(lastGenerated.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <Button
                      onClick={downloadPrevious}
                      variant="outline"
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Download Previous
                    </Button>
                  </td>
                </tr>
              )}
              {!lastGenerated && (
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                    No previous CSV generated
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
