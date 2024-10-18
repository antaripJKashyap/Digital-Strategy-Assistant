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

  // Function to format student full names (lowercase and spaces replaced with "_")
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
          event.queryStringParameters.category_name
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
                    NULL,  // Assuming session_id is not applicable here
                    CURRENT_TIMESTAMP,
                    ${engagementType},
                    NULL,  // Assuming user_info is not applicable here
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
      case "GET /admin/get_all_files":
        try {
          // Fetch all documents grouped by category
          const filesGroupedByCategory = await sqlConnectionTableCreator`
              SELECT
                cat.category_id,
                cat.category_name,
                COALESCE(
                  JSON_AGG(
                    JSON_BUILD_OBJECT(
                      'document_id', doc.document_id,
                      'document_name', doc.document_name,
                      'document_type', doc.document_type,
                      'metadata', doc.metadata,
                      'document_s3_file_path', doc.document_s3_file_path,
                      'time_created', doc.time_created
                    )
                  ) FILTER (WHERE doc.document_id IS NOT NULL),
                  '[]'
                ) AS documents
              FROM categories cat
              LEFT JOIN documents doc ON cat.category_id = doc.category_id
              GROUP BY cat.category_id, cat.category_name
              ORDER BY cat.category_id;


            `;

          if (filesGroupedByCategory.length === 0) {
            response.statusCode = 404; // Not Found
            response.body = JSON.stringify({ message: "No documents found" });
          } else {
            response.statusCode = 200; // OK
            response.body = JSON.stringify(filesGroupedByCategory);
          }
        } catch (err) {
          response.statusCode = 500; // Internal Server Error
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "GET /admin/files_within_category":
        if (
          event.queryStringParameters &&
          event.queryStringParameters.category_id
        ) {
          const categoryId = event.queryStringParameters.category_id;

          try {
            const result = await sqlConnectionTableCreator`
                SELECT
                  cat.category_id,
                  cat.category_name,
                  COALESCE(
                    JSON_AGG(
                      JSON_BUILD_OBJECT(
                        'document_id', doc.document_id,
                        'document_name', doc.document_name,
                        'document_type', doc.document_type,
                        'metadata', doc.metadata,
                        'document_s3_file_path', doc.document_s3_file_path,
                        'time_created', doc.time_created
                      )
                    ) FILTER (WHERE doc.document_id IS NOT NULL),
                    '[]'
                  ) AS documents
                FROM categories cat
                LEFT JOIN documents doc ON cat.category_id = doc.category_id
                WHERE cat.category_id = ${categoryId}
                GROUP BY cat.category_id, cat.category_name
                ORDER BY cat.category_id;
              `;

            response.body = JSON.stringify(result);
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "Missing required parameter: category_id",
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
