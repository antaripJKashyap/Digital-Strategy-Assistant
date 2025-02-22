import os
import csv
import json
import boto3
import logging
import re
import psycopg2
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key


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


def fetch_all_user_messages():
    """ Fetch user messages along with timestamps and user roles for all sessions. """
    query = """
        SELECT session_id, engagement_details AS user_message, timestamp, user_role
        FROM user_engagement_log
        WHERE engagement_type = 'message creation'
        ORDER BY session_id, timestamp ASC;
    """
    connection = connect_to_db()
    try:
        cur = connection.cursor()
        print("Fetching user messages with timestamps and roles for all sessions...")
        cur.execute(query)
        rows = cur.fetchall()
        cur.close()

        structured_messages = {}
        for session_id, message, timestamp, user_role in rows:
            message = message.strip()
            
            if session_id not in structured_messages:
                structured_messages[session_id] = {}

            structured_messages[session_id][message] = {
                "Timestamp": timestamp,
                "UserRole": user_role  # Directly use user_role without mapping
            }
        
        print(f" Successfully fetched timestamps and user roles for {len(structured_messages)} sessions.")
        return structured_messages

    except Exception as e:
        print(f" Database error while fetching user messages: {e}")
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

        response = table.query(KeyConditionExpression=Key("SessionId").eq(session_id))

        formatted_messages = []
        
        for item in response["Items"]:
            history = item.get("History", [])
            
            for entry in history:
                message_type = entry.get("type", "unknown")  # 'human' or 'ai'
                content = entry.get("data", {}).get("content", "").strip()
                
                if not content:
                    continue  # Skip empty messages

                if message_type == "human":
                    content = clean_human_content(content)
                
                main_content, questions = extract_content_and_questions(content)

                formatted_message = {
                    "SessionId": session_id,
                    "MessageType": "ai" if message_type == "ai" else "user",
                    "Message": main_content,
                    "Options": questions,
                    "Timestamp": None,  # Will be updated later
                    "UserRole": ""  # Placeholder, will be updated later
                }

                formatted_messages.append(formatted_message)

        return formatted_messages

    except Exception as e:
        logger.error(f"Error processing messages: {e}")
        return []

    
def write_to_csv(data, file_path="/tmp/chat_history.csv"):
    header = ["SessionId", "UserRole", "MessageType", "Message", "Timestamp"]
    try:
        print("Writing data to CSV...")
        with open(file_path, "w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow(header)
            for row in data:
                writer.writerow([
                    row["SessionId"],
                    row["UserRole"],  # "public", "educator", "admin"
                    row["MessageType"],  # "ai" or "user"
                    row["Message"],
                    row["Timestamp"].strftime("%Y-%m-%d %H:%M:%S") if row["Timestamp"] else "",
                ])
        
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
        current_session_id = query_params.get("session_id", "")
        print("🔍 Fetching all user message timestamps and roles...")
        user_timestamps = fetch_all_user_messages()
        
        print("🔍 Fetching all session IDs...")
        session_ids = fetch_all_session_ids()

        chat_data = []
        for session_id in session_ids:
            chat_messages = fetch_chat_messages(session_id, table)

            session_timestamps = user_timestamps.get(session_id, {})

            for message in chat_messages:
                if message["MessageType"] == "user":
                    user_data = session_timestamps.get(message["Message"], {})
                    message["Timestamp"] = user_data.get("Timestamp", None)
                    message["UserRole"] = user_data.get("UserRole", "")
                else:
                    message["Timestamp"] = None  # AI messages don’t get timestamps

                chat_data.append(message)

        print("Merging complete. Writing data to CSV...")
        csv_path = write_to_csv(chat_data)

        if csv_path:
            print("Uploading CSV to S3...")
            
            upload_to_s3(csv_path, S3_BUCKET, f"{current_session_id}/chat_history.csv")
            print("CSV successfully uploaded!")

            return {
                "statusCode": 200,
                "body": json.dumps({
                    "message": "CSV uploaded successfully",
                    "s3_path": f"s3://{S3_BUCKET}/{current_session_id}/chat_history.csv"
                })
            }

        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to generate CSV"})
        }

    except Exception as e:
        print(f"Lambda Error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal Server Error"})
        }
