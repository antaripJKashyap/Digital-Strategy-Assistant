const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

// Initialize SQS Client
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    // Parse the incoming event body
    const { session_id, user_role, message_content } = JSON.parse(event.body);

    // Validate required fields
    if (!session_id || !user_role || !message_content) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: session_id, user_role, or message_content",
        }),
      };
    }

    // Prepare parameters for SQS message
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL, // The SQS queue URL from environment variables
      MessageBody: JSON.stringify({
        session_id,
        user_role,
        message_content,
      }),
      MessageGroupId: session_id, // FIFO requires a group ID for ordering
      MessageDeduplicationId: `${session_id}-${Date.now()}`, // Ensure unique deduplication
    };

    // Send the message to SQS
    const command = new SendMessageCommand(params);
    await sqsClient.send(command);

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Message submitted successfully to SQS" }),
    };
  } catch (error) {
    console.error("Error submitting message to SQS:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};