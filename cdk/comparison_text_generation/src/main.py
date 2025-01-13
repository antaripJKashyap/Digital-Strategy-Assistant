import os
import json
import boto3
import logging
import psycopg2
import uuid, datetime
from langchain_aws import BedrockEmbeddings

from helpers.vectorstore import get_vectorstore_retriever, get_vectorstore_retriever_ordinary
from helpers.chat import get_bedrock_llm, get_initial_student_query, get_student_query, create_dynamodb_history_table, get_response, get_response_evaluation

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

COMP_TEXT_GEN_QUEUE_URL = os.environ["COMP_TEXT_GEN_QUEUE_URL"]
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
DB_COMP_SECRET_NAME = os.environ["SM_DB_COMP_CREDENTIALS"]
REGION = os.environ["REGION"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]
RDS_PROXY_COMP_ENDPOINT = os.environ["RDS_PROXY_COMP_ENDPOINT"]
BEDROCK_LLM_PARAM = os.environ["BEDROCK_LLM_PARAM"]
EMBEDDING_MODEL_PARAM = os.environ["EMBEDDING_MODEL_PARAM"]
TABLE_NAME_PARAM = os.environ["TABLE_NAME_PARAM"]
# AWS Clients
secrets_manager_client = boto3.client("secretsmanager")
ssm_client = boto3.client("ssm", region_name=REGION)
bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION)
# Cached resources
connection = None
connection_comparison = None
db_secret = None
db_secret_comparison = None
BEDROCK_LLM_ID = None
EMBEDDING_MODEL_ID = None
TABLE_NAME = None
# Cached embeddings instance
embeddings = None

def get_secret(secret_name, expect_json=True):
    global db_secret
    if db_secret is None:
        try:
            response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
            db_secret = json.loads(response) if expect_json else response
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
            raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
        except Exception as e:
            logger.error(f"Error fetching secret {secret_name}: {e}")
            raise
    return db_secret

def get_secret_comparison(secret_name, expect_json=True):
    global db_secret_comparison
    if db_secret_comparison is None:
        try:
            response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
            db_secret_comparison = json.loads(response) if expect_json else response
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
            raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
        except Exception as e:
            logger.error(f"Error fetching secret {secret_name}: {e}")
            raise
    return db_secret_comparison

def get_parameter(param_name, cached_var):
    """
    Fetch a parameter value from Systems Manager Parameter Store.
    """
    if cached_var is None:
        try:
            response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
            cached_var = response["Parameter"]["Value"]
        except Exception as e:
            logger.error(f"Error fetching parameter {param_name}: {e}")
            raise
    return cached_var


def initialize_constants():
    global BEDROCK_LLM_ID, EMBEDDING_MODEL_ID, TABLE_NAME, embeddings
    BEDROCK_LLM_ID = get_parameter(BEDROCK_LLM_PARAM, BEDROCK_LLM_ID)
    EMBEDDING_MODEL_ID = get_parameter(EMBEDDING_MODEL_PARAM, EMBEDDING_MODEL_ID)
    TABLE_NAME = get_parameter(TABLE_NAME_PARAM, TABLE_NAME)
    if embeddings is None:
        embeddings = BedrockEmbeddings(
            model_id=EMBEDDING_MODEL_ID,
            client=bedrock_runtime,
            region_name=REGION,
        )
    
    create_dynamodb_history_table(TABLE_NAME)

def connect_to_db():
    global connection
    if connection is None or connection.closed:
        try:
            secret = get_secret(DB_SECRET_NAME)
            connection_params = {
                'dbname': secret["dbname"],
                'user': secret["username"],
                'password': secret["password"],
                'host': RDS_PROXY_ENDPOINT,
                'port': secret["port"]
            }
            connection_string = " ".join([f"{key}={value}" for key, value in connection_params.items()])
            connection = psycopg2.connect(connection_string)
            logger.info("Connected to the database!")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            if connection:
                connection.rollback()
                connection.close()
            raise
    return connection

def connect_to_comparison_db():
    global connection_comparison
    if connection_comparison is None or connection_comparison.closed:
        try:
            secret = get_secret_comparison(DB_COMP_SECRET_NAME)
            connection_params = {
                'dbname': secret["dbname"],
                'user': secret["username"],
                'password': secret["password"],
                'host': RDS_PROXY_COMP_ENDPOINT,
                'port': secret["port"]
            }
            connection_string = " ".join([f"{key}={value}" for key, value in connection_params.items()])
            connection_comparison = psycopg2.connect(connection_string)
            logger.info("Connected to the database!")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            if connection_comparison:
                connection_comparison.rollback()
                connection_comparison.close()
            raise
    return connection_comparison

def get_combined_guidelines(criteria_list):
    """
    Fetch and organize headers and bodies of all guidelines matching the given criteria names.

    Args:
        criteria_list (list): A list of criteria names to search for in the guidelines table.

    Returns:
        dict: A dictionary organizing headers and bodies under their respective criteria names.
    """
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {}

    try:
        cur = connection.cursor()

        # Define the SQL query with IN clause
        query = """
        SELECT criteria_name, header, body
        FROM guidelines
        WHERE criteria_name = ANY(%s)
        ORDER BY criteria_name, timestamp DESC;
        """

        # Execute the query with the criteria list as a parameter
        cur.execute(query, (criteria_list,))
        results = cur.fetchall()

        # Organize results into a dictionary
        guidelines_dict = {}
        for criteria_name, header, body in results:
            if criteria_name not in guidelines_dict:
                guidelines_dict[criteria_name] = []
            # Combine header and body in the desired format
            guidelines_dict[criteria_name].append(f"{header}: {body}")

        # Return the dictionary
        return guidelines_dict

    except Exception as e:
        logger.error(f"Error fetching guidelines: {e}")
        return {}

    finally:
        if cur:
            cur.close()
        if connection:
            connection.close()


def handler(event, context):
    logger.info("Comparison Text Generation Lambda function is called!")
    initialize_constants()

    print("Inside new lambda")