import os
import json
import boto3
import psycopg2
from aws_lambda_powertools import Logger
from psycopg2.pool import SimpleConnectionPool
from functools import lru_cache
from contextlib import contextmanager
logger = Logger()

s3 = boto3.client('s3')
BUCKET = os.environ["BUCKET"]
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

# AWS Clients
secrets_manager_client = boto3.client('secretsmanager')
# Global variables for caching
connection = None
db_secret = None
pool = None

@lru_cache(maxsize=1)
def get_secret():
    """Cached retrieval of database credentials"""
    try:
        response = secrets_manager_client.get_secret_value(SecretId=DB_SECRET_NAME)["SecretString"]
        return json.loads(response)
    except Exception as e:
        logger.error(f"Error retrieving secret: {e}")
        raise

def get_connection_pool():
    """Initialize and return database connection pool"""
    global pool
    if pool is None:
        try:
            secret = get_secret()
            connection_params = {
                'dbname': secret["dbname"],
                'user': secret["username"],
                'password': secret["password"],
                'host': RDS_PROXY_ENDPOINT,
                'port': secret["port"]
            }
            pool = SimpleConnectionPool(1, 3, **connection_params)
            logger.info("Connection pool initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize connection pool: {e}")
            raise
    return pool
    
@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    pool = get_connection_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        if conn:
            pool.putconn(conn)

def delete_document_from_db(category_id):
    """Delete category from database with proper connection handling"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            try:
                delete_query = """
                    DELETE FROM "categories" 
                    WHERE category_id = %s;
                """
                cur.execute(delete_query, (category_id,))
                conn.commit()
                logger.info(f"Successfully deleted document category {category_id}")
            except Exception as e:
                conn.rollback()
                logger.error(f"Error deleting category {category_id}: {e}")
                raise

def delete_s3_objects(category_id):
    """Delete S3 objects efficiently using pagination"""
    try:
        module_prefix = f"{category_id}/"
        objects_to_delete = []
        paginator = s3.get_paginator('list_objects_v2')
        
        # Use paginator for efficient object listing
        for page in paginator.paginate(Bucket=BUCKET, Prefix=module_prefix):
            if 'Contents' in page:
                batch = [{'Key': obj['Key']} for obj in page['Contents']]
                objects_to_delete.extend(batch)
                
                # Delete in batches of 1000 (S3 limit)
                if len(objects_to_delete) >= 1000:
                    s3.delete_objects(
                        Bucket=BUCKET,
                        Delete={'Objects': objects_to_delete[:1000]}
                    )
                    objects_to_delete = objects_to_delete[1000:]
        
        # Delete remaining objects
        if objects_to_delete:
            s3.delete_objects(
                Bucket=BUCKET,
                Delete={'Objects': objects_to_delete}
            )
        
        return True
    except Exception as e:
        logger.error(f"Error deleting S3 objects: {e}")
        raise

@logger.inject_lambda_context
@logger.inject_lambda_context
def lambda_handler(event, context):
    """Main Lambda handler with improved error handling and response structure"""
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
    }
    
    try:
        query_params = event.get("queryStringParameters", {})
        category_id = query_params.get("category_id")

        if not category_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    "error": "Missing required parameter: category_id"
                })
            }

        # Delete from database
        delete_document_from_db(category_id)
        
        # Delete from S3
        delete_s3_objects(category_id)

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                "message": f"Successfully deleted category {category_id} and associated files"
            })
        }

    except Exception as e:
        logger.exception(f"Error processing request: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                "error": "Internal server error",
                "details": str(e)
            })
        }