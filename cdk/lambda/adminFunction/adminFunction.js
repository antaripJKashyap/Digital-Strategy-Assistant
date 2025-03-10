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
    // Get the view parameter from the query string
    const viewParam = event.queryStringParameters?.view || 'month';
    
    // Get current date
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    
    // Determine time range based on view parameter
    let startDate;
    let responseKey = 'unique_users_per_month'; // Default key name for backward compatibility
    let responseMessageKey = 'messages_per_role_per_month'; // Default key name for messages
    
    if (viewParam === 'day') {
      // For 'day' view, get data for current month by days
      startDate = new Date(currentYear, currentMonth, 1); // 1st day of current month
      responseKey = 'unique_users_per_time_unit';
      responseMessageKey = 'messages_per_role_per_time_unit';
    } else if (viewParam === 'month') {
      // For 'month' view, get past 12 months
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 11); // 12 months including current month
      responseKey = 'unique_users_per_time_unit';
      responseMessageKey = 'messages_per_role_per_time_unit';
    } else {
      // For 'year' view, get data for current year only
      startDate = new Date(currentYear, 0, 1); // Jan 1st of current year
      responseKey = 'unique_users_per_time_unit';
      responseMessageKey = 'messages_per_role_per_time_unit';
    }
    
    // Format dates for SQL
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedCurrentDate = currentDate.toISOString().split('T')[0];
    
    let uniqueUsersQuery;
    let messagesPerRoleQuery;
    
    if (viewParam === 'day') {
      // Query for daily data in current month
      uniqueUsersQuery = await sqlConnectionTableCreator`
        WITH days AS (
          SELECT generate_series(
            date_trunc('day', ${formattedStartDate}::date),
            date_trunc('day', ${formattedCurrentDate}::date),
            '1 day'
          ) AS day
        )
        SELECT 
          EXTRACT(DAY FROM d.day) AS day,
          COALESCE(COUNT(DISTINCT uel.user_info), 0) AS unique_users
        FROM days d
        LEFT JOIN user_engagement_log uel
          ON DATE_TRUNC('day', uel.timestamp) = d.day
        GROUP BY d.day
        ORDER BY d.day;
      `;
      
      messagesPerRoleQuery = await sqlConnectionTableCreator`
        WITH days AS (
          SELECT generate_series(
            date_trunc('day', ${formattedStartDate}::date),
            date_trunc('day', ${formattedCurrentDate}::date),
            '1 day'
          ) AS day
        )
        SELECT 
          EXTRACT(DAY FROM d.day) AS day,
          COALESCE(uel.user_role, 'unknown') AS user_role,
          COUNT(CASE WHEN uel.engagement_type = 'message creation' THEN 1 END) AS message_count
        FROM days d
        LEFT JOIN user_engagement_log uel
          ON DATE_TRUNC('day', uel.timestamp) = d.day
        GROUP BY d.day, uel.user_role
        ORDER BY d.day, uel.user_role;
      `;
    } else {
      // Query for monthly data (either past 12 months or current year)
      uniqueUsersQuery = await sqlConnectionTableCreator`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', ${formattedStartDate}::date),
            date_trunc('month', ${formattedCurrentDate}::date),
            '1 month'
          ) AS month
        )
        SELECT 
          to_char(m.month, 'Mon YYYY') AS month,
          COALESCE(COUNT(DISTINCT uel.user_info), 0) AS unique_users
        FROM months m
        LEFT JOIN user_engagement_log uel
          ON DATE_TRUNC('month', uel.timestamp) = m.month
        GROUP BY m.month
        ORDER BY m.month;
      `;
      
      messagesPerRoleQuery = await sqlConnectionTableCreator`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', ${formattedStartDate}::date),
            date_trunc('month', ${formattedCurrentDate}::date),
            '1 month'
          ) AS month
        )
        SELECT 
          to_char(m.month, 'Mon YYYY') AS month,
          COALESCE(uel.user_role, 'unknown') AS user_role,
          COUNT(CASE WHEN uel.engagement_type = 'message creation' THEN 1 END) AS message_count
        FROM months m
        LEFT JOIN user_engagement_log uel
          ON DATE_TRUNC('month', uel.timestamp) = m.month
        GROUP BY m.month, uel.user_role
        ORDER BY m.month, uel.user_role;
      `;
    }

    // Process messages per role per time unit for chart display
    const processedMessagesPerTimeUnit = [];
    
    if (viewParam === 'day') {
      // For day view, process daily data
      const daysSet = new Set(messagesPerRoleQuery.map(item => item.day));
      
      daysSet.forEach(day => {
        const dayData = messagesPerRoleQuery.filter(item => item.day == day);
        
        const publicData = dayData.find(item => item.user_role === 'public');
        const educatorData = dayData.find(item => item.user_role === 'educator');
        const adminData = dayData.find(item => item.user_role === 'admin');
        
        processedMessagesPerTimeUnit.push({
          day: day,
          public: publicData ? parseInt(publicData.message_count) : 0,
          educator: educatorData ? parseInt(educatorData.message_count) : 0,
          admin: adminData ? parseInt(adminData.message_count) : 0
        });
      });
      
      // Sort by day numerically
      processedMessagesPerTimeUnit.sort((a, b) => a.day - b.day);
    } else {
      // For month view, process monthly data
      const monthsSet = new Set(messagesPerRoleQuery.map(item => item.month));
      
      monthsSet.forEach(month => {
        const monthData = messagesPerRoleQuery.filter(item => item.month === month);
        
        const publicData = monthData.find(item => item.user_role === 'public');
        const educatorData = monthData.find(item => item.user_role === 'educator');
        const adminData = monthData.find(item => item.user_role === 'admin');
        
        processedMessagesPerTimeUnit.push({
          month: month,
          public: publicData ? parseInt(publicData.message_count) : 0,
          educator: educatorData ? parseInt(educatorData.message_count) : 0,
          admin: adminData ? parseInt(adminData.message_count) : 0
        });
      });
      
      // Sort by month chronologically
      processedMessagesPerTimeUnit.sort((a, b) => {
        const dateA = new Date(a.month);
        const dateB = new Date(b.month);
        return dateA - dateB;
      });
    }

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
    const responseData = {
      avg_feedback_per_role: formattedFeedback,
    };
    
    // Add time-dependent data with appropriate keys
    responseData[responseKey] = uniqueUsersQuery;
    responseData[responseMessageKey] = processedMessagesPerTimeUnit;
    
    response.body = JSON.stringify(responseData);
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
            FROM categories
            ORDER BY category_number ASC;
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
          event.queryStringParameters != null &&
          event.queryStringParameters.category_id &&
          event.queryStringParameters.document_name &&
          event.queryStringParameters.document_type
        ) {
          const categoryId = event.queryStringParameters.category_id;
          const documentName = event.queryStringParameters.document_name;
          const documentType = event.queryStringParameters.document_type;
          const { metadata } = JSON.parse(event.body);

          try {
            // Query to find the document with the given category_id, document_name, and document_type
            const existingDocument = await sqlConnectionTableCreator`
        SELECT * FROM documents
        WHERE category_id = ${categoryId}
        AND document_name = ${documentName}
        AND document_type = ${documentType};
      `;

            if (existingDocument.length === 0) {
              // If document does not exist, insert a new entry
              const result = await sqlConnectionTableCreator`
          INSERT INTO documents (document_id, category_id, document_s3_file_path, document_name, document_type, metadata, time_created)
          VALUES (uuid_generate_v4(), ${categoryId}, NULL, ${documentName}, ${documentType}, ${metadata}, CURRENT_TIMESTAMP)
          RETURNING *;
        `;
              response.statusCode = 201;
              response.body = JSON.stringify({
                message: "Document metadata added successfully",
                document: result[0],
              });
            } else {
              // Update the metadata field for an existing document
              const result = await sqlConnectionTableCreator`
          UPDATE documents
          SET metadata = ${metadata}
          WHERE category_id = ${categoryId}
          AND document_name = ${documentName}
          AND document_type = ${documentType}
          RETURNING *;
        `;

              if (result.length > 0) {
                response.statusCode = 200;
                response.body = JSON.stringify({
                  message: "Document metadata updated successfully",
                  document: result[0],
                });
              } else {
                response.statusCode = 500;
                response.body = JSON.stringify({
                  error: "Failed to update metadata.",
                });
              }
            }
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "category_id, document_name, and document_type are required",
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
       WITH ranked_messages AS (
          SELECT 
            session_id,
            engagement_details,
            timestamp,
            ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp) as msg_order,
            ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp DESC) as reverse_order
          FROM user_engagement_log
          WHERE 
            session_id IS NOT NULL
            AND engagement_type = 'message creation'
            AND user_role = ${userRole}
        ),
        second_messages AS (
          SELECT 
            session_id,
            engagement_details as second_message_details
          FROM ranked_messages
          WHERE msg_order = 2
        ),
        latest_messages AS (
          SELECT 
            session_id,
            timestamp as last_message_time
          FROM ranked_messages
          WHERE reverse_order = 1
        )
        SELECT 
          lm.session_id,
          lm.last_message_time,
          sm.second_message_details
        FROM latest_messages lm
        LEFT JOIN second_messages sm ON lm.session_id = sm.session_id
        ORDER BY lm.last_message_time DESC;
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
      case "GET /admin/latest_prompt":
        try {
          // Queries to get the most recent non-null entries for each role
          const latestPublicPrompt = await sqlConnectionTableCreator`
      SELECT public, time_created
      FROM prompts
      WHERE public IS NOT NULL
      ORDER BY time_created DESC NULLS LAST
      LIMIT 1;
    `;

          const latestEducatorPrompt = await sqlConnectionTableCreator`
      SELECT educator, time_created
      FROM prompts
      WHERE educator IS NOT NULL
      ORDER BY time_created DESC NULLS LAST
      LIMIT 1;
    `;

          const latestAdminPrompt = await sqlConnectionTableCreator`
      SELECT admin, time_created
      FROM prompts
      WHERE admin IS NOT NULL
      ORDER BY time_created DESC NULLS LAST
      LIMIT 1;
    `;

          // Building the response object with non-null values for each role
          const latestPrompt = {};
          if (latestPublicPrompt.length > 0) {
            latestPrompt.public = {
              prompt: latestPublicPrompt[0].public,
              time_created: latestPublicPrompt[0].time_created,
            };
          }
          if (latestEducatorPrompt.length > 0) {
            latestPrompt.educator = {
              prompt: latestEducatorPrompt[0].educator,
              time_created: latestEducatorPrompt[0].time_created,
            };
          }
          if (latestAdminPrompt.length > 0) {
            latestPrompt.admin = {
              prompt: latestAdminPrompt[0].admin,
              time_created: latestAdminPrompt[0].time_created,
            };
          }

          // Check if any non-null prompts were found
          if (Object.keys(latestPrompt).length === 0) {
            response.statusCode = 404;
            response.body = JSON.stringify({ error: "No prompts found" });
          } else {
            response.statusCode = 200;
            response.body = JSON.stringify(latestPrompt);
          }
        } catch (err) {
          // Handle any errors that occur during the query
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "GET /admin/previous_prompts":
        try {
          // Subquery to get the latest non-null time_created for each role
          const latestTimestamps = await sqlConnectionTableCreator`
      SELECT 
        MAX(time_created) FILTER (WHERE public IS NOT NULL) AS latest_public,
        MAX(time_created) FILTER (WHERE educator IS NOT NULL) AS latest_educator,
        MAX(time_created) FILTER (WHERE admin IS NOT NULL) AS latest_admin
      FROM prompts;
    `;

          const { latest_public, latest_educator, latest_admin } =
            latestTimestamps[0];

          // Query to get all previous non-null entries for each role after the latest entry
          const previousPrompts = await sqlConnectionTableCreator`
      SELECT public, educator, admin, time_created
      FROM prompts
      WHERE 
        (public IS NOT NULL AND time_created < ${latest_public}) OR
        (educator IS NOT NULL AND time_created < ${latest_educator}) OR
        (admin IS NOT NULL AND time_created < ${latest_admin})
      ORDER BY time_created DESC;
    `;

          // Organize prompts by role and ignore null values
          const organizedPrompts = {
            public: previousPrompts
              .filter((entry) => entry.public !== null)
              .map((entry) => ({
                prompt: entry.public,
                time_created: entry.time_created,
              })),
            educator: previousPrompts
              .filter((entry) => entry.educator !== null)
              .map((entry) => ({
                prompt: entry.educator,
                time_created: entry.time_created,
              })),
            admin: previousPrompts
              .filter((entry) => entry.admin !== null)
              .map((entry) => ({
                prompt: entry.admin,
                time_created: entry.time_created,
              })),
          };

          // Return the organized prompts by role
          response.statusCode = 200;
          response.body = JSON.stringify(organizedPrompts);
        } catch (err) {
          // Handle any errors that occur during the query
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "POST /admin/insert_prompt":
        try {
          // Check if the required query parameter and body are provided
          if (
            !event.queryStringParameters ||
            !event.queryStringParameters.role ||
            !event.body
          ) {
            response.statusCode = 400;
            response.body = JSON.stringify({
              error: "Missing required parameters",
            });
            break;
          }

          // Get role from query string and prompt from request body
          const role = event.queryStringParameters.role;
          const { prompt } = JSON.parse(event.body);

          // Validate that role is one of the accepted roles
          if (!["public", "educator", "admin"].includes(role)) {
            response.statusCode = 400;
            response.body = JSON.stringify({ error: "Invalid role provided" });
            break;
          }

          // Prepare the prompt data with null values for other roles
          const promptData = {
            public: role === "public" ? prompt : null,
            educator: role === "educator" ? prompt : null,
            admin: role === "admin" ? prompt : null,
            time_created: new Date(), // Current timestamp
          };

          // Insert into the prompts table
          await sqlConnectionTableCreator`
      INSERT INTO prompts (public, educator, admin, time_created)
      VALUES (${promptData.public}, ${promptData.educator}, ${promptData.admin}, ${promptData.time_created});
    `;

          // Return success response
          response.statusCode = 201;
          response.body = JSON.stringify({
            message: "Prompt inserted successfully",
          });
        } catch (err) {
          // Handle any errors that occur during the insert
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "GET /admin/get_feedback":
        try {
          if (
            !event.queryStringParameters ||
            !event.queryStringParameters.session_id
          ) {
            response.statusCode = 400;
            response.body = JSON.stringify({
              error: "Missing required parameter: session_id",
            });
            break;
          }

          const session_id = event.queryStringParameters.session_id;
          const feedbackEntries = await sqlConnectionTableCreator`
        SELECT feedback_id, session_id, feedback_rating, feedback_description, timestamp
        FROM feedback
        WHERE session_id = ${session_id}
        ORDER BY timestamp DESC;
        `;
          if (feedbackEntries.length === 0) {
            response.statusCode = 404;
            response.body = JSON.stringify({
              error: "No feedback found for the given session_id",
            });
          } else {
            response.statusCode = 200;
            response.body = JSON.stringify(feedbackEntries);
          }
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "GET /admin/feedback_by_role":
        try {
          const feedbackData = await sqlConnectionTableCreator`
              WITH feedback_with_roles AS (
                SELECT DISTINCT
                  f.feedback_id,
                  f.session_id,
                  f.feedback_rating,
                  f.feedback_description,
                  f.timestamp AS feedback_time,
                  uel.user_role
                FROM feedback f
                INNER JOIN user_engagement_log uel
                ON f.session_id = uel.session_id
                WHERE uel.user_role IN ('admin', 'public', 'educator')
              )
              SELECT 
                user_role,
                COUNT(feedback_id) AS feedback_count,
                AVG(feedback_rating) AS average_rating,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'feedback_id', feedback_id,
                    'session_id', session_id,
                    'feedback_rating', feedback_rating,
                    'feedback_description', feedback_description,
                    'feedback_time', feedback_time
                  )
                ) AS feedback_details
              FROM feedback_with_roles
              GROUP BY user_role;
              `;

          response.body = JSON.stringify(feedbackData);
          response.statusCode = 200;
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "GET /admin/guidelines":
        try {
          // SQL query to get all guidelines
          const guidelines = await sqlConnectionTableCreator`
      SELECT 
        guideline_id, 
        criteria_name,
        header, 
        body, 
        timestamp 
      FROM guidelines 
      ORDER BY timestamp DESC;
    `;

          // Insert a record into the user engagement log
          await sqlConnectionTableCreator`
      INSERT INTO user_engagement_log (
        log_id, 
        session_id, 
        timestamp, 
        engagement_type, 
        user_info, 
        user_role
      ) VALUES (
        uuid_generate_v4(),
        NULL,
        CURRENT_TIMESTAMP,
        'guidelines retrieval',
        NULL,
        'admin'
      )
    `;

          response.body = JSON.stringify({
            guidelines: guidelines.map((guideline) => ({
              guideline_id: guideline.guideline_id,
              criteria_name: guideline.criteria_name,
              header: guideline.header,
              body: guideline.body,
              timestamp: guideline.timestamp,
            })),
          });
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "DELETE /admin/guidelines":
        try {
          // First, count the number of rows that will be deleted
          const countResult = await sqlConnectionTableCreator`
    SELECT COUNT(*) AS rows_to_delete 
    FROM guidelines
  `;
          const rowsToDelete = countResult[0].rows_to_delete;

          // Then perform the deletion
          await sqlConnectionTableCreator`
    DELETE FROM guidelines
  `;

          // Insert a record into the user engagement log
          await sqlConnectionTableCreator`
    INSERT INTO user_engagement_log (
      log_id,
      session_id,
      timestamp,
      engagement_type,
      user_info,
      user_role
    ) VALUES (
      uuid_generate_v4(),
      NULL,
      CURRENT_TIMESTAMP,
      'guidelines deletion',
      NULL,
      'admin'
    )
  `;

          response.body = JSON.stringify({
            rows_deleted: rowsToDelete,
          });
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "POST /admin/guidelines":
        if (
          event.queryStringParameters.header &&
          event.queryStringParameters.criteria_name &&
          event.body
        ) {
          const { header, criteria_name } = event.queryStringParameters;
          const { body } = JSON.parse(event.body);
          try {
            // Insert the new guideline
            const guidelineData = await sqlConnectionTableCreator`
        INSERT INTO guidelines (
          guideline_id, 
          criteria_name,
          header, 
          body, 
          timestamp
        ) VALUES (
          uuid_generate_v4(),
          ${criteria_name},
          ${header},
          ${body},
          CURRENT_TIMESTAMP
        ) RETURNING *;
      `;

            // Insert a record into the user engagement log
            await sqlConnectionTableCreator`
        INSERT INTO user_engagement_log (
          log_id, 
          session_id, 
          timestamp, 
          engagement_type, 
          user_info, 
          user_role
        ) VALUES (
          uuid_generate_v4(),
          NULL,
          CURRENT_TIMESTAMP,
          'guideline creation',
          NULL,
          'admin'
        )
      `;

            response.statusCode = 201;
            response.body = JSON.stringify({
              guideline_id: guidelineData[0]?.guideline_id,
              criteria_name: guidelineData[0]?.criteria_name,
              header: guidelineData[0]?.header,
              body: guidelineData[0]?.body,
              timestamp: guidelineData[0]?.timestamp,
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
              "Invalid value: header, criteria_name, and body are required.",
          });
        }
        break;
      case "GET /admin/csv":
          try {
              // Query to check the completion status in the chatlogs_notifications table
              const notificationStatus = await sqlConnectionTableCreator`
                  SELECT notified, session_id
                  FROM "conversation_csv"
                  LIMIT 1;
              `;

              // if exists, true or false, button should not be enabled
              if (notificationStatus.length > 0) {
                  response.statusCode = 200;
                  response.body = JSON.stringify({
                    isEnabled: false,
                    completionStatus: notificationStatus[0].completion,
                    sessionId: notificationStatus[0].session_id
                  });
              } else {
                response.statusCode = 200;
                response.body = JSON.stringify({
                  isEnabled: true,
                  completionStatus: null,
                  sessionId: null
                });
              }
          } catch (err) {
              response.statusCode = 500;
              console.error(err);
              response.body = JSON.stringify({ error: "Internal server error" });
          }
      break;
      case "PUT /admin/csv":
        try {
          // First, count the number of rows that will be updated
          const countResult = await sqlConnectionTableCreator`
              SELECT COUNT(*) AS rows_to_update 
              FROM conversation_csv
              WHERE notified = FALSE;
            `;
          const rowsToUpdate = countResult[0].rows_to_update;

          // Update all rows to set notified to true
          await sqlConnectionTableCreator`
              UPDATE conversation_csv
              SET notified = TRUE;
            `;

          // Insert a record into the user engagement log
          await sqlConnectionTableCreator`
              INSERT INTO user_engagement_log (
                log_id,
                session_id,
                timestamp,
                engagement_type,
                user_info,
                user_role
              ) VALUES (
                uuid_generate_v4(),
                NULL,
                CURRENT_TIMESTAMP,
                'conversation_csv notify update',
                NULL,
                'admin'
              )
            `;

          response.body = JSON.stringify({
            rows_updated: rowsToUpdate,
          });
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
        case "DELETE /admin/csv":
          try {
              if (
                event.queryStringParameters != null &&
                event.queryStringParameters.session_id
              ) {
                  // Delete a specific notification for a session_id
                  const { session_id } = event.queryStringParameters;
                  console.log(`Deleting notification for session_id: ${session_id}`);
      
                  const deleteResult = await sqlConnectionTableCreator`
                    DELETE FROM "conversation_csv"
                    WHERE session_id = ${session_id}
                    RETURNING *;
                  `;
      
                  if (deleteResult.length > 0) {
                      response.statusCode = 200;
                      response.body = JSON.stringify({ message: "Notification removed successfully." });
                  } else {
                      response.statusCode = 404;
                      response.body = JSON.stringify({ error: "No notification found for the given session_id." });
                  }
              } else {
                  // If no session_id provided, delete all completed notifications
                  console.log("Deleting all completed notifications from conversation_csv");
      
                  const deleteAllResult = await sqlConnectionTableCreator`
                    DELETE FROM "conversation_csv"
                    RETURNING *;
                  `;
      
                  if (deleteAllResult.length > 0) {
                      response.statusCode = 200;
                      response.body = JSON.stringify({ message: "All completed notifications removed successfully." });
                  } else {
                      response.statusCode = 404;
                      response.body = JSON.stringify({ error: "No completed notifications found." });
                  }
              }
          } catch (err) {
              response.statusCode = 500;
              console.error("Error deleting notifications:", err);
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
  console.log(response);
  return response;
};
