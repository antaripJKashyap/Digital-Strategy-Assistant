import os
import json
import boto3
import re
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

def extract_content_and_questions(content):
    """
    Extracts main content and options (questions) from a content string.
    """
    match = re.search(r"(.*)You might have the following questions:(.*)", content, re.DOTALL)
    
    if match:
        main_content = match.group(1).strip()  # Content before the questions section
        questions_text = match.group(2).strip()  # Text containing the questions
    else:
        main_content = content.strip()  # If no questions section, return full content
        questions_text = ""
    
    # Remove all newline characters
    questions_text = questions_text.replace('\n', '')
    
    # Split the questions based on question marks followed by optional whitespace and the end of a question
    questions = re.split(r'\?\s*(?=\S|$)', questions_text)
    
    # Clean up each question, add question marks back, and filter out any empty strings
    questions = [question.strip() + '?' for question in questions if question.strip()]
    
    return main_content, questions

def clean_human_content(content):
    """
    Removes unwanted prefixes like 'user\n' from human message content.
    """
    # Check for 'user' at the start of the content and remove it if present
    lines = content.splitlines()
    # Filter out any line that just says "user" or any similar prefix
    cleaned_lines = [line.strip() for line in lines if line.strip().lower() != "user"]
    return " ".join(cleaned_lines).strip()

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
                message_type = entry.get("type", "unknown")
                content_data = entry.get("data", {}).get("content", "")
                
                # Clean content for human messages to remove unwanted prefixes
                if message_type == "human":
                    content_data = clean_human_content(content_data)
                
                # Use the extract_content_and_questions function to split content and questions
                main_content, questions = extract_content_and_questions(content_data)
                
                # Format each message with Type, Content, and Options
                formatted_message = {
                    "Type": message_type,
                    "Content": main_content,
                    "Options": questions
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
