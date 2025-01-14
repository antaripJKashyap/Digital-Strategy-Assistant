from typing import Dict

from langchain_core.vectorstores import VectorStoreRetriever
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever

from helpers.helper import get_vectorstore


def get_vectorstore_retriever_ordinary(
    llm,
    vectorstore_config_dict: Dict[str, str],
    embeddings#: BedrockEmbeddings
) -> VectorStoreRetriever:
    """
    Retrieve the vectorstore and directly return it.

    Args:
    llm: The language model instance used to generate the response.
    vectorstore_config_dict (Dict[str, str]): The configuration dictionary for the vectorstore, including parameters like collection name, database name, user, password, host, and port.
    embeddings (BedrockEmbeddings): The embeddings instance used to process the documents.

    Returns:
    VectorStoreRetriever: An ordinary (non-history aware) retriever instance.
    """
    print("inside get_vectorstore_retriever_ordinary")
    vectorstore, _ = get_vectorstore(
        collection_name=vectorstore_config_dict['collection_name'],
        embeddings=embeddings,
        dbname=vectorstore_config_dict['dbname'],
        user=vectorstore_config_dict['user'],
        password=vectorstore_config_dict['password'],
        host=vectorstore_config_dict['host'],
        port=int(vectorstore_config_dict['port'])
    )

    print(f"Collection name INSIDE get_vectorstore_retriever_ordinary: {vectorstore_config_dict['collection_name']}")

    return vectorstore.as_retriever(search_kwargs={'k': 5}), vectorstore
