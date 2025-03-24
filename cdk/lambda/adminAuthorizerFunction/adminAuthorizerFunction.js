const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

// Create a Secrets Manager client
const secretsManager = new SecretsManagerClient();

let { SM_COGNITO_CREDENTIALS } = process.env;

// Cache variables declared outside the handler
let cachedSecret;
let jwtVerifier;

// Function to retrieve and cache the secret
async function getCachedSecret() {
  if (!cachedSecret) {
    const command = new GetSecretValueCommand({ SecretId: SM_COGNITO_CREDENTIALS });
    const secretResponse = await secretsManager.send(command);
    cachedSecret = JSON.parse(secretResponse.SecretString);
  }
  return cachedSecret;
}

// Initialize the JWT verifier if not already done
async function initializeConnection() {
  try {
    const credentials = await getCachedSecret();

    jwtVerifier = CognitoJwtVerifier.create({
      userPoolId: credentials.VITE_COGNITO_USER_POOL_ID,
      tokenUse: "id",
      groups: 'admin',
      clientId: credentials.VITE_COGNITO_USER_POOL_CLIENT_ID,
    });
  } catch (error) {
    console.error("Error initializing JWT verifier:", error);
    throw new Error("Failed to initialize JWT verifier");
  }
}

exports.handler = async (event) => {
  if (!jwtVerifier) {
    await initializeConnection();
  }

  const accessToken = event.authorizationToken.toString();
  let payload;

  try {
    payload = await jwtVerifier.verify(accessToken);
    
    // Build resource string for policy
    const parts = event.methodArn.split('/');
    const resource = parts.slice(0, 2).join('/') + '*';

    const responseStruct = {
      "principalId": payload.sub, // principal user identification
      "policyDocument": {
        "Version": "2012-10-17",
        "Statement": [{
          "Action": "execute-api:Invoke",
          "Effect": "Allow",
          "Resource": resource
        }]
      },
      "context": {
        "userId": payload.sub
      }
    };

    return responseStruct;
  } catch (error) {
    console.error("Authorization error:", error);
    // Return an exact error message for API Gateway to respond with 401
    throw new Error("Unauthorized");
  }
};
