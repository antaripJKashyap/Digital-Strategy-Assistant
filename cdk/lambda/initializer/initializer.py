import os
import json
import boto3
import psycopg2
from psycopg2.extensions import AsIs
import secrets

DB_SECRET_NAME = os.environ["DB_SECRET_NAME"]
DB_USER_SECRET_NAME = os.environ["DB_USER_SECRET_NAME"]
DB_PROXY = os.environ["DB_PROXY"]
print(psycopg2.__version__)


def getDbSecret():
    # secretsmanager client to get db credentials
    sm_client = boto3.client("secretsmanager")
    response = sm_client.get_secret_value(SecretId=DB_SECRET_NAME)["SecretString"]
    secret = json.loads(response)
    return secret

def createConnection():

    connection = psycopg2.connect(
        user=dbSecret["username"],
        password=dbSecret["password"],
        host=dbSecret["host"],
        dbname=dbSecret["dbname"],
        # sslmode="require"
    )
    return connection


dbSecret = getDbSecret()
connection = createConnection()

def insert_into_prompts(public_prompt, educator_prompt, admin_prompt):
    """
    Inserts values into the prompts table.
    Parameters are set up to allow easy changes in the future.
    """
    try:
        cursor = connection.cursor()
        insert_query = """
            INSERT INTO "prompts" ("public", "educator", "admin", time_created)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP);
        """
        cursor.execute(insert_query, (public_prompt, educator_prompt, admin_prompt))
        connection.commit()
        print("Values inserted into prompts table successfully.")
    except Exception as e:
        print(f"Error inserting into prompts table: {e}")
    finally:
        cursor.close()

