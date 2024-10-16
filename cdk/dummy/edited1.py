import os
import json
import boto3
import psycopg2
from datetime import datetime, timezone
import logging
import uuid

from helpers.vectorstore import update_vectorstore
from langchain_community.embeddings import BedrockEmbeddings

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()


DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
REGION = os.environ["REGION"]
BUCKET_NAME = os.environ["BUCKET"]

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
            'host': db_secret["host"],
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

def parse_s3_file_path(document_key):
    # Assuming the file path is of the format: {category_id}/{document_name}.{document_type}
    try:
        category_id, documentname_with_ext = document_key.split('/')
        document_name, document_type = documentname_with_ext.split('.')
        return category_id, document_name, document_type
    except Exception as e:
        logger.error(f"Error parsing S3 file path: {e}")
        return {
                    "statusCode": 400,
                    "body": json.dumps("Error parsing S3 file path.")
                }

def insert_file_into_db(category_id, document_name, document_type, document_s3_file_path):    
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }
    
    try:
        cur = connection.cursor()

        # Check if a record already exists
        select_query = """
        SELECT * FROM "documents"
        WHERE category_id = %s
        AND document_name = %s
        AND document_type = %s;
        """
        cur.execute(select_query, (category_id, document_name, document_type))

        existing_file = cur.fetchone()

        if existing_file:
            # Update the existing record
            update_query = """
                UPDATE "documents"
                SET document_s3_file_path = %s,
                time_created = %s
                WHERE category_id = %s,
                AND document_name = %s
                AND document_type = %s;
            """
            timecreated = datetime.now(timezone.utc)
            cur.execute(update_query, (
                document_s3_file_path,  # document_s3_file_path
                timecreated,  # time_created
                category_id,  # category_id
                document_name,  # filename
                document_type  # filetype
            ))
            logger.info(f"Successfully updated file {document_name}.{document_type} in database for module {category_id}.")
        else:
            # Insert a new record
            insert_query = """
                INSERT INTO "documents" 
                (document_id, category_id, document_s3_file_path, document_name, document_type, metadata, time_created)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            """
            timecreated = datetime.now(timezone.utc)
            document_id = str(uuid.uuid4())

            cur.execute(insert_query, (
                document_id,  # document_id
                category_id,  # module_id
                document_s3_file_path,  # filetype
                document_name,  # filepath
                document_type,  # filename
                timecreated,  # time_uploaded
                ""  # metadata
        ))
        logger.info(f"Successfully inserted file {document_name}.{document_type} into database for category {category_id}.")

        connection.commit()
        cur.close()
        connection.close()
    except Exception as e:
        if cur:
            cur.close()
        if connection:
            connection.rollback()
            connection.close()
        logger.error(f"Error inserting file {document_name}.{document_type} into database: {e}")
        raise

def update_vectorstore_from_s3(category_id):
    bucket = os.getenv('BUCKET_NAME')
    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime",
        region_name=REGION
    )
    
    embeddings = BedrockEmbeddings(
        model_id='amazon.titan-embed-text-v2:0', 
        client=bedrock_runtime,
        region_name=REGION
    )
    
    db_secret = get_secret()

    vectorstore_config_dict = {
        'collection_name': f'{category_id}',
        'dbname': db_secret["dbname"],
        'user': db_secret["username"],
        'password': db_secret["password"],
        'host': db_secret["host"],
        'port': db_secret["port"]
    }

    try:
        update_vectorstore(
            bucket=bucket,
            category=category_id,
            vectorstore_config_dict=vectorstore_config_dict,
            embeddings=embeddings
        )
    except Exception as e:
        logger.error(f"Error updating vectorstore for course {category_id}: {e}")
        raise

def handler(event, context):
    records = event.get('Records', [])
    if not records:
        return {
            "statusCode": 400,
            "body": json.dumps("No valid S3 event found.")
        }

    for record in records:
        if record['eventName'].startswith('ObjectCreated:'):
            # bucket_name = record['s3']['bucket']['name']
            document_key = record['s3']['object']['key']

            # Parse the file path
            category_id, document_name, document_type = parse_s3_file_path(document_key)
            if not category_id or not document_name or not document_type:
                return {
                    "statusCode": 400,
                    "body": json.dumps("Error parsing S3 file path.")
                }

            # Insert the file into the PostgreSQL database
            try:
                insert_file_into_db(
                    category_id=category_id,
                    document_name=document_name,
                    document_type=document_type,
                    document_s3_file_path=document_key,
                    
                )
                logger.info(f"File {document_name}.{document_type} inserted successfully.")
            except Exception as e:
                logger.error(f"Error inserting file {document_name}.{document_type} into database: {e}")
                return {
                    "statusCode": 500,
                    "body": json.dumps(f"Error inserting file {document_name}.{document_type}: {e}")
                }
            
            # Update embeddings for course after the file is successfully inserted into the database
            try:
                update_vectorstore_from_s3(category_id)
                logger.info(f"Vectorstore updated successfully for course {category_id}.")
            except Exception as e:
                logger.error(f"Error updating vectorstore for course {category_id}: {e}")
                return {
                    "statusCode": 500,
                    "body": json.dumps(f"File inserted, but error updating vectorstore: {e}")
                }

            return {
                "statusCode": 200,
                "body": json.dumps({
                    "message": "New file inserted into database.",
                    "location": f"s3://{BUCKET_NAME}/{document_key}"
                })
            }

    return {
        "statusCode": 400,
        "body": json.dumps("No new file upload event found.")
    }