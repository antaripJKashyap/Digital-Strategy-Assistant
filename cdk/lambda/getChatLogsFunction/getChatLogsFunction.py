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

def list_all_files_in_s3(bucket):
    files = []
    continuation_token = None

    while True:
        params = {"Bucket": bucket}
        if continuation_token:
            params["ContinuationToken"] = continuation_token

        result = s3.list_objects_v2(**params)

        if "Contents" in result:
            for obj in result["Contents"]:
                files.append(obj["Key"])

        if result.get("IsTruncated"):
            continuation_token = result.get("NextContinuationToken")
        else:
            break

    files.sort(reverse=True)  # Sort files in reverse order (most recent first)
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
    try:
        log_files = list_all_files_in_s3(BUCKET)

        # Generate presigned URLs for all files
        log_files_urls = {file_name: generate_presigned_url(BUCKET, file_name) for file_name in log_files}

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