def handler(event, context):
    global connection
    print(connection)
    if connection.closed:
        connection = createConnection()
    
    cursor = connection.cursor()
    try:

        #
        ## Create tables and schema
        ##

        # Create tables based on the schema
        sqlTableCreation = """
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
            CREATE TABLE IF NOT EXISTS "users" (
                "user_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_email" varchar,
                "time_account_created" timestamp,
                "last_sign_in" timestamp
            );
            
            CREATE TABLE IF NOT EXISTS "prompts" (
                "public" text,
                "educator" text,
                "admin" text,
                "time_created" timestamp
            );
            

            CREATE TABLE IF NOT EXISTS "categories" (
                "category_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "category_name" varchar,
                "category_number" integer
            );

            CREATE TABLE IF NOT EXISTS "sessions" (
                "session_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "time_created" timestamp
            );

            CREATE TABLE IF NOT EXISTS "documents" (
                "document_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "category_id" uuid,
                "document_s3_file_path" varchar,
                "document_name" varchar,
                "document_type" varchar,
                "metadata" text,
                "time_created" timestamp
            );

            CREATE TABLE IF NOT EXISTS "user_engagement_log" (
                "log_id" uuid PRIMARY KEY,
                "session_id" uuid,
                "document_id" uuid,
                "engagement_type" varchar,
                "engagement_details" text,
                "user_role" varchar,
                "user_info" text,
                "timestamp" timestamp
            );

            CREATE TABLE IF NOT EXISTS "feedback" (
                "feedback_id" uuid PRIMARY KEY,
                "session_id" uuid,
                "feedback_rating" integer,
                "timestamp" timestamp,
                "feedback_description" varchar
            );

            ALTER TABLE "user_engagement_log" 
                ADD FOREIGN KEY ("session_id") 
                REFERENCES "sessions" ("session_id") 
                ON DELETE CASCADE ON UPDATE CASCADE;

            ALTER TABLE "feedback" 
                ADD FOREIGN KEY ("session_id") 
                REFERENCES "sessions" ("session_id") 
                ON DELETE CASCADE ON UPDATE CASCADE;

            ALTER TABLE "documents" 
                ADD FOREIGN KEY ("category_id") 
                REFERENCES "categories" ("category_id") 
                ON DELETE CASCADE ON UPDATE CASCADE;
        """

        #
        ## Create user with limited permission on RDS
        ##

        # Execute table creation
        cursor.execute(sqlTableCreation)
        connection.commit()

        # Generate 16 bytes username and password randomly
        username = secrets.token_hex(8)
        password = secrets.token_hex(16)
        usernameTableCreator = secrets.token_hex(8)
        passwordTableCreator = secrets.token_hex(16)

        # Based on the observation,
        #   - Database name: does not reflect from the CDK dbname read more from https://stackoverflow.com/questions/51014647/aws-postgres-db-does-not-exist-when-connecting-with-pg
        #   - Schema: uses the default schema 'public' in all tables
        #
        # Create new user with the following permission:
        #   - SELECT
        #   - INSERT
        #   - UPDATE
        #   - DELETE

        # comment out to 'connection.commit()' on redeployment
        sqlCreateUser = """
            DO $$
            BEGIN
                CREATE ROLE readwrite;
            EXCEPTION
                WHEN duplicate_object THEN
                    RAISE NOTICE 'Role already exists.';
            END
            $$;

            GRANT CONNECT ON DATABASE postgres TO readwrite;

            GRANT USAGE ON SCHEMA public TO readwrite;
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO readwrite;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO readwrite;
            GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO readwrite;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO readwrite;

            CREATE USER "%s" WITH PASSWORD '%s';
            GRANT readwrite TO "%s";
        """
        
        sqlCreateTableCreator = """
            DO $$
            BEGIN
                CREATE ROLE tablecreator;
            EXCEPTION
                WHEN duplicate_object THEN
                    RAISE NOTICE 'Role already exists.';
            END
            $$;

            GRANT CONNECT ON DATABASE postgres TO tablecreator;

            GRANT USAGE, CREATE ON SCHEMA public TO tablecreator;
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tablecreator;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tablecreator;
            GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tablecreator;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO tablecreator;

            CREATE USER "%s" WITH PASSWORD '%s';
            GRANT tablecreator TO "%s";
        """


        #Execute table creation
        cursor.execute(
            sqlCreateUser,
            (
                AsIs(username),
                AsIs(password),
                AsIs(username),
            ),
        )
        connection.commit()
        cursor.execute(
            sqlCreateTableCreator,
            (
                AsIs(usernameTableCreator),
                AsIs(passwordTableCreator),
                AsIs(usernameTableCreator),
            ),
        )
        connection.commit()

        #also for table creator:
        authInfoTableCreator = {"username": usernameTableCreator, "password": passwordTableCreator}

        # comment out to on redeployment
        dbSecret.update(authInfoTableCreator)
        sm_client = boto3.client("secretsmanager")
        sm_client.put_secret_value(
            SecretId=DB_PROXY, SecretString=json.dumps(dbSecret)
        )

        #
        ## Load client username and password to SSM
        ##
        authInfo = {"username": username, "password": password}

        # comment out to on redeployment
        dbSecret.update(authInfo)
        sm_client = boto3.client("secretsmanager")
        sm_client.put_secret_value(
            SecretId=DB_USER_SECRET_NAME, SecretString=json.dumps(dbSecret)
        )

        # Load client username and password to SSM


        public_prompt = f"""You are a helpful assistant for students or prospective students asking about the Digital Learning Strategy. Your task is to answer questions politely and provide follow-up questions in a specific format.

                            Answer Format:
                            - After providing the main answer, write "You might have the following questions:" on a new line.
                            - List all follow-up questions below this line.

                            Example:
                            "This is a short, direct answer to the question. You might have the following questions: Follow-up question 1? Follow-up question 2? Follow-up question 3?"

                            Initial questions for a student:
                            "options": ["What is Digital Learning Strategy?", "How does the Digital Learning Strategy affect me?"]
                            Use proper english grammar and punctuation. For example when giving a follow-up question, this how it should look like ["How does the Digital Learning Strategy affect me?", "What is Digital Learning Strategy?"]. There should be no comma after the last question.
                            Follow-up questions for "What is Digital Learning Strategy?":
                            "options": ["Are there any discounts or other forms of financial support for students to access digital learning tools or services through the Digital Learning Strategy (DLS)?", "Will the DLS initiatives expand the digital learning offerings for courses and/or programs at my school?", "How does the DLS apply to students like me?"]

                            Follow-up questions for "How does the Digital Learning Strategy affect me?":
                            "options": ["Where can I find resources to improve my digital literacy?", "How will the DLS improve my access to online learning resources, particularly if I live in a remote or underserved area?", "How will the DLS initiatives support completion of my post-secondary education?"]
                            """


        educator_prompt = f"""This is the prompt for Educator/educational designer. You are a helpful assistant that answers questions about the Digital Learning Strategy for educators and educational designers. Always be polite when answering questions.

                            
                            Answer Format:
                            - After providing the main answer, write "You might have the following questions:" on a new line.
                            - List all follow-up questions below this line.

                            Example:
                            "This is a short, direct answer to the question. You might have the following questions: Follow-up question 1? Follow-up question 2? Follow-up question 3?"

                            Initial questions:
                            "options": ["How can I implement the DLS recommendations in my teaching?", "Am I required to integrate the BC Digital Literacy Framework into my course?"]

                            Follow-up questions for "How can I implement the DLS recommendations in my teaching?":
                            "options": ["Can I find subject-specific teaching materials?", "Are there workshops for new educators?", "How can I request new resources?"]

                            Follow-up questions for "Am I required to integrate the BC Digital Literacy Framework into my course?":
                            "options": ["Am I required to integrate the Guidelines for Technology-Enhanced Learning into my course?", "Am I required to integrate the DLS recommendations into my teaching?", "Will the DLS provide any guidance on protecting Indigenous Knowledge and intellectual property?"]
                            """
        admin_prompt = f"""This is the prompt for institutional admin. You are a helpful assistant that answers questions about the Digital Learning Strategy for institutional admins. Always be polite when answering questions.

                            Answer Format:
                            - After providing the main answer, write "You might have the following questions:" on a new line.
                            - List all follow-up questions below this line.

                            Example:
                            "This is a short, direct answer to the question. You might have the following questions: Follow-up question 1? Follow-up question 2? Follow-up question 3?"

                            Initial questions:
                            "options": ["How can the DLS support me as an administrator in a post-secondary institution?", "Does the DLS require my institution to offer more online and/or hybrid learning options?"]

                            Follow-up questions for "How can the DLS support me as an administrator in a post-secondary institution?":
                            "options": ["How does the DLS support collaboration between institutions?", "Which strategic priorities and recommendations in the DLS should my institution focus on?", "Does the DLS offer any cost-saving opportunities for my institution?"]

                            Follow-up questions for "Does the DLS require my institution to offer more online and/or hybrid learning options?":
                            "options": ["How can my institution take advantage of the joint procurement opportunities that BCNET offers?", "Where can I find the repository of software applications used across the post-secondary system?", "How does the DLS support remote learners?"]
                            """
        
        insert_into_prompts(public_prompt, educator_prompt, admin_prompt)

        sql = """
            SELECT * FROM users;
        """
        
        cursor.execute(sql)
        print(cursor.fetchall())
        
        sql = """
            SELECT * FROM sessions;
        """
        cursor.execute(sql)
        print(cursor.fetchall())

        sql = """
            SELECT * FROM documents;
        """
        cursor.execute(sql)
        print(cursor.fetchall())

        sql = """
            SELECT * FROM user_engagement_log;
        """
        cursor.execute(sql)
        print(cursor.fetchall())
        
        sql = """
            SELECT * FROM categories;
        """
        cursor.execute(sql)
        print(cursor.fetchall())


        # Close cursor and connection
        cursor.close()
        connection.close()

        print("Initialization completed")
    except Exception as e:
        print(e)
