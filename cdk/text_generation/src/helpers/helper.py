import logging
from typing import Optional, Tuple

import psycopg2
from langchain_aws import BedrockEmbeddings
from langchain_postgres import PGVector

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
    Initialize and return a PGVector vector store along with its connection string.

    This function constructs a PostgreSQL connection string using the provided database
    parameters, initializes a PGVector instance for managing vector embeddings, and returns
    both the vectorstore instance and the connection string.

    Args:
        collection_name (str): The name of the vector collection.
        embeddings (BedrockEmbeddings): The embeddings instance used to process data.
        dbname (str): The name of the PostgreSQL database.
        user (str): The database username.
        password (str): The database password.
        host (str): The database host address.
        port (int): The port on which the database is running.

    Returns:
        Optional[Tuple[PGVector, str]]: A tuple containing the initialized PGVector instance
        and its connection string, or None if an error occurs during initialization.
    """
    
    try:
        connection_string = (
            f"postgresql+psycopg://{user}:{password}@{host}:{port}/{dbname}"
        )
        
        
        logger.info("Initializing the VectorStore")
        vectorstore = PGVector(
            embeddings=embeddings,
            collection_name=collection_name,
            connection=connection_string,
            use_jsonb=True
        )
        
        logger.info("VectorStore initialized")
        return vectorstore, connection_string

    except Exception as e:
        logger.error(f"Error initializing vector store: {e}")
        return None
