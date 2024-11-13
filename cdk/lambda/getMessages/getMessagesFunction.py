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

##########################

# import os
# import json
# import boto3
# from aws_lambda_powertools import Logger
# from boto3.dynamodb.conditions import Key

# # Set up logging
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
#             # Ensure History is a list
#             history_list = item.get("History", {}).get("L", [])
#             if not isinstance(history_list, list):
#                 logger.error("History field is not a list.")
#                 continue
            
#             for entry in history_list:
#                 # Ensure each entry in history_list is a dictionary with 'M' key
#                 message_data = entry.get("M", {}).get("data", {}).get("M", {})
                
#                 # Extract content and type safely
#                 content = message_data.get("content", {}).get("S", "")
#                 message_type = message_data.get("type", {}).get("S", "")

#                 # Append message with type for easier differentiation
#                 if content and message_type:
#                     messages.append({
#                         "type": message_type,
#                         "content": content
#                     })
        
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

#####################################showing table names

# import os
# import json
# import boto3
# from aws_lambda_powertools import Logger
# from boto3.dynamodb.conditions import Key

# # Set up logging
# logger = Logger()

# # Fetch the DynamoDB table name from environment variables
# TABLE_NAME = os.environ.get("TABLE_NAME")
# dynamodb = boto3.resource("dynamodb")
# table = dynamodb.Table(TABLE_NAME)

# # Additional DynamoDB client for listing tables
# dynamodb_client = boto3.client("dynamodb")

# def list_dynamodb_tables():
#     """List all DynamoDB tables in the account and return their names."""
#     paginator = dynamodb_client.get_paginator("list_tables")
#     page_iterator = paginator.paginate(Limit=10)
    
#     table_names = []
#     for page in page_iterator:
#         table_names.extend(page.get("TableNames", []))
    
#     if not table_names:
#         logger.info("No DynamoDB tables found in your account.")
#     else:
#         logger.info(f"Here are the DynamoDB tables in your account: {table_names}")
    
#     return table_names

# def get_messages(session_id):
#     # Step 1: Check if the table exists by listing all tables
#     if TABLE_NAME not in list_dynamodb_tables():
#         return {
#             "statusCode": 404,
#             "headers": {
#                 "Content-Type": "application/json",
#                 "Access-Control-Allow-Headers": "*",
#                 "Access-Control-Allow-Origin": "*",
#                 "Access-Control-Allow-Methods": "*",
#             },
#             "body": json.dumps({"error": f"Table {TABLE_NAME} not found"})
#         }
    
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
#             history_list = item.get("History", {}).get("L", [])
#             if not isinstance(history_list, list):
#                 logger.error("History field is not a list.")
#                 continue
            
#             for entry in history_list:
#                 message_data = entry.get("M", {}).get("data", {}).get("M", {})
#                 content = message_data.get("content", {}).get("S", "")
#                 message_type = message_data.get("type", {}).get("S", "")

#                 if content and message_type:
#                     messages.append({
#                         "type": message_type,
#                         "content": content
#                     })
        
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
#     # For debugging: directly return the list of DynamoDB tables
#     table_names = list_dynamodb_tables()
#     return {
#         "statusCode": 200,
#         "headers": {
#             "Content-Type": "application/json",
#             "Access-Control-Allow-Headers": "*",
#             "Access-Control-Allow-Origin": "*",
#             "Access-Control-Allow-Methods": "*",
#         },
#         "body": json.dumps({"tables": table_names})
#     }

#########################display content
# import os
# import json
# import boto3
# from aws_lambda_powertools import Logger
# from boto3.dynamodb.conditions import Key

# # Set up logging
# logger = Logger()

# # Fetch the DynamoDB table name from environment variables
# TABLE_NAME = os.environ.get("TABLE_NAME")
# dynamodb = boto3.resource("dynamodb")
# table = dynamodb.Table(TABLE_NAME)

# # Additional DynamoDB client for listing tables
# dynamodb_client = boto3.client("dynamodb")

# def list_dynamodb_tables():
#     """List all DynamoDB tables in the account and return their names."""
#     paginator = dynamodb_client.get_paginator("list_tables")
#     page_iterator = paginator.paginate(Limit=10)
    
#     table_names = []
#     for page in page_iterator:
#         table_names.extend(page.get("TableNames", []))
    
#     if not table_names:
#         logger.info("No DynamoDB tables found in your account.")
#     else:
#         logger.info(f"Here are the DynamoDB tables in your account: {table_names}")
    
#     return table_names

# def get_messages(session_id):
#     # Check if the table exists by listing all tables
#     if TABLE_NAME not in list_dynamodb_tables():
#         return {
#             "statusCode": 404,
#             "headers": {
#                 "Content-Type": "application/json",
#                 "Access-Control-Allow-Headers": "*",
#                 "Access-Control-Allow-Origin": "*",
#                 "Access-Control-Allow-Methods": "*",
#             },
#             "body": json.dumps({"error": f"Table {TABLE_NAME} not found"})
#         }
    
#     try:
#         logger.info(f"Fetching messages for session {session_id}")
        
#         # Query DynamoDB for all messages with the given session_id
#         response = table.query(
#             KeyConditionExpression=Key("SessionId").eq(session_id)
#         )
        
#         # Check if items were returned
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
        
#         # Extract messages from the items
#         messages = response['Items']
        
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

#########################################parse text


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

# Additional DynamoDB client for listing tables
dynamodb_client = boto3.client("dynamodb")

def list_dynamodb_tables():
    """List all DynamoDB tables in the account and return their names."""
    paginator = dynamodb_client.get_paginator("list_tables")
    page_iterator = paginator.paginate(Limit=10)
    
    table_names = []
    for page in page_iterator:
        table_names.extend(page.get("TableNames", []))
    
    if not table_names:
        logger.info("No DynamoDB tables found in your account.")
    else:
        logger.info(f"Here are the DynamoDB tables in your account: {table_names}")
    
    return table_names

def get_messages(session_id):
    # Check if the table exists by listing all tables
    if TABLE_NAME not in list_dynamodb_tables():
        return {
            "statusCode": 404,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({"error": f"Table {TABLE_NAME} not found"})
        }
    
    try:
        logger.info(f"Fetching messages for session {session_id}")
        
        # Query DynamoDB for all messages with the given session_id
        response = table.query(
            KeyConditionExpression=Key("SessionId").eq(session_id)
        )
        
        # Check if items were returned
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
        
        # Parse the messages to match the required output format
        formatted_messages = []
        for item in response['Items']:
            history = item.get("History", [])
            for entry in history:
                # Extract 'type' and 'content' from each message
                message_type = entry.get("type", "unknown")
                content_data = entry.get("data", {}).get("content", {})
                
                formatted_message = {
                    "Type": message_type,
                    "Content": content_data
                }
                formatted_messages.append(formatted_message)
        
        logger.info(f"Messages fetched and formatted successfully for session {session_id}")
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({"messages": formatted_messages}, indent=4)
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

#######################parse text without label

