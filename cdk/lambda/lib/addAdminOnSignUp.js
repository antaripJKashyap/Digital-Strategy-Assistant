const { initializeConnection } = require("./lib.js");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminAddUserToGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT } = process.env;
let sqlConnection = global.sqlConnection;

exports.handler = async (event) => {
  if (!sqlConnection) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
    sqlConnection = global.sqlConnection;
  }

  const { userName, userPoolId } = event;
  const client = new CognitoIdentityProviderClient();

  try {
    // Get user attributes from Cognito to retrieve the email
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: userName,
    });
    const userAttributesResponse = await client.send(getUserCommand);

    const emailAttr = userAttributesResponse.UserAttributes.find(
      (attr) => attr.Name === "email"
    );
    const email = emailAttr ? emailAttr.Value : null;

    // Add the user to the "admin" group without removing existing groups
    const addUserToGroupCommand = new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: userName,
      GroupName: "admin",
    });
    await client.send(addUserToGroupCommand);

    // Insert the new user into the Users table
    await sqlConnection`
      INSERT INTO "Users" (user_id, user_email, time_account_created, last_sign_in)
      VALUES (uuid_generate_v4(), ${email}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;

    return event;
  } catch (err) {
    console.error(
      "Error assigning user to group or inserting into database:",
      err
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error",
      }),
    };
  }
};
