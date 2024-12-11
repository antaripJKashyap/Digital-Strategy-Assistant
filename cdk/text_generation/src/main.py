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


DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
DB_COMP_SECRET_NAME = os.environ["SM_DB_COMP_CREDENTIALS"]
REGION = os.environ["REGION"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]
RDS_PROXY_COMP_ENDPOINT = os.environ["RDS_PROXY_COMP_ENDPOINT"]


def get_secret(secret_name, expect_json=True):
    try:
        # secretsmanager client to get db credentials
        sm_client = boto3.client("secretsmanager")
        response = sm_client.get_secret_value(SecretId=secret_name)["SecretString"]
        
        if expect_json:
            return json.loads(response)
        else:
            return response
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
        raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
    except Exception as e:
        logger.error(f"Error fetching secret {secret_name}: {e}")
        raise

def log_user_engagement(
    session_id, 
    document_id=None, 
    engagement_type="message creation", 
    engagement_details=None, 
    user_role=None, 
    user_info=None
):
    connection = None
    cur = None
    try:
        # Get database credentials and establish a connection
        db_secret = get_secret(DB_SECRET_NAME)
        connection_params = {
            'dbname': db_secret["dbname"],
            'user': db_secret["username"],
            'password': db_secret["password"],
            'host': RDS_PROXY_ENDPOINT,
            'port': db_secret["port"]
        }

        connection_string = " ".join([f"{key}={value}" for key, value in connection_params.items()])
        connection = psycopg2.connect(connection_string)
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
        if connection:
            connection.rollback()
        logger.error(f"Error logging user engagement: {e}")
    finally:
        if cur:
            cur.close()
        if connection:
            connection.close()

def get_parameter(param_name):
    """
    Fetch a parameter value from Systems Manager Parameter Store.
    """
    try:
        ssm_client = boto3.client("ssm", region_name=REGION)
        response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
        return response["Parameter"]["Value"]
    except Exception as e:
        logger.error(f"Error fetching parameter {param_name}: {e}")
        raise
## GET PARAMETER VALUES FOR CONSTANTS
BEDROCK_LLM_ID = get_parameter(os.environ["BEDROCK_LLM_PARAM"])
EMBEDDING_MODEL_ID = get_parameter(os.environ["EMBEDDING_MODEL_PARAM"])
TABLE_NAME = get_parameter(os.environ["TABLE_NAME_PARAM"])
                        
## GETTING AMAZON TITAN EMBEDDINGS MODEL
bedrock_runtime = boto3.client(
        service_name="bedrock-runtime",
        region_name=REGION,
    )

embeddings = BedrockEmbeddings(
    model_id=EMBEDDING_MODEL_ID, 
    client=bedrock_runtime,
    region_name=REGION
)

create_dynamodb_history_table(TABLE_NAME)

def get_prompt_for_role(user_role):
    connection = None
    cur = None
    try:
        logger.info(f"Fetching system prompt for role: {user_role}.")
        db_secret = get_secret(DB_SECRET_NAME)

        connection_params = {
            'dbname': db_secret["dbname"],
            'user': db_secret["username"],
            'password': db_secret["password"],
            'host': RDS_PROXY_ENDPOINT,
            'port': db_secret["port"]
        }

        connection_string = " ".join([f"{key}={value}" for key, value in connection_params.items()])

        connection = psycopg2.connect(connection_string)
        cur = connection.cursor()
        logger.info("Connected to RDS instance!")

        # Validate the role
        valid_roles = ["public", "educator", "admin"]
        if user_role not in valid_roles:
            logger.error(f"Invalid user_role: {user_role}")
            return None

        # Query to fetch the most recent prompt for the specified role
        query = f"""
            SELECT {user_role}
            FROM prompts
            WHERE {user_role} IS NOT NULL
            ORDER BY time_created DESC NULLS LAST
            LIMIT 1;
        """
        cur.execute(query)
        result = cur.fetchone()
        logger.info(f"Query result for role {user_role}: {result}")

        if result:
            prompt = str(result[0])
            logger.info(f"{user_role.capitalize()} prompt fetched successfully.")
            return prompt
        else:
            logger.warning(f"No prompts found for role: {user_role}.")
            return None

    except Exception as e:
        logger.error(f"Error fetching system prompt for role {user_role}: {e}")
        if connection:
            connection.rollback()
        return None
    finally:
        if cur:
            cur.close()
        if connection:
            connection.close()
        logger.info("Connection closed.")

