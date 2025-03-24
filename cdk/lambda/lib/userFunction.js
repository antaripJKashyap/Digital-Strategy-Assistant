const { initializeConnection } = require("./lib.js");
let { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT, USER_POOL } = process.env;

// SQL conneciton from global variable at lib.js
let sqlConnection = global.sqlConnection;

exports.handler = async (event) => {
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
    },
    body: "",
  };

  // Initialize the database connection if not already initialized
  if (!sqlConnection) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
    sqlConnection = global.sqlConnection;
  }

  let data;
  try {
    const pathData = event.httpMethod + " " + event.resource;
    switch (pathData) {
      case "POST /user/create_feedback":
        if (
          event.queryStringParameters.user_info &&
          event.queryStringParameters.user_role &&
          event.queryStringParameters.session_id &&
          event.queryStringParameters.feedback_rating &&
          event.queryStringParameters.feedback_description
        ) {
          const userInfo = event.queryStringParameters.user_info;
          const userRole = event.queryStringParameters.user_role;
          const sessionId = event.queryStringParameters.session_id;
          const feedbackRating = event.queryStringParameters.feedback_rating;
          const feedbackDescription =
            event.queryStringParameters.feedback_description;

          try {
            const feedbackData = await sqlConnection`
                    INSERT INTO feedback (feedback_id, session_id, feedback_rating, feedback_description, timestamp)
                    VALUES (
                      uuid_generate_v4(),
                      ${sessionId},
                      ${feedbackRating},
                      ${feedbackDescription},
                      CURRENT_TIMESTAMP
                    )
                    RETURNING *;
                `;
            const feedbackId = feedbackData[0]?.feedback_id;

            if (feedbackId) {
              await sqlConnection`
                      INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, engagement_details, user_info, user_role)
                      VALUES (
                        uuid_generate_v4(),
                        ${sessionId},
                        CURRENT_TIMESTAMP,
                        'feedback creation',
                        ${feedbackRating},
                        ${userInfo},
                        ${userRole}
                      )
                    `;
            }

            response.body = JSON.stringify(feedbackData);
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "Invalid value",
          });
        }
        break;
      case "POST /user/create_session":
        if (event.queryStringParameters.user_info) {
          const userInfo = event.queryStringParameters.user_info;
          try {
            const sessionData = await sqlConnection`
                  INSERT INTO sessions (session_id, time_created)
                  VALUES (
                    uuid_generate_v4(),
                    CURRENT_TIMESTAMP
                  )
                  RETURNING *;
              `;
            const sessionId = sessionData[0]?.session_id;

            if (sessionId) {
              await sqlConnection`
                    INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info)
                    VALUES (
                      uuid_generate_v4(),
                      ${sessionId},
                      CURRENT_TIMESTAMP,
                      'session creation',
                      ${userInfo}
                    )
                  `;
            }

            response.body = JSON.stringify(sessionData);
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "Invalid value",
          });
        }
        break;
      case "GET /user/guidelines":
        try {
          // SQL query to get all guidelines
          const guidelines = await sqlConnection`
      SELECT DISTINCT criteria_name
      FROM guidelines;
    `;

          response.body = JSON.stringify({
            guidelines,
          });
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      default:
        throw new Error(`Unsupported route: "${pathData}"`);
    }
  } catch (error) {
    response.statusCode = 400;
    console.log(error);
    response.body = JSON.stringify(error.message);
  }
  

  return response;
};
