import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchAuthSession } from "aws-amplify/auth";

export default function AllMessages() {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    try {
      setLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/admin/messages`,
        {
          headers: {
            Authorization: token
          }
        }
      );
      
      const data = await response.json();
      // Create CSV download logic
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <Button 
        onClick={handleDownload}
        disabled={loading}
      >
        Download Messages
      </Button>
    </div>
  );
}