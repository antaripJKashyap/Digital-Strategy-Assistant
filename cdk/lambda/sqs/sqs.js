const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

// Initialize SQS client
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

exports.handler = async (event, context) => {
  try {
    for (const record of event.Records) {
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

      const pathParts = fullKey.split("/");
      const sessionId = pathParts.length > 1 ? pathParts[0] : "unknown";

      const message = {
        filePath: fullKey,
        fileName: fileName,
        fileExtension: fileExtension,
        sessionId: sessionId,
      };

      const params = {
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify(message),
        MessageGroupId: sessionId, 
        MessageDeduplicationId: `${fullKey}-${Date.now()}-${Math.random().toString(36).substring(2,7)}`, 
      };

      

      // Send message to SQS
      const command = new SendMessageCommand(params);
      const response = await sqsClient.send(command);

      
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
