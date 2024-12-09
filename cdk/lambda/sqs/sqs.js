const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

// Initialize SQS client
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

exports.handler = async (event, context) => {
  try {
    // Iterate through S3 event records
    for (const record of event.Records) {
      // Extract full S3 object key and decode it
      const fullKey = decodeURIComponent(
        record.s3.object.key.replace(/\+/g, " ")
      );

      // Extract file name and extension manually
      const lastSlashIndex = fullKey.lastIndexOf("/");
      const fileName =
        lastSlashIndex !== -1 ? fullKey.slice(lastSlashIndex + 1) : fullKey;
      const lastDotIndex = fileName.lastIndexOf(".");
      const fileExtension =
        lastDotIndex !== -1 ? fileName.slice(lastDotIndex + 1) : "";
      const baseFileName =
        lastDotIndex !== -1 ? fileName.slice(0, lastDotIndex) : fileName;

      // Extract session ID (first folder in the path)
      const pathParts = fullKey.split("/");
      const sessionId = pathParts.length > 1 ? pathParts[0] : "unknown";

      // Prepare message for SQS
      const message = {
        filePath: fullKey,
        fileName: fileName,
        fileExtension: fileExtension,
        sessionId: sessionId,
      };

      // Prepare SQS send message command
      const params = {
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify(message),
        MessageGroupId: sessionId, // Use session ID as group ID
        MessageDeduplicationId: fullKey, // Use full path as deduplication ID
      };

      console.log(message);

      // Send message to SQS
      const command = new SendMessageCommand(params);
      const response = await sqsClient.send(command);

      console.log(`Message sent to SQS for ${fullKey}:`, response);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Successfully processed S3 events" }),
    };
  } catch (error) {
    console.error("Error processing S3 event:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error processing S3 event",
        error: error.message,
      }),
    };
  }
};
