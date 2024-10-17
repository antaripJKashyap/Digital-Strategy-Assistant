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
      case "POST /user/create_user":
        if (event.queryStringParameters) {
          const {
            user_email,
            username,
            first_name,
            last_name,
            preferred_name,
          } = event.queryStringParameters;

          try {
            // Check if the user already exists
            const existingUser = await sqlConnection`
                SELECT * FROM "Users"
                WHERE user_email = ${user_email};
            `;

            if (existingUser.length > 0) {
              // Update the existing user's information
              const updatedUser = await sqlConnection`
                    UPDATE "Users"
                    SET
                        username = ${username},
                        first_name = ${first_name},
                        last_name = ${last_name},
                        preferred_name = ${preferred_name},
                        last_sign_in = CURRENT_TIMESTAMP,
                        time_account_created = CURRENT_TIMESTAMP
                    WHERE user_email = ${user_email}
                    RETURNING *;
                `;
              response.body = JSON.stringify(updatedUser[0]);
            } else {
              // Insert a new user with 'student' role
              const newUser = await sqlConnection`
                    INSERT INTO "Users" (user_email, username, first_name, last_name, preferred_name, time_account_created, roles, last_sign_in)
                    VALUES (${user_email}, ${username}, ${first_name}, ${last_name}, ${preferred_name}, CURRENT_TIMESTAMP, ARRAY['student'], CURRENT_TIMESTAMP)
                    RETURNING *;
                `;
              response.body = JSON.stringify(newUser[0]);
            }
          } catch (err) {
            response.statusCode = 500;
            console.log(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({ error: "User data is required" });
        }
        break;
      case "POST /user/create_session":
        if (
          event.queryStringParameters.user_info
        ) {
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
      // case "DELETE /user/delete_session":
      //   if (
      //     event.queryStringParameters != null &&
      //     event.queryStringParameters.session_id &&
      //     event.queryStringParameters.email &&
      //     event.queryStringParameters.course_id &&
      //     event.queryStringParameters.module_id
      //   ) {
      //     const sessionId = event.queryStringParameters.session_id;
      //     const studentEmail = event.queryStringParameters.email;
      //     const courseId = event.queryStringParameters.course_id;
      //     const moduleId = event.queryStringParameters.module_id;

      //     try {
      //       // Step 1: Get the user ID using the student_email
      //       const userResult = await sqlConnection`
      //             SELECT user_id
      //             FROM "Users"
      //             WHERE user_email = ${studentEmail}
      //             LIMIT 1;
      //         `;

      //       if (userResult.length === 0) {
      //         response.statusCode = 404;
      //         response.body = JSON.stringify({ error: "Student not found." });
      //         break;
      //       }

      //       const userId = userResult[0].user_id;

      //       // Step 2: Update last_accessed for the corresponding Student_Module entry
      //       await sqlConnection`
      //             UPDATE "Student_Modules"
      //             SET last_accessed = CURRENT_TIMESTAMP
      //             WHERE student_module_id = (
      //               SELECT student_module_id
      //               FROM "Sessions"
      //               WHERE session_id = ${sessionId}
      //             );
      //         `;

      //       // Step 3: Delete the session and get the result
      //       const deleteResult = await sqlConnection`
      //             DELETE FROM "Sessions"
      //             WHERE session_id = ${sessionId}
      //             RETURNING *;
      //         `;

      //       // Step 4: Get the enrolment ID using user_id
      //       const enrolmentData = await sqlConnection`
      //             SELECT "Enrolments".enrolment_id
      //             FROM "Enrolments"
      //             WHERE user_id = ${userId} AND course_id = ${courseId};
      //         `;

      //       // Check if enrolmentData is defined and has rows
      //       if (!enrolmentData || !enrolmentData.length) {
      //         response.statusCode = 404;
      //         response.body = JSON.stringify({ error: "Enrolment not found" });
      //         break;
      //       }

      //       const enrolmentId = enrolmentData[0]?.enrolment_id;

      //       // Step 5: Insert an entry into the User_Engagement_Log if enrolment exists
      //       if (enrolmentId) {
      //         await sqlConnection`
      //               INSERT INTO "User_Engagement_Log" (log_id, user_id, course_id, module_id, enrolment_id, timestamp, engagement_type)
      //               VALUES (uuid_generate_v4(), ${userId}, ${courseId}, ${moduleId}, ${enrolmentId}, CURRENT_TIMESTAMP, 'session deletion');
      //           `;
      //       }

      //       response.body = JSON.stringify({ success: "Session deleted" });
      //     } catch (err) {
      //       response.statusCode = 500;
      //       console.error(err);
      //       response.body = JSON.stringify({ error: "Internal server error" });
      //     }
      //   } else {
      //     response.statusCode = 400;
      //     response.body = JSON.stringify({
      //       error: "session_id, email, course_id, and module_id are required",
      //     });
      //   }
      //   break;
      default:
        throw new Error(`Unsupported route: "${pathData}"`);
    }
  } catch (error) {
    response.statusCode = 400;
    console.log(error);
    response.body = JSON.stringify(error.message);
  }
  console.log(response);

  return response;
};
