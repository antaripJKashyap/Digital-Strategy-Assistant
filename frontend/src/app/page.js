import Test from "@/components/Test";
import Image from "next/image";
import { Amplify } from "aws-amplify";


Amplify.configure({
  API: {
    REST: {
      MyApi: {
        endpoint: process.env.NEXT_PUBLIC_API_ENDPOINT
      },
    },
  },
  Auth: {
    Cognito: {
      region: process.env.NEXT_PUBLIC_AWS_REGION,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
      allowGuestAccess: false,
    },
  },
});

export default function Home() {
  return (
    <div>
      <Test />
    </div>
    
  );
}
