import os
import json
import boto3
import logging
import psycopg2
import hashlib
import uuid, datetime
from langchain_aws import BedrockEmbeddings


from helpers.vectorstore import get_vectorstore_retriever
from helpers.chat import get_bedrock_llm, create_dynamodb_history_table, get_response, get_user_query, get_initial_user_query

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
sqs = boto3.client('sqs')
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

def log_user_engagement(
    session_id, 
    document_id=None, 
    engagement_type="message creation", 
    engagement_details=None, 
    user_role=None, 
    user_info=None
):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }

    try:
        cur = connection.cursor()

        # Define the SQL query
        query = """
        INSERT INTO user_engagement_log (
            log_id, session_id, document_id, engagement_type, 
            engagement_details, user_role, user_info, timestamp
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """

        # Generate a unique log ID and current timestamp
        log_id = str(uuid.uuid4())
        timestamp = datetime.datetime.now()

        # Execute the query
        cur.execute(
            query, 
            (
                log_id, 
                session_id, 
                document_id, 
                engagement_type, 
                engagement_details, 
                user_role, 
                user_info, 
                timestamp
            )
        )

        # Commit the transaction
        connection.commit()
        logger.info("User engagement logged successfully.")

    except Exception as e:
        connection.rollback()
        logger.error(f"Error logging user engagement: {e}")
    finally:
        if cur:
            cur.close()

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


def get_prompt_for_role(user_role):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }
        
    try:
        cur = connection.cursor()
        logger.info("Connected to RDS instance!")

        # Map valid roles to column names
        role_column_mapping = {
            "public": "public",
            "educator": "educator",
            "admin": "admin"
        }

        # Validate user_role and get corresponding column name
        if user_role not in role_column_mapping:
            logger.error(f"Invalid user_role: {user_role}")
            return None
        column_name = role_column_mapping[user_role]

        # Construct query using safe column name
        query = f"""
            SELECT {column_name}
            FROM prompts
            WHERE {column_name} IS NOT NULL
            ORDER BY time_created DESC NULLS LAST
            LIMIT 1;
        """
        logger.debug(f"Executing query: {query}")
        cur.execute(query)
        result = cur.fetchone()
        logger.debug(f"Query result for role {user_role}: {result}")

        if result and result[0]:
            prompt = str(result[0])
            logger.info(f"{user_role.capitalize()} prompt fetched successfully.")
            return prompt
        else:
            logger.warning(f"No prompts found for role: {user_role}.")
            return None

    except Exception as e:
        logger.error(f"Error fetching system prompt for role {user_role}: {e}")
        connection.rollback()
        return None
    finally:
        if cur:
            cur.close()
        if connection:
            connection.close()
        logger.info("Connection closed.")

