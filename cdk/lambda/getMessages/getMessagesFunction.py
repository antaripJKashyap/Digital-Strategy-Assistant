# import os
# import json
# import boto3
# from aws_lambda_powertools import Logger
# from boto3.dynamodb.conditions import Key

# # Set up logging
# # logging.basicConfig(level=logging.INFO)
# logger = Logger()

# # Fetch the DynamoDB table name from environment variables

# TABLE_NAME = os.environ.get("TABLE_NAME")
# dynamodb = boto3.resource("dynamodb")
# table = dynamodb.Table(TABLE_NAME)

# def get_messages(session_id):
    
    
#     try:
#         logger.info(f"Fetching messages for session {session_id}")
#         # Query DynamoDB for all messages with the given session_id
#         response = table.query(
#             KeyConditionExpression=Key("SessionId").eq(session_id),
#             ProjectionExpression="History"
#         )
        
#         if 'Items' not in response or not response['Items']:
#             logger.warning(f"No messages found for session {session_id}")
#             return {
#                 "statusCode": 404,
#                 "headers": {
#                     "Content-Type": "application/json",
#                     "Access-Control-Allow-Headers": "*",
#                     "Access-Control-Allow-Origin": "*",
#                     "Access-Control-Allow-Methods": "*",
#                 },
#                 "body": json.dumps({"error": "No messages found for the provided session_id"})
#             }
        
#         # Extract and differentiate messages
#         messages = []
#         for item in response['Items']:
#             history = item.get("History", [])
#             for entry in history:
#                 message_data = entry.get("M", {})
#                 content = message_data.get("data", {}).get("M", {}).get("content", {}).get("S", "")
#                 message_type = message_data.get("type", {}).get("S", "")
                
#                 # Append message with type for easier differentiation
#                 messages.append({
#                     "type": message_type,
#                     "content": content

#                 })
#         logger.info(f"Messages fetched successfully for session {session_id}")
        
#         return {
#             "statusCode": 200,
#             "headers": {
#                 "Content-Type": "application/json",
#                 "Access-Control-Allow-Headers": "*",
#                 "Access-Control-Allow-Origin": "*",
#                 "Access-Control-Allow-Methods": "*",
#             },
#             "body": json.dumps({"messages": messages})
#         }
        
#     except Exception as e:
#         logger.error(f"Error retrieving messages for session_id {session_id}: {e}")
#         return {
#             "statusCode": 500,
#             "headers": {
#                 "Content-Type": "application/json",
#                 "Access-Control-Allow-Headers": "*",
#                 "Access-Control-Allow-Origin": "*",
#                 "Access-Control-Allow-Methods": "*",
#             },
#             "body": json.dumps("Error retrieving messages")
#         }

# def lambda_handler(event, context):
#     # Extract the session_id from query parameters
#     query_params = event.get("queryStringParameters", {})
#     session_id = query_params.get("session_id", "")
    
#     if not session_id:
#         logger.error("Missing required parameter: session_id")
#         return {
#             "statusCode": 400,
#             "headers": {
#                 "Content-Type": "application/json",
#                 "Access-Control-Allow-Headers": "*",
#                 "Access-Control-Allow-Origin": "*",
#                 "Access-Control-Allow-Methods": "*",
#             },
#             "body": json.dumps("Missing required parameter: session_id")
#         }
    
#     return get_messages(session_id)



import os
import json
import boto3
from aws_lambda_powertools import Logger
from boto3.dynamodb.conditions import Key

# Set up logging
logger = Logger()

# Fetch the DynamoDB table name from environment variables
TABLE_NAME = os.environ.get("TABLE_NAME")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

def get_messages(session_id):
    try:
        logger.info(f"Fetching messages for session {session_id}")
        
        # Query DynamoDB for all messages with the given session_id
        response = table.query(
            KeyConditionExpression=Key("SessionId").eq(session_id),
            ProjectionExpression="History"
        )
        
        if 'Items' not in response or not response['Items']:
            logger.warning(f"No messages found for session {session_id}")
            return {
                "statusCode": 404,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                "body": json.dumps({"error": "No messages found for the provided session_id"})
            }
        
        # Extract and differentiate messages
        messages = []
        for item in response['Items']:
            # Ensure History is a list
            history_list = item.get("History", {}).get("L", [])
            if not isinstance(history_list, list):
                logger.error("History field is not a list.")
                continue
            
            for entry in history_list:
                # Ensure each entry in history_list is a dictionary with 'M' key
                message_data = entry.get("M", {}).get("data", {}).get("M", {})
                
                # Extract content and type safely
                content = message_data.get("content", {}).get("S", "")
                message_type = message_data.get("type", {}).get("S", "")

                # Append message with type for easier differentiation
                if content and message_type:
                    messages.append({
                        "type": message_type,
                        "content": content
                    })
        
        logger.info(f"Messages fetched successfully for session {session_id}")
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({"messages": messages})
        }
        
    except Exception as e:
        logger.error(f"Error retrieving messages for session_id {session_id}: {e}")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps("Error retrieving messages")
        }

def lambda_handler(event, context):
    # Extract the session_id from query parameters
    query_params = event.get("queryStringParameters", {})
    session_id = query_params.get("session_id", "")
    
    if not session_id:
        logger.error("Missing required parameter: session_id")
        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps("Missing required parameter: session_id")
        }
    
    return get_messages(session_id)

