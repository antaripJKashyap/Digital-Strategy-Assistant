from typing import Dict

from langchain_core.vectorstores import VectorStoreRetriever
from helpers.helper import get_vectorstore


def get_vectorstore_retriever_ordinary(
    vectorstore_config_dict: Dict[str, str],
    embeddings  # : BedrockEmbeddings
) -> VectorStoreRetriever:
    """
    Retrieve the vectorstore and return an ordinary (non-history aware) retriever,
    along with the vectorstore itself.

    Args:
        vectorstore_config_dict (Dict[str, str]): The configuration dictionary
            for the vectorstore, including parameters like collection name,
            database name, user, password, host, and port.
        embeddings (BedrockEmbeddings): The embeddings instance used to process
            the documents.

    Returns:
        (VectorStoreRetriever, VectorStore): A tuple containing:
            - An ordinary (non-history aware) retriever instance.
            - The vectorstore instance.
    """
    vectorstore, _ = get_vectorstore(
        collection_name=vectorstore_config_dict['collection_name'],
        embeddings=embeddings,
        dbname=vectorstore_config_dict['dbname'],
        user=vectorstore_config_dict['user'],
        password=vectorstore_config_dict['password'],
        host=vectorstore_config_dict['host'],
        port=int(vectorstore_config_dict['port'])
    )
    
    return vectorstore.as_retriever(search_kwargs={'k': 5}), vectorstore
