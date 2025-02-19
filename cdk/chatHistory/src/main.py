import os
import csv
import json
import boto3
import logging
import re
import psycopg2
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key

# AWS Configuration
S3_BUCKET = os.environ.get("CHATLOGS_BUCKET")
DB_SECRET_NAME = os.environ.get("SM_DB_CREDENTIALS")
RDS_PROXY_ENDPOINT = os.environ.get("RDS_PROXY_ENDPOINT")
TABLE_NAME = os.environ.get("TABLE_NAME")

if not TABLE_NAME:
    raise ValueError("TABLE_NAME environment variable is required but not set.")

# Initialize AWS Clients
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
s3_client = boto3.client("s3")
secrets_manager_client = boto3.client("secretsmanager")

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

db_secret = None
connection = None

def get_secret(secret_name):
    global db_secret
    if db_secret is None:
        try:
            print(f"Fetching secret: {secret_name}")
            response = secrets_manager_client.get_secret_value(SecretId=secret_name)
            db_secret = json.loads(response["SecretString"])
        except Exception as e:
            print(f"Error fetching secret: {e}")
            raise
    return db_secret


def connect_to_db():
    global connection
    if connection is None or connection.closed:
        try:
            secret = get_secret(DB_SECRET_NAME)
            print("Connecting to database...")
            connection = psycopg2.connect(
                dbname=secret["dbname"],
                user=secret["username"],
                password=secret["password"],
                host=RDS_PROXY_ENDPOINT,
                port=secret["port"],
            )
        except Exception as e:
            print(f"Failed to connect to database: {e}")
            if connection:
                connection.rollback()
                connection.close()
            raise
    return connection


def fetch_all_session_ids():
    query = "SELECT DISTINCT session_id FROM user_engagement_log WHERE session_id IS NOT NULL;"
    connection = connect_to_db()
    try:
        cur = connection.cursor()
        print("Fetching session IDs from database...")
        cur.execute(query)
        session_ids = [row[0] for row in cur.fetchall()]
        cur.close()
        print(f"Fetched {len(session_ids)} session IDs.")
        return session_ids
    except Exception as e:
        print(f"Database error: {e}")
        return []


def fetch_user_message_timestamps(session_id):
    query = """
        SELECT timestamp, engagement_details
        FROM user_engagement_log
        WHERE session_id = %s
        AND engagement_type = 'message creation'
        ORDER BY timestamp ASC;
    """
    connection = connect_to_db()
    try:
        cur = connection.cursor()
        print(f"Fetching timestamps for session {session_id} from user_engagement_log...")
        cur.execute(query, (session_id,))
        user_timestamps = cur.fetchall()
        cur.close()

        # Debugging: Print retrieved timestamps
        timestamp_dict = {msg[1].strip(): msg[0] for msg in user_timestamps}
        print(f"Fetched timestamps from UEL for session {session_id}: {timestamp_dict}")

        return timestamp_dict
    except Exception as e:
        print(f"Database error while fetching timestamps for session {session_id}: {e}")
        return {}


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

def safe_parse_timestamp(timestamp):
    """Convert string timestamp to datetime safely."""

    if isinstance(timestamp, datetime):
        return timestamp  # Already a datetime object

    if not timestamp:  # Handle None, empty strings, or missing timestamps
        return None

    if isinstance(timestamp, int):  # If timestamp is an epoch int, convert it
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)  # Use timezone-aware UTC

    if not isinstance(timestamp, str):
        return None  # Ignore non-string, non-integer values

    try:
        return datetime.fromisoformat(timestamp)  # Try ISO format
    except ValueError:
        try:
            return datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")  # Fallback format
        except ValueError:
            return None  # If it still fails, return None

def fetch_chat_messages(session_id, table):
    """Fetch user & AI messages from DynamoDB for a given session_id."""

    try:
        logger.info(f"Fetching messages for session {session_id}")

        # Query DynamoDB
        response = table.query(KeyConditionExpression=Key("SessionId").eq(session_id))

        # Log raw response for debugging
        logger.info(f"Raw DynamoDB response for session {session_id}: {json.dumps(response, indent=2)}")

        # if 'Items' not in response or not response['Items']:
        #     logger.warning(f"No messages found for session {session_id}")
        #     return []

        formatted_messages = []
        
        for item in response["Items"]:
            history = item.get("History", [])
            
            for entry in history:
                message_type = entry.get("type", "unknown")
                content = entry.get("data", {}).get("content", "")
                
                if not content:
                    continue  # Skip empty messages

                # Remove unwanted prefixes from human messages
                if message_type == "human":
                    content = clean_human_content(content)
                
                # Extract AI responses & possible questions
                main_content, questions = extract_content_and_questions(content)

                formatted_message = {
                    "SessionId": session_id,
                    "UserRole": "ai" if message_type == "ai" else "user",
                    "Message": main_content,
                    "Options": questions,
                    "Timestamp": None,  # We'll merge timestamps later
                }

                formatted_messages.append(formatted_message)

        logger.info(f"Parsed messages (before timestamp merge) for session {session_id}: {json.dumps(formatted_messages, indent=2)}")
        return formatted_messages

    except Exception as e:
        logger.error(f"Error processing messages: {e}")
        return []
    
def merge_chats(session_ids, table):
    all_messages = []
    for session_id in session_ids:
        all_messages.extend(fetch_chat_messages(session_id, table))
    # all_messages.sort(key=lambda x: x["Timestamp"])
    return all_messages


def write_to_csv(data, file_path="/tmp/chat_history.csv"):
    header = ["SessionId", "UserRole", "Message", "Timestamp"]
    try:
        print("Writing data to CSV...")
        with open(file_path, "w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow(header)
            for row in data:
                writer.writerow([row["SessionId"], row["UserRole"], row["Message"], row["Timestamp"]])
        print(f"CSV file saved at {file_path}")
        return file_path
    except Exception as e:
        print(f"Error writing to CSV: {e}")
        return None


def upload_to_s3(file_path, bucket_name, s3_file_path):
    try:
        print(f"Uploading {file_path} to S3 bucket {bucket_name}...")
        s3_client.upload_file(file_path, bucket_name, s3_file_path)
        print(f"File uploaded successfully: s3://{bucket_name}/{s3_file_path}")
    except Exception as e:
        print(f"S3 Upload Error: {e}")


def handler(event, context):
    try:
        query_params = event.get("queryStringParameters", {})
        request_session_id = query_params.get("session_id", "").strip()
        
        if not request_session_id:
            print("Missing required parameter: session_id")
            return {"statusCode": 400, "body": json.dumps({"error": "Missing session_id"})}
        
        session_ids = fetch_all_session_ids()
        chat_data = merge_chats(session_ids, table)
        print("chat data", chat_data)
        csv_path = write_to_csv(chat_data)
        if csv_path:
            upload_to_s3(csv_path, S3_BUCKET, "chat_history.csv")
            return {"statusCode": 200, "body": json.dumps({"message": "CSV uploaded successfully", "s3_path": f"s3://{S3_BUCKET}/chat_history.csv"})}
        
        return {"statusCode": 500, "body": json.dumps({"error": "Failed to generate CSV"})}
    except Exception as e:
        print(f"Lambda Error: {e}")
        return {"statusCode": 500, "body": json.dumps({"error": "Internal Server Error"})}
