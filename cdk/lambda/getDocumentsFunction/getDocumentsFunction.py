import os
import json
import boto3
from botocore.config import Config
import psycopg2
from aws_lambda_powertools import Logger

logger = Logger()

REGION = os.environ["REGION"]
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=Config(
        s3={"addressing_style": "virtual"}, region_name=REGION, signature_version="s3v4"
    ),
)

BUCKET = os.environ["BUCKET"]
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

def get_secret():
    # secretsmanager client to get db credentials
    sm_client = boto3.client("secretsmanager")
    response = sm_client.get_secret_value(SecretId=DB_SECRET_NAME)["SecretString"]
    secret = json.loads(response)
    return secret

def connect_to_db():
    try:
        db_secret = get_secret()
        connection_params = {
            'dbname': db_secret["dbname"],
            'user': db_secret["username"],
            'password': db_secret["password"],
            'host': RDS_PROXY_ENDPOINT,
            'port': db_secret["port"]
        }
        connection_string = " ".join([f"{key}={value}" for key, value in connection_params.items()])
        connection = psycopg2.connect(connection_string)
        logger.info("Connected to the database!")
        return connection
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        if connection:
            connection.rollback()
            connection.close()
        return None

def list_documents_in_s3_prefix(bucket, prefix):
    documents = []
    continuation_token = None

    # Fetch all objects in the module directory, handling pagination
    while True:
        if continuation_token:
            result = s3.list_objects_v2(
                Bucket=bucket, 
                Prefix=prefix, 
                ContinuationToken=continuation_token
            )
        else:
            result = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)

        if 'Contents' in result:
            for obj in result['Contents']:
                documents.append(obj['Key'].replace(prefix, ''))

        # Check if there's more data to fetch
        if result.get('IsTruncated'):
            continuation_token = result.get('NextContinuationToken')
        else:
            break

    return documents

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

def get_document_metadata_from_db(category_id, document_name, document_type):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return None

    try:
        cur = connection.cursor()

        query = """
            SELECT metadata 
            FROM "documents" 
            WHERE category_id = %s AND document_name = %s AND document_type = %s;
        """
        cur.execute(query, (category_id, document_name, document_type))
        result = cur.fetchone()
        cur.close()
        connection.close()

        if result:
            return result[0]
        else:
            logger.warning(f"No metadata found for {document_name}.{document_type}.")
            return None

    except Exception as e:
        logger.error(f"Error retrieving metadata for {document_name}.{document_type}: {e}")
        if cur:
            cur.close()
        if connection:
            connection.rollback()
            connection.close()
        return None

@logger.inject_lambda_context
def lambda_handler(event, context):
    query_params = event.get("queryStringParameters", {})

    category_id = query_params.get("category_id", "")
    if not category_id:
        logger.error("Missing required parameters", extra={
            "course_id": category_id,
            "module_id": category_id,
        })
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameters: category_id')
        }

    try:
        document_prefix = f"{category_id}/"

        document_list = list_documents_in_s3_prefix(BUCKET,document_prefix)

        # Retrieve metadata and generate presigned URLs for documents
        document_list_urls = {}

        for document_name in document_list:
            document_type = document_name.split('.')[-1]  # Get the file extension
            presigned_url = generate_presigned_url(BUCKET, f"{document_prefix}{document_name}")
            document_name = document_name
            metadata = get_document_metadata_from_db(category_id, document_name.split('.')[0], document_type)
            document_list_urls[f"{document_name}"] = {
                "url": presigned_url,
                "metadata": metadata
            }

        logger.info("Presigned URLs and metadata generated successfully", extra={
            "document_files": document_list_urls,
        })

        return {
            'statusCode': 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps({
                'document_files': document_list_urls
            })
        }
    except Exception as e:
        logger.exception(f"Error generating presigned URLs or retrieving metadata: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Internal server error')
        }