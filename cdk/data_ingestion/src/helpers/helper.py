import logging
import boto3
from typing import Dict, Optional, Tuple
import psycopg2
from langchain_aws import BedrockEmbeddings
from langchain_postgres import PGVector
from langchain.indexes import SQLRecordManager

from processing.documents import process_documents

s3 = boto3.client('s3')

# Setup logging
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
    Initialize and return a PGVector instance along with its connection string.

    Args:
        collection_name (str): The name of the PGVector collection.
        embeddings (BedrockEmbeddings): An instance that provides vector embeddings.
        dbname (str): The name of the PostgreSQL database.
        user (str): The database user.
        password (str): The database password.
        host (str): The database host address.
        port (int): The database port number.

    Returns:
        Optional[Tuple[PGVector, str]]: 
            - If successful, returns a tuple containing:
                - PGVector: The initialized PGVector instance.
                - str: The database connection string.
            - If an error occurs, returns None.
    """
    try:
        connection_string = (
            f"postgresql+psycopg://{user}:{password}@{host}:{port}/{dbname}"
        )

        logger.info("Initializing the VectorStore...")
        vectorstore = PGVector(
            embeddings=embeddings,
            collection_name=collection_name,
            connection=connection_string,
            use_jsonb=True
        )

        logger.info("VectorStore initialized successfully.")
        return vectorstore, connection_string

    except Exception as e:
        logger.error(f"Error initializing vector store: {e}")
        return None


def store_category_data(
    bucket: str,
    category_id: str,
    vectorstore_config_dict: Dict[str, str], 
    embeddings: BedrockEmbeddings
) -> None:
    """
    Store course data from an S3 bucket into a PGVector-backed vector store.

    This function:
      1. Initializes a PGVector instance using the provided configuration.
      2. Creates the necessary schema (if it does not already exist).
      3. Processes all relevant documents from the specified category in S3.
      4. Stores vectorized versions of those documents in the vector store.

    Args:
        bucket (str): Name of the S3 bucket containing the document data.
        category_id (str): Identifier for the document category in the S3 bucket.
        vectorstore_config_dict (Dict[str, str]): Configuration for the vectorstore, 
            which must include the keys:
                - 'collection_name': Name of the PGVector collection.
                - 'dbname': Name of the PostgreSQL database.
                - 'user': Database user.
                - 'password': Database password.
                - 'host': Database host.
                - 'port': Database port number.
        embeddings (BedrockEmbeddings): The embeddings instance for vectorizing documents.

    Returns:
        None
    """
    vectorstore_and_conn = get_vectorstore(
        collection_name=vectorstore_config_dict['collection_name'],
        embeddings=embeddings,
        dbname=vectorstore_config_dict['dbname'],
        user=vectorstore_config_dict['user'],
        password=vectorstore_config_dict['password'],
        host=vectorstore_config_dict['host'],
        port=int(vectorstore_config_dict['port'])
    )

    if not vectorstore_and_conn:
        logger.error("VectorStore could not be initialized. Exiting.")
        return

    vectorstore, connection_string = vectorstore_and_conn

    # Create and configure the record manager
    namespace = f"pgvector/{vectorstore_config_dict['collection_name']}"
    record_manager = SQLRecordManager(namespace, db_url=connection_string)
    record_manager.create_schema()
    logger.info("RecordManager schema ensured/created.")

    # Process and ingest documents
    process_documents(
        bucket=bucket,
        category_id=category_id,
        vectorstore=vectorstore,
        embeddings=embeddings,
        record_manager=record_manager
    )
    logger.info("Documents processed and stored successfully.")
