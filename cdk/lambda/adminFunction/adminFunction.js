const { initializeConnection } = require("./libadmin.js");

let { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT } = process.env;

// SQL conneciton from global variable at libadmin.js
let sqlConnectionTableCreator = global.sqlConnectionTableCreator;

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
  if (!sqlConnectionTableCreator) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
    sqlConnectionTableCreator = global.sqlConnectionTableCreator;
  }

  // Function to format user full names (lowercase and spaces replaced with "_")
  const formatNames = (name) => {
    return name.toLowerCase().replace(/\s+/g, "_");
  };

  let data;
  try {
    const pathData = event.httpMethod + " " + event.resource;
    switch (pathData) {
      case "GET /admin/analytics":
        try {
          // Get current date, subtract one year for the time range
          const currentDate = new Date();
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

          // SQL query to get the number of unique users per month
          const uniqueUsersPerMonth = await sqlConnectionTableCreator`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', ${oneYearAgo}::date),
          date_trunc('month', ${currentDate}::date),
          '1 month'
        ) AS month
      )
      SELECT 
        m.month,
        COALESCE(COUNT(DISTINCT uel.user_info), 0) AS unique_users
      FROM months m
      LEFT JOIN user_engagement_log uel
        ON DATE_TRUNC('month', uel.timestamp) = m.month
      GROUP BY m.month
      ORDER BY m.month;
    `;

          // SQL query to get the number of messages per month per user_role
          const messagesPerRolePerMonth = await sqlConnectionTableCreator`
      WITH months AS (
            SELECT generate_series(
                date_trunc('month', ${oneYearAgo}::date),
                date_trunc('month', ${currentDate}::date),
                '1 month'
            ) AS month
        )
        SELECT 
            m.month,
            COALESCE(uel.user_role, 'unknown') AS user_role,
            COUNT(CASE WHEN uel.engagement_type = 'message creation' THEN 1 END) AS message_count
        FROM months m
        LEFT JOIN user_engagement_log uel
            ON DATE_TRUNC('month', uel.timestamp) = m.month
        GROUP BY m.month, uel.user_role
        ORDER BY m.month, uel.user_role;
    `;

          // SQL query to get the total average feedback rating for each user_role
          const totalFeedbackAveragePerRole = await sqlConnectionTableCreator`
    SELECT 
        COALESCE(uel.user_role, 'unknown') AS user_role,
        AVG(fb.feedback_rating) AS avg_feedback_rating
    FROM feedback fb
    LEFT JOIN user_engagement_log uel
        ON fb.session_id = uel.session_id
    GROUP BY uel.user_role;
`;
          const formattedFeedback = totalFeedbackAveragePerRole.map((role) => ({
            user_role: role.user_role,
            avg_feedback_rating:
              role.avg_feedback_rating !== null
                ? role.avg_feedback_rating
                : "no feedback yet",
          }));

          // Return the combined data in the response
          response.body = JSON.stringify({
            unique_users_per_month: uniqueUsersPerMonth,
            messages_per_role_per_month: messagesPerRolePerMonth,
            avg_feedback_per_role: formattedFeedback,
          });
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "POST /admin/create_category":
        if (
          event.queryStringParameters.category_name &&
          event.queryStringParameters.category_number
        ) {
          const { category_name, category_number } =
            event.queryStringParameters;
          try {
            // Insert the new category
            const categoryData = await sqlConnectionTableCreator`
                INSERT INTO categories (category_id, category_name, category_number)
                VALUES (
                  uuid_generate_v4(),
                  ${category_name},
                  ${category_number}
                )
                RETURNING *;
              `;

            // Insert a record into the user engagement log
            await sqlConnectionTableCreator`
                INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info, user_role)
                VALUES (
                  uuid_generate_v4(),
                  NULL,
                  CURRENT_TIMESTAMP,
                  'category creation',
                  NULL,
                  'admin'
                )
              `;

            response.statusCode = 201;
            response.body = JSON.stringify({
              category_id: categoryData[0]?.category_id,
              category_name: categoryData[0]?.category_name,
              category_number: categoryData[0]?.category_number,
            });
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error:
              "Invalid value: category_name and category_number are required.",
          });
        }
        break;
      case "GET /admin/categories":
        try {
          // Query to get all categories
          const categoriesData = await sqlConnectionTableCreator`
              SELECT category_id, category_name, category_number
              FROM categories;
            `;

          response.statusCode = 200;
          response.body = JSON.stringify(categoriesData);
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "PUT /admin/edit_category":
        if (
          event.queryStringParameters.category_id &&
          event.queryStringParameters.category_name &&
          event.queryStringParameters.category_number
        ) {
          const editCategoryId = event.queryStringParameters.category_id;
          const editCategoryName = event.queryStringParameters.category_name;
          const editCategoryNumber =
            event.queryStringParameters.category_number;

          try {
            // Update category query
            const updateResult = await sqlConnectionTableCreator`
              UPDATE categories
              SET category_name = ${editCategoryName}, category_number = ${editCategoryNumber}
              WHERE category_id = ${editCategoryId}
              RETURNING *;
            `;

            if (updateResult.length === 0) {
              response.statusCode = 404;
              response.body = JSON.stringify({ error: "Category not found" });
            } else {
              const userRole = "admin";
              const engagementType = "category edited";

              await sqlConnectionTableCreator`
                INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info, user_role)
                VALUES (
                  uuid_generate_v4(),
                  NULL,
                  CURRENT_TIMESTAMP,
                  ${engagementType},
                  NULL,
                  ${userRole}
                )
              `;

              response.statusCode = 200;
              response.body = JSON.stringify(updateResult[0]);
            }
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "Missing required parameters",
          });
        }
        break;
      case "DELETE /admin/delete_category":
        if (
          event.queryStringParameters &&
          event.queryStringParameters.category_id
        ) {
          const categoryId = event.queryStringParameters.category_id;

          try {
            // Delete category query
            const deleteResult = await sqlConnectionTableCreator`
                DELETE FROM categories
                WHERE category_id = ${categoryId}
                RETURNING *; 
              `;

            if (deleteResult.length === 0) {
              response.statusCode = 404;
              response.body = JSON.stringify({ error: "Category not found" });
            } else {
              const userRole = "admin";
              const engagementType = "category deleted";

              // Log the category deletion in user engagement log
              await sqlConnectionTableCreator`
                  INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info, user_role)
                  VALUES (
                    uuid_generate_v4(),
                    NULL,
                    CURRENT_TIMESTAMP,
                    ${engagementType},
                    NULL,
                    ${userRole}
                  )
                `;

              response.statusCode = 200;
              response.body = JSON.stringify({
                message: "Category deleted successfully",
              });
            }
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "Missing required parameters",
          });
        }
        break;
      case "PUT /admin/update_metadata":
        if (
          event.queryStringParameters &&
          event.queryStringParameters.document_id &&
          event.queryStringParameters.metadata
        ) {
          const updateDocumentId = event.queryStringParameters.document_id;
          const updateMetaData = event.queryStringParameters.metadata;

          try {
            // Update meta_data query
            const updateResult = await sqlConnectionTableCreator`
                UPDATE documents
                SET metadata = ${updateMetaData}
                WHERE document_id = ${updateDocumentId}
                RETURNING *;
              `;

            if (updateResult.length === 0) {
              response.statusCode = 404; // Not Found
              response.body = JSON.stringify({ error: "Document not found" });
            } else {
              const userRole = "admin";
              const engagementType = "meta data updated";

              // Log the meta data update in user engagement log
              await sqlConnectionTableCreator`
                  INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info, user_role)
                  VALUES (
                    uuid_generate_v4(),
                    NULL,
                    CURRENT_TIMESTAMP,
                    ${engagementType},
                    NULL,
                    ${userRole}
                  )
                `;

              response.statusCode = 200; // OK
              response.body = JSON.stringify(updateResult[0]); // Return the updated document
            }
          } catch (err) {
            response.statusCode = 500; // Internal Server Error
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400; // Bad Request
          response.body = JSON.stringify({
            error: "Missing required parameters",
          });
        }
        break;
      case "GET /admin/conversation_history_preview":
        try {
          const result = await sqlConnectionTableCreator`
              WITH RankedMessages AS (
                SELECT
                  uel.user_role,
                  uel.engagement_type,
                  uel.timestamp,
                  uel.user_info,
                  uel.engagement_details,
                  ROW_NUMBER() OVER (PARTITION BY uel.user_role ORDER BY uel.timestamp DESC) AS rn
                FROM user_engagement_log uel
                WHERE uel.engagement_type = 'message creation'
                  AND uel.user_role IN ('public', 'educator', 'admin')
              )
              SELECT user_role, engagement_type, timestamp, user_info, engagement_details
              FROM RankedMessages
              WHERE rn <= 10
              ORDER BY user_role, timestamp DESC;
            `;

          const groupedResults = result.reduce((acc, row) => {
            if (!acc[row.user_role]) {
              acc[row.user_role] = [];
            }
            acc[row.user_role].push(row);
            return acc;
          }, {});

          response.body = JSON.stringify(groupedResults);
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "GET /admin/conversation_sessions":
        if (
          event.queryStringParameters &&
          event.queryStringParameters.user_role
        ) {
          const userRole = event.queryStringParameters.user_role;

          try {
            const sessions = await sqlConnectionTableCreator`
                SELECT DISTINCT ON (uel.session_id)
                  uel.session_id,
                  uel.timestamp AS last_message_time
                FROM user_engagement_log uel
                WHERE uel.user_role = ${userRole} AND uel.engagement_type = 'message creation'
                ORDER BY uel.session_id, uel.timestamp DESC;
              `;

            response.body = JSON.stringify(sessions);
            response.statusCode = 200; // OK
          } catch (err) {
            response.statusCode = 500; // Internal Server Error
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400; // Bad Request
          response.body = JSON.stringify({
            error: "Missing required parameter: user_role",
          });
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
  console.log(response);
  return response;
};