def delete_collection_by_id(session_id):
    """
    Delete a collection by its ID from the langchain_pg_embedding table.
    
    Args:
        collection_id (str): The ID of the collection to delete.
    
    Returns:
        bool: True if the deletion was successful, False otherwise.
    """
    connection_comparison = connect_to_comparison_db()
    if connection_comparison is None:
        logger.error("No database connection available for comparison.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }

    try:
        
        print(f"Deleting collection with ID: {session_id}")
        cur = connection_comparison.cursor()
            # Construct and execute the DELETE query
        query = """
            DELETE FROM langchain_pg_embedding 
            WHERE collection_id = %s;
        """
        
        print(f"Executing query: {query} with collection_id: {session_id}")
        cur.execute(query, (session_id,))
            
        # Commit the transaction
        connection_comparison.commit()
        print(f"Collection with ID {session_id} deleted successfully.")
        return True

    except Exception as e:
        # Rollback in case of any failure
        connection_comparison.rollback()
        logger.error(f"Error deleting collection with ID {session_id}: {e}")
        return False

    finally:
        # Close the connection
        if connection_comparison:
            connection_comparison.close()
            logger.info("Comparison database connection closed.")


def check_embeddings():
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }
    try:
        cur = connection.cursor()

        # Check if table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'langchain_pg_embedding'
            );
        """)
        table_exists = cur.fetchone()[0]

        if not table_exists:
            logger.warning("Table 'langchain_pg_embedding' does not exist.")
            return False

        # Check if table has rows
        cur.execute("SELECT COUNT(*) FROM langchain_pg_embedding;")
        row_count = cur.fetchone()[0]

        if row_count == 0:
            logger.warning("Table 'langchain_pg_embedding' exists but has no rows.")
            return False

        logger.info(f"Table 'langchain_pg_embedding' exists and has {row_count} rows.")
        return True

    except Exception as e:
        logger.error(f"Error checking embeddings table: {e}")
        connection.rollback()
        return False
    finally:
        if cur:
            cur.close()
        logger.info("Connection closed.")



def handler(event, context):
    logger.info("Text Generation Lambda function is called!")
    initialize_constants()

    query_params = event.get("queryStringParameters", {})

    
    session_id = query_params.get("session_id", "")
    user_info = query_params.get("user_info", "")


    if not session_id:
        logger.error("Missing required parameter: session_id")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: session_id')
        }
    
    body = {} if event.get("body") is None else json.loads(event.get("body"))
    question = body.get("message_content", "")
    user_role = body.get("user_role", "")
    comparison = body.get("comparison", "")
    criteria = body.get("criteria", "")
    
    print(f"comparison_flag:", comparison)
    
    # Check if user_role is provided after the initial greeting
    if user_role:
        logger.info(f"User role received: {user_role}")
       
    else:
        logger.info("Awaiting user role selection.")
        
    if comparison:
        print("inside comparison flag")
        try:
            message_body = {
                'session_id': session_id,
                'user_role': user_role,
                'criteria': criteria
            }
            message_deduplication_id = hashlib.md5(json.dumps(message_body).encode('utf-8')).hexdigest()
            sqs.send_message(
                QueueUrl=os.environ["COMP_TEXT_GEN_QUEUE_URL"],
                MessageBody=json.dumps(message_body),
                MessageGroupId=session_id,  # Add MessageGroupId for FIFO queue
                MessageDeduplicationId=message_deduplication_id
            )
            return {
                'statusCode': 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps({'session_id': session_id})
            }
        except Exception as e:
            logger.error(f"Error sending message to SQS: {e}")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Error sending message to SQS')
            }


        # print(f"session_id Comparison", session_id)
        # guidelines = get_combined_guidelines(criteria)
        # logger.info(f"Comparison document received: {comparison}")
        # # Try obtaining vectorstore config for the user uploaded document vectorstore
        # try:
        #     logger.info("Retrieving vectorstore config.")
        #     db_secret = get_secret_comparison(DB_COMP_SECRET_NAME)
            
        #     vectorstore_config_dict = {
        #         'collection_name': session_id,
        #         'dbname': db_secret["dbname"],
        #         'user': db_secret["username"],
        #         'password': db_secret["password"],
        #         'host': RDS_PROXY_COMP_ENDPOINT,
        #         'port': db_secret["port"]
        #     }
        #     print(f"session_id:", session_id)
        #     print(f"print: vectorstore_config_dict COMP", vectorstore_config_dict)
        # except Exception as e:
        #     logger.error(f"Error retrieving vectorstore config: {e}")
        #     return {
        #         'statusCode': 500,
        #         "headers": {
        #             "Content-Type": "application/json",
        #             "Access-Control-Allow-Headers": "*",
        #             "Access-Control-Allow-Origin": "*",
        #             "Access-Control-Allow-Methods": "*",
        #         },
        #         'body': json.dumps('Error retrieving user uploaded document vectorstore config')
        #     }
        # try:
        #     logger.info("Creating Bedrock LLM instance.")
        #     llm = get_bedrock_llm(bedrock_llm_id=BEDROCK_LLM_ID, enable_guardrails=True)
        # except Exception as e:
        #     logger.error(f"Error getting LLM from Bedrock: {e}")
        #     return {
        #         'statusCode': 500,
        #         "headers": {
        #             "Content-Type": "application/json",
        #             "Access-Control-Allow-Headers": "*",
        #             "Access-Control-Allow-Origin": "*",
        #             "Access-Control-Allow-Methods": "*",
        #         },
        #         'body': json.dumps('Error getting LLM from Bedrock')
        #     }
        # # Try obtaining the ordinary retriever given this vectorstore config dict
        # try:
        #     logger.info("Creating ordinary retriever for user uploaded vectorstore.")
        #     ordinary_retriever, user_uploaded_vectorstore = get_vectorstore_retriever_ordinary(
        #         llm=llm,
        #         vectorstore_config_dict=vectorstore_config_dict,
        #         embeddings=embeddings
        #     )
        # except Exception as e:
        #     logger.error(f"Error creating ordinary retriever for user uploaded vectorstore: {e}")
        #     return {
        #         'statusCode': 500,
        #         "headers": {
        #             "Content-Type": "application/json",
        #             "Access-Control-Allow-Headers": "*",
        #             "Access-Control-Allow-Origin": "*",
        #             "Access-Control-Allow-Methods": "*",
        #         },
        #         'body': json.dumps('Error creating ordinary retriever for user uploaded vectorstore')
        #     }

        # # Try getting an evaluation result from the LLM
        # try:
        #     logger.info("Generating response from the LLM.")
        #     response = get_response_evaluation(
        #         llm=llm,
        #         retriever=ordinary_retriever,
        #         guidelines_file=guidelines
        #     )
        #     logger.info(f"User role {user_role} logged in engagement log.")

        #     # Delete the collection from the vectorstore after the embeddings have been used for evaluation
        #     try:
        #         delete_collection_by_id(session_id)
        #     except Exception as e:
        #         print(f"User uploaded vectorstore collection could not be deleted. Exception details: {e}.")
        # except Exception as e:
        #      logger.error(f"Error getting response: {e}")
        #      return {
        #             'statusCode': 500,
        #             "headers": {
        #                 "Content-Type": "application/json",
        #                 "Access-Control-Allow-Headers": "*",
        #                 "Access-Control-Allow-Origin": "*",
        #                 "Access-Control-Allow-Methods": "*",
        #             },
        #             'body': json.dumps('Error getting response')
        #         }
        
        # logger.info("Returning the generated evaluation.")

        # # This part below might have to be fixed
        # # If LLM did generate a response, return it
        # return {
        #     "statusCode": 200,
        #     "headers": {
        #             "Content-Type": "application/json",
        #             "Access-Control-Allow-Headers": "*",
        #             "Access-Control-Allow-Origin": "*",
        #             "Access-Control-Allow-Methods": "*",
        #         },
        #     "body": json.dumps({
        #         "type": "ai",
        #         "content": response.get("llm_output", "LLM failed to create response"),
        #         "options": [],
        #         "user_role": user_role
        #     })
        # }
        
    
    logger.info("Fetching prompts from the database.")
    user_prompt = get_prompt_for_role(user_role)

    if not user_prompt:
        logger.error(f"Error fetching system prompt for user_role: {user_role}")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error fetching system prompt')
        }

    if question == "":
        logger.info("Start of conversation. Creating conversation history table in DynamoDB.")
        initial_query = get_initial_user_query()
        query_data = json.loads(initial_query)
        options = query_data["options"]
        # student_query = get_student_query("")
        # options = []
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({
                "type": "ai",
                "content": "Hello! Please select the best role below that fits you. We can better answer your questions. Don't include personal details such as your name and private content.",
                "options": options,
                "user_role": user_role
            })
        }
        
    else:
        logger.info(f"Processing the user's question: {question}")
        user_query = get_user_query(question)
        options = []
        log_user_engagement(
            session_id=session_id,
            engagement_type="message creation",
            engagement_details=question,
            user_info=user_info,
            user_role=user_role
        )
        logger.info(f"User role {user_role} logged in engagement log.")
    
    try:
        logger.info("Creating Bedrock LLM instance.")
        llm = get_bedrock_llm(BEDROCK_LLM_ID)
        
    except Exception as e:
        logger.error(f"Error getting LLM from Bedrock: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error getting LLM from Bedrock')
        }
    
    try:
        logger.info("Retrieving vectorstore config.")
        db_secret = get_secret(DB_SECRET_NAME)
        vectorstore_config_dict = {
            'collection_name': "all",
            'dbname': db_secret["dbname"],
            'user': db_secret["username"],
            'password': db_secret["password"],
            'host': RDS_PROXY_ENDPOINT,
            'port': db_secret["port"]
        }
    except Exception as e:
        logger.error(f"Error retrieving vectorstore config: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error retrieving vectorstore config')
        }
    if not check_embeddings():
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps(
                "Error: The Administrator has not uploaded Digital Strategy documents, please contact the Administrator."
            )
        }
    try:
        logger.info("Creating history-aware retriever.")
        
        history_aware_retriever = get_vectorstore_retriever(
            llm=llm,
            vectorstore_config_dict=vectorstore_config_dict,
            embeddings=embeddings
        )


    except Exception as e:
        logger.error(f"Error creating history-aware retriever: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error creating history-aware retriever')
        }
    
    try:
        logger.info("Generating response from the LLM.")
        print(f"before get_response")
        response = get_response(
            query=user_query,
            llm=llm,
            history_aware_retriever=history_aware_retriever,
            table_name=TABLE_NAME,
            session_id=session_id,
            user_prompt=user_prompt
        )
    except Exception as e:
        logger.error(f"Error getting response: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error getting response')
        }
    
    
    logger.info("Returning the generated response.")
    return {
        "statusCode": 200,
        "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
        "body": json.dumps({
            "type": "ai",
            "content": response.get("llm_output", "LLM failed to create response"),
            "options": response.get("options", []),
            "user_role": user_role
        })
    }
