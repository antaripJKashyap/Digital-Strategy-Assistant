import os
import json
import boto3
import logging
import psycopg2
import uuid, datetime
from langchain_aws import BedrockEmbeddings


from helpers.vectorstore import get_vectorstore_retriever
from helpers.chat import get_bedrock_llm, get_initial_student_query, get_student_query, create_dynamodb_history_table, get_response

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()


DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
REGION = os.environ["REGION"]

def get_secret(secret_name, expect_json=True):
    try:
        # secretsmanager client to get db credentials
        sm_client = boto3.client("secretsmanager")
        response = sm_client.get_secret_value(SecretId=secret_name)["SecretString"]
        
        if expect_json:
            return json.loads(response)
        else:
            print(response)
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
            'host': db_secret["host"],
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

def get_system_prompts():
    connection = None
    cur = None
    try:
        logger.info(f"Fetching system prompt for all users.")
        db_secret = get_secret(DB_SECRET_NAME)

        connection_params = {
            'dbname': db_secret["dbname"],
            'user': db_secret["username"],
            'password': db_secret["password"],
            'host': db_secret["host"],
            'port': db_secret["port"]
        }

        connection_string = " ".join([f"{key}={value}" for key, value in connection_params.items()])

        connection = psycopg2.connect(connection_string)
        cur = connection.cursor()
        logger.info("Connected to RDS instance!")

        cur.execute("""
            SELECT public, time_created
            FROM prompts
            WHERE public IS NOT NULL
            ORDER BY time_created DESC NULLS LAST
            LIMIT 1;
        """)
        
        result = cur.fetchone()
        logger.info(f"Query result: {result}")
        if result:
            public_prompt, time_created = result
            logger.info("Public Prompts fetched successfully.")
            print(public_prompt)
        else:
            logger.warning("No prompts found in the prompts table.")
            public_prompt = None

        cur.execute("""
            SELECT educator, time_created
            FROM prompts
            WHERE educator IS NOT NULL
            ORDER BY time_created DESC NULLS LAST
            LIMIT 1;
        """)
        
        result = cur.fetchone()
        logger.info(f"Query result: {result}")
        if result:
            educator_prompt, time_created = result
            logger.info("Educator Prompts fetched successfully.")
            print(educator_prompt)
        else:
            logger.warning("No prompts found in the prompts table.")
            educator_prompt = None
        
        cur.execute("""
            SELECT admin, time_created
            FROM prompts
            WHERE admin IS NOT NULL
            ORDER BY time_created DESC NULLS LAST
            LIMIT 1;
        """)
        
        result = cur.fetchone()
        logger.info(f"Query result: {result}")
        if result:
            admin_prompt, time_created = result
            logger.info("Educator Prompts fetched successfully.")
            print(admin_prompt)
        else:
            logger.warning("No prompts found in the prompts table.")
            admin_prompt = None

        return {
            'public_prompt': public_prompt,
            'educator_prompt': educator_prompt,
            'admin_prompt': admin_prompt
        }

    except Exception as e:
        logger.error(f"Error fetching system prompts: {e}")
        if connection:
            connection.rollback()
        return None
    finally:
        if cur:
            cur.close()
        if connection:
            connection.close()
        logger.info("Connection closed.")

def handler(event, context):
    logger.info("Text Generation Lambda function is called!")

    query_params = event.get("queryStringParameters", {})

    category_id = query_params.get("category_id", "")
    session_id = query_params.get("session_id", "")
    user_info = query_params.get("user_info", "")
    # session_name = query_params.get("session_name")

    if not category_id:
        logger.error("Missing required parameter: category_id")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: category_id')
        }

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

    logger.info("Fetching prompts from the database.")
    prompts = get_system_prompts()

    if prompts:
        public_prompt = prompts['public_prompt']
        educator_prompt = prompts['educator_prompt']
        admin_prompt = prompts['admin_prompt']

        logger.info(f"Fetched prompts - Public: {public_prompt}, Educator: {educator_prompt}, Admin: {admin_prompt}")
        # Use the prompts as needed
    else:
    # Handle the case where prompts are not available
        logger.error("Failed to retrieve system prompts.")

    if public_prompt is None:
        logger.error(f"Error fetching public prompt for you!")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error fetching public prompt')
        }

    if educator_prompt is None:
        logger.error(f"Error fetching educator prompt for you!")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error fetching educator prompt')
        }
    
    if admin_prompt is None:
        logger.error(f"Error fetching admin prompt for you!")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error fetching admin prompt')
        }
    
    
    body = {} if event.get("body") is None else json.loads(event.get("body"))
    question = body.get("message_content", "")
    user_role = body.get("user_role", "")
    
    # Check if user_role is provided after the initial greeting
    if user_role:
        logger.info(f"User role received: {user_role}")
    else:
        logger.info("Awaiting user role selection.")

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
            'collection_name': category_id,
            'dbname': db_secret["dbname"],
            'user': db_secret["username"],
            'password': db_secret["password"],
            'host': db_secret["host"],
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
            public_prompt=public_prompt,
            educator_prompt=educator_prompt,
            admin_prompt=admin_prompt
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