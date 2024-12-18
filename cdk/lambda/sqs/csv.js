const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

// Initialize SQS client
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

exports.handler = async (event, context) => {
  try {
    const currentTimestamp = new Date().toISOString();

    const message = {
      timestamp: currentTimestamp,
      source: 'rest_api'
    };
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(message),
      MessageGroupId: 'csv-api-messages',
      MessageDeduplicationId: currentTimestamp 
    };

    console.log('Sending message:', message);

    // Send message to SQS
    const command = new SendMessageCommand(params);
    const response = await sqsClient.send(command);

    console.log('Message sent to SQS:', response);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Successfully sent timestamp to SQS',
        timestamp: currentTimestamp 
      }),
    };
  } catch (error) {
    console.error('Error sending message to SQS:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error sending message to SQS',
        error: error.message,
      }),
    };
  }
};