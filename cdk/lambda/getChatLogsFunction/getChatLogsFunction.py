import os
import json
import boto3
from botocore.config import Config
from aws_lambda_powertools import Logger

logger = Logger()

# Environment variables
REGION = os.environ["REGION"]
BUCKET = os.environ["BUCKET"]

# AWS Clients
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=Config(s3={"addressing_style": "virtual"}, region_name=REGION, signature_version="s3v4"),
)

def list_files_in_s3_prefix(bucket, prefix):
    files = []
    continuation_token = None

    # Fetch all objects in the directory, handling pagination
    while True:
        if continuation_token:
            result = s3.list_objects_v2(
                Bucket=bucket,
                Prefix=prefix,
                ContinuationToken=continuation_token
            )
        else:
            result = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)

        if "Contents" in result:
            for obj in result["Contents"]:
                files.append(obj["Key"].replace(prefix, ""))

        # Check if there's more data to fetch
        if result.get("IsTruncated"):
            continuation_token = result.get("NextContinuationToken")
        else:
            break

    # **Sort files in reverse order (most recent first)**
    files.sort(reverse=True)

    return files

def generate_presigned_url(bucket, key):
    try:
        return s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=300,
            HttpMethod="GET",
        )
    except Exception as e:
        logger.exception(f"Error generating presigned URL for {key}: {e}")
        return None

def lambda_handler(event, context):
    query_params = event.get("queryStringParameters", {})

    session_id = query_params.get("session_id", "")
    print(f"session_id: {session_id}")

    if not session_id:
        logger.error("Missing required parameters", extra={"course_id": session_id})
        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps("Missing required parameters: course_id or instructor_email"),
        }
    
    try:
        log_prefix = f"{session_id}/"

        log_files = list_files_in_s3_prefix(BUCKET, log_prefix)

        # Generate presigned URLs for logs
        log_files_urls = {file_name: generate_presigned_url(BUCKET, f"{log_prefix}{file_name}") for file_name in log_files}

        logger.info("Presigned URLs generated successfully", extra={"log_files": log_files_urls})

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({"log_files": log_files_urls}),
        }
    
    except Exception as e:
        logger.exception(f"Error generating presigned URLs for chat logs: {e}")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps("Internal server error"),
        }