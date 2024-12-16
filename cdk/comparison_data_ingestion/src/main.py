import os
import json
import boto3
import psycopg2
from datetime import datetime, timezone
import logging
import requests

from helpers.vectorstore import update_vectorstore
from langchain_aws import BedrockEmbeddings


# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
REGION = os.environ["REGION"]
DSA_COMPARISON_BUCKET = os.environ["BUCKET"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

EMBEDDING_BUCKET_NAME = os.environ["EMBEDDING_BUCKET_NAME"]
APPSYNC_API_URL = os.environ["APPSYNC_API_URL"]
APPSYNC_API_ID = os.environ["APPSYNC_API_ID"]
APPSYNC_API_KEY = os.environ["APPSYNC_API_KEY"]
EMBEDDING_MODEL_PARAM = os.environ["EMBEDDING_MODEL_PARAM"]
# AWS Clients
secrets_manager_client = boto3.client("secretsmanager")
ssm_client = boto3.client("ssm")
bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION)

# Cached resources
connection = None
db_secret = None
EMBEDDING_MODEL_ID = None


def publish_event(session_id, message="Embeddings created successfully for session"):
    try:
        url = f"{APPSYNC_API_URL}"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": os.environ["APPSYNC_API_KEY"],
        }
        payload = {
            "query": """
                mutation sendNotification($message: String!, $sessionId: String!) {
                    sendNotification(message: $message, sessionId: $sessionId) {
                        message
                        sessionId
                    }
                }
            """,
            "variables": {
                "message": message,
                "sessionId": session_id,
            },
        }
        response = requests.post(url, headers=headers, json=payload)

        # Log errors if AppSync mutation fails
        if response.status_code != 200 or "errors" in response.json():
            logger.error(f"Error publishing event: {response.json()}")
            raise Exception("Failed to publish event")

        return response.json()
    except Exception as e:
        logger.error(f"Failed to send notification: {str(e)}")

def get_parameter():
    """
    Fetch a parameter value from Systems Manager Parameter Store.
    """
    global EMBEDDING_MODEL_ID
    if EMBEDDING_MODEL_ID is None:
        try:
            response = ssm_client.get_parameter(Name=EMBEDDING_MODEL_PARAM, WithDecryption=True)
            EMBEDDING_MODEL_ID = response["Parameter"]["Value"]
        except Exception as e:
            logger.error(f"Error fetching parameter {EMBEDDING_MODEL_PARAM}: {e}")
            raise
    return EMBEDDING_MODEL_ID



def get_secret():
    global db_secret
    if db_secret is None:
        try:
            response = secrets_manager_client.get_secret_value(SecretId=DB_SECRET_NAME)["SecretString"]
            db_secret = json.loads(response)
        except Exception as e:
            logger.error(f"Error fetching secret {DB_SECRET_NAME}: {e}")
            raise
    return db_secret

def update_vectorstore_from_s3(bucket, session_id):
    # bucket = "DSA-data-ingestion-bucket"
    
    embeddings = BedrockEmbeddings(
        model_id=get_parameter(), 
        client=bedrock_runtime,
        region_name=REGION
    )
    
    db_secret = get_secret()

    vectorstore_config_dict = {
        'collection_name': session_id,
        'dbname': db_secret["dbname"],
        'user': db_secret["username"],
        'password': db_secret["password"],
        'host': RDS_PROXY_ENDPOINT,
        'port': db_secret["port"]
    }

    try:
        update_vectorstore(
            bucket=bucket,
            category_id=session_id,
            vectorstore_config_dict=vectorstore_config_dict,
            embeddings=embeddings
        )
        publish_event(session_id)
    except Exception as e:
        logger.error(f"Error updating vectorstore for session {session_id}: {e}")
        raise

def handler(event, context):
    records = event.get('Records', [])
    if not records:
        return {
            "statusCode": 400,
            "body": json.dumps("No valid S3 event found.")
        }
        
    bucket_name = DSA_COMPARISON_BUCKET

    for record in records:
        # Extract the message body from the SQS event
        message_body = json.loads(record['body'])
        session_id = message_body.get('sessionId')
        filename = message_body.get('fileName')
        file_type = message_body.get('fileExtension')

        if not session_id or not filename or not file_type:
            logger.error("Missing required parameters in the message.")
            continue

        # Assuming the file path is of the format: {session_id}/{filename}
        document_key = f"{session_id}/{filename}.{file_type}"
        
        try:
                update_vectorstore_from_s3(bucket_name, session_id)
                logger.info(f"Vectorstore updated successfully for course {session_id}.")
        except Exception as e:
                logger.error(f"Error updating vectorstore for course {session_id}: {e}")
                return {
                    "statusCode": 500,
                    "body": json.dumps(f"Document inserted, but error updating vectorstore: {e}")
                }
        # If update_vectorstore_from_s3() was executed successfully, the following code snippet removes this document from the s3 bucket
        s3_client = boto3.client('s3')
        try:
            s3_client.delete_object(Bucket=bucket_name, Key=document_key)
            logger.info(f"Successfully deleted {document_key} from {bucket_name} after vectorstore update.")
        except Exception as e:
            logger.error(f"Error deleting {document_key} from {bucket_name}: {e}")

        return {
                "statusCode": 200,
                "body": json.dumps({
                    "message": "New file inserted into database. Vectorstore updated and document deleted from S3 successfully.",
                    "location": f"s3://{bucket_name}/{document_key}"
                })
            }

    return {
        "statusCode": 400,
        "body": json.dumps("No new document upload or deletion event found.")
    }
