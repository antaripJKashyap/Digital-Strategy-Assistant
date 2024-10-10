import os
import json
import boto3
import psycopg2
from aws_lambda_powertools import Logger

logger = Logger()

s3 = boto3.client('s3')
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
    

def delete_document_from_db(category_id, document_id, document_name, document_type):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
        "statusCode": 500,
        "body": json.dumps("Database connection failed.")
        }
        

    try:
        cur = connection.cursor()

        delete_query = """
            DELETE FROM "documents" 
            WHERE category_id = %s AND document_id = %s AND document_name = %s AND document_type = %s;
        """
        cur.execute(delete_query, (category_id, document_id, document_name, document_type))

        connection.commit()
        logger.info(f"Successfully deleted document {document_name}.{document_type} from category {category_id}.")

        cur.close()
        connection.close()
    except Exception as e:
        if cur:
            cur.close()
        if connection:
            connection.rollback()
            connection.close()
        logger.error(f"Error deleting document {document_name}.{document_type} from database: {e}")
        raise


@logger.inject_lambda_context
def lambda_handler(event, context):
    query_params = event.get("queryStringParameters", {})

    category_id = query_params.get("category_id", "")
    document_id = query_params.get("document_id", "")
    document_name = query_params.get("document_name", "")
    document_type = query_params.get("document_type", "")

    if not document_id or not document_name or not document_type:
        logger.error("Missing required parameters", extra={
            "category_id": category_id,
            "document_id": document_id,
            "document_name": document_name,
            "document_type": document_type
        })
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameters: category_id, document_id, document_name, or document_type')
        } 

    try:
        # Allowed document types for documents
        allowed_document_types = {"pdf", "docx", "pptx", "txt", "xlsx", "xps", "mobi", "cbz"}

        folder = None
        objects_to_delete = []
        # Determine the folder based on the file type
        if document_type in allowed_document_types:
            folder = "documents"
            objects_to_delete.append({"Key": f"{category_id}/{document_name}.{document_type}"})
        else:
            return {
                'statusCode': 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Unsupported document type')
            }

        # Delete the document from S3
        response = s3.delete_objects(
            Bucket=BUCKET,
            Delete={
                "Objects": objects_to_delete,
                "Quiet": True,
            },
        )
        
        logger.info(f"S3 Response: {response}")
        logger.info(f"File {document_name}.{document_type} and any associated documents deleted successfully from S3.")

        # Delete the document from the database
        try:
            delete_document_from_db(category_id, document_id, document_name, document_type)
            logger.info(f"File {document_name}.{document_type} deleted from the database.")
        except Exception as e:
            logger.error(f"Error deleting file {document_name}.{document_type} from the database: {e}")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps(f"Error deleting file {document_name}.{document_type} from the database")
            }

        return {
            'statusCode': 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Document deleted successfully')
        }
        
    except Exception as e:
        logger.exception(f"Error deleting Document: {e}")
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