def check_embeddings():
    connection = None
    cur = None
    try:
        logger.info("Checking embeddings table.")
        db_secret = get_secret(DB_SECRET_NAME)

        connection_params = {
            'dbname': db_secret["dbname"],
            'user': db_secret["username"],
            'password': db_secret["password"],
            'host': RDS_PROXY_ENDPOINT,
            'port': db_secret["port"]
        }

        connection_string = " ".join(
            [f"{key}={value}" for key, value in connection_params.items()]
        )

        connection = psycopg2.connect(connection_string)
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
        if connection:
            connection.rollback()
        return False
    finally:
        if cur:
            cur.close()
        if connection:
            connection.close()
        logger.info("Connection closed.")



def handler(event, context):
    logger.info("Text Generation Lambda function is called!")
    

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
    
    # Check if user_role is provided after the initial greeting
    if user_role:
        logger.info(f"User role received: {user_role}")
       
    else:
        logger.info("Awaiting user role selection.")
        
    if comparison:
        
        logger.info(f"Comparison document received: {comparison}")
        # Try obtaining vectorstore config for the user uploaded document vectorstore
        try:
            logger.info("Retrieving vectorstore config.")
            db_secret = get_secret(DB_COMP_SECRET_NAME)
            print(f"print: getting secret COMP")
            vectorstore_config_dict = {
                'collection_name': session_id,
                'dbname': db_secret["dbname"],
                'user': db_secret["username"],
                'password': db_secret["password"],
                'host': RDS_PROXY_COMP_ENDPOINT,
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
                'body': json.dumps('Error retrieving user uploaded document vectorstore config')
            }
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
        # Try obtaining the ordinary retriever given this vectorstore config dict
        try:
            logger.info("Creating ordinary retriever for user uploaded vectorstore.")
            ordinary_retriever, user_uploaded_vectorstore = get_vectorstore_retriever_ordinary(
                llm=llm,
                vectorstore_config_dict=vectorstore_config_dict,
                embeddings=embeddings
            )
        except Exception as e:
            logger.error(f"Error creating ordinary retriever for user uploaded vectorstore: {e}")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Error creating ordinary retriever for user uploaded vectorstore')
            }

        # Try getting an evaluation result from the LLM
        try:
            logger.info("Generating response from the LLM.")
            response = get_response_evaluation(
                llm=llm,
                retriever=ordinary_retriever
            )
            print(f"print: response generated after get_response_evaluation")
            log_user_engagement(
            session_id=session_id,
            engagement_type="document comparison",
            engagement_details="I've uploaded a document for comparison.",
            user_info=user_info,
            user_role=user_role
            )
            logger.info(f"User role {user_role} logged in engagement log.")

            # Delete the collection from the vectorstore after the embeddings have been used for evaluation
            
            # Fetch all collections
            collections = user_uploaded_vectorstore.list_collections()

            # Check if this collection exists
            if vectorstore_config_dict['collection_name'] in collections:
                # If yes, then delete it and notify
                user_uploaded_vectorstore.delete_collection(vectorstore_config_dict['collection_name'])
                logger.info(f"Evaluation complete. Collection '{collection_name}' was found and deleted.")
            else:
                logger.info(f"Collection '{collection_name}' was not found in the vectorstore.")
            
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
        
        logger.info("Returning the generated evaluation.")

        # This part below might have to be fixed
        # If LLM did generate a response, return it
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
                "content": response,
                "options": [],
                "user_role": user_role
            })
        }
        
    
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

    if not question:
        logger.info("Start of conversation. Creating conversation history table in DynamoDB.")
        initial_query = get_initial_student_query()
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
        logger.info(f"Processing student question: {question}")
        student_query = get_student_query(question)
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
        response = get_response(
            query=student_query,
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
