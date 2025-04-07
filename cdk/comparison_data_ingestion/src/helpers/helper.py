import logging
import boto3
from typing import Dict, Optional, Tuple
import psycopg2
from langchain_aws import BedrockEmbeddings
from langchain_postgres import PGVector
from processing.documents import process_documents

# Create an S3 client using the boto3 library
s3 = boto3.client('s3')

# Setup logging at the INFO level for this module
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_vectorstore(
    collection_name: str, 
    embeddings: BedrockEmbeddings, 
    dbname: str, 
    user: str, 
    password: str, 
    host: str, 
    port: int
) -> Optional[Tuple[PGVector, str]]:
    """
    Initialize and return a PGVector instance along with a connection string.
    
    Note:
        - The return type is annotated as Optional[PGVector], but the function 
          actually returns a tuple (PGVector, str) upon success, or None upon error.
        - The connection string includes 'postgresql+psycopg', which may differ 
          from 'postgresql+psycopg2' if using psycopg2. Ensure the driver string 
          is compatible with the actual driver being used.

    Args:
        collection_name (str): The name of the collection where embeddings will be stored.
        embeddings (BedrockEmbeddings): The embeddings provider instance.
        dbname (str): The name of the PostgreSQL database to connect to.
        user (str): The database username.
        password (str): The database password.
        host (str): The hostname or IP address of the database server.
        port (int): The port number on which the database server is listening.
    
    Returns:
        Optional[PGVector, str]: 
            - On success, returns (PGVector, str), where PGVector is the vector store 
              and str is the connection string.
        Optional (str):
            - Returns None if an error occurred during initialization.
    """
    try:
        # Build the connection string
        connection_string = (
            f"postgresql+psycopg://{user}:{password}@{host}:{port}/{dbname}"
        )

        # Log the initialization process
        logger.info("Initializing the VectorStore")

        # Create the PGVector instance with the given parameters
        vectorstore = PGVector(
            embeddings=embeddings,
            collection_name=collection_name,
            connection=connection_string,
            use_jsonb=True
        )
        print(f"vectorstore in get_vectorstore")

        logger.info("VectorStore initialized")
        return vectorstore, connection_string

    except Exception as e:
        # Log and return None on any exception
        logger.error(f"Error initializing vector store: {e}")
        return None
    
def store_category_data(
    bucket: str,
    category_id: str,
    vectorstore_config_dict: Dict[str, str], 
    embeddings: BedrockEmbeddings
) -> str:
    """
    Retrieve a PGVector store, then process and store documents from a given S3 bucket 
    and category directory into the vector store.

    Args:
        bucket (str): The name of the S3 bucket containing the documents.
        category_id (str): The category or folder name in the S3 bucket.
        vectorstore_config_dict (Dict[str, str]): Configuration for connecting to 
            the vector store database. Should contain keys:
            'collection_name', 'dbname', 'user', 'password', 'host', and 'port'.
        embeddings (BedrockEmbeddings): The embeddings provider instance used 
            to transform text into vector embeddings.

    Returns:
        str: 
            - "SUCCESS" if documents are processed successfully without triggering 
              guardrail conflicts. 
            - Otherwise, an error message string if restricted content is detected.
    """
    # Obtain the vectorstore instance and connection string using the config dictionary
    vectorstore, connection_string = get_vectorstore(
        collection_name=vectorstore_config_dict['collection_name'],
        embeddings=embeddings,
        dbname=vectorstore_config_dict['dbname'],
        user=vectorstore_config_dict['user'],
        password=vectorstore_config_dict['password'],
        host=vectorstore_config_dict['host'],
        port=int(vectorstore_config_dict['port'])
    )
    print("vector_store in store category data", vectorstore)

    # Process documents from S3 and store them in the vectorstore
    message = process_documents(
        bucket=bucket,
        category_id=category_id,
        vectorstore=vectorstore
    )

    # Return the result of the document processing
    return message
