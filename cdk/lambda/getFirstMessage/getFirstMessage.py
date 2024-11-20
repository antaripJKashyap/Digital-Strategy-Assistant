from aws_lambda_powertools import Logger
import os
import boto3
import psycopg2
import json

logger = Logger()

# Environment variables
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

def get_secret():
    """Fetch database credentials from AWS Secrets Manager."""
    sm_client = boto3.client("secretsmanager")
    response = sm_client.get_secret_value(SecretId=DB_SECRET_NAME)["SecretString"]
    secret = json.loads(response)
    return secret

def connect_to_db():
    """Establish a connection to the database using credentials from Secrets Manager."""
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
        logger.error(f"Failed to connect to the database: {e}")
        return None

def get_second_engagement_from_db(user_role):
    """Fetch the second engagement detail for each session from the database."""
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return None

    try:
        cur = connection.cursor()

        # Query to get the second engagement detail for every session
        query = """
            WITH ranked_engagements AS (
                SELECT 
                    session_id,
                    engagement_details,
                    timestamp,
                    ROW_NUMBER() OVER (
                        PARTITION BY session_id 
                        ORDER BY timestamp ASC
                    ) AS row_num
                FROM user_engagement_log
                WHERE user_role = %s
                  AND session_id IS NOT NULL
                  AND engagement_type = 'message creation'
            )
            SELECT session_id, 
                   MAX(timestamp) OVER (PARTITION BY session_id) AS last_message_time,
                   engagement_details
            FROM ranked_engagements
            WHERE row_num = 2;
        """
        cur.execute(query, (user_role,))
        results = cur.fetchall()

        # Format the results into a list of dictionaries
        formatted_results = [
            {
                "session_id": row[0],
                "last_message_time": row[1].isoformat(),
                "engagement_detail": row[2]
            }
            for row in results
        ]

        cur.close()
        connection.close()
        return formatted_results
    except Exception as e:
        if connection:
            connection.rollback()
            connection.close()
        logger.error(f"Error fetching second engagement details from database: {e}")
        raise


@logger.inject_lambda_context
def lambda_handler(event, context):
    """AWS Lambda handler to fetch second engagement details based on user_role."""
    query_params = event.get("queryStringParameters", {})

    user_role = query_params.get("user_role", "")

    if not user_role:
        logger.error("Missing required parameters", extra={"user_role": user_role})
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: user_role')
        }

    try:
        # Retrieve the second engagement details for the given user_role
        results = get_second_engagement_from_db(user_role)

        if results is None:
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Failed to fetch engagement details from the database.')
            }

        return {
            'statusCode': 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps(results)
        }
    except Exception as e:
        logger.exception(f"Error fetching engagement details: {e}")
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
