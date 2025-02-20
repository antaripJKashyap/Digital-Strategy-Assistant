from typing import Dict
from helpers.helper import store_category_data

def update_vectorstore(
    bucket: str,
    category_id: str,
    vectorstore_config_dict: Dict[str, str],
    embeddings #: BedrockEmbeddings
) -> str:
    """
    Update the vectorstore with embeddings for all documents and images in the S3 bucket.

    Args:
        bucket (str): The name of the S3 bucket containing the course folders.
        category_id (str): The name of the folder within the S3 bucket.
        vectorstore_config_dict (Dict[str, str]): The configuration dictionary for the vectorstore,
            including parameters like collection name, database name, user, password, host, and port.
        embeddings (BedrockEmbeddings): The embeddings instance used to process the documents and images.

    Returns:
        str: 
            - "SUCCESS" if documents are processed successfully without triggering 
              guardrail conflicts. 
            - Otherwise, an error message string if restricted content is detected.
    """
    # Call the helper function `store_category_data` to process and store data
    # for the given bucket and category using the provided embeddings and vectorstore config.
    
    message = store_category_data(
        bucket=bucket,
        category_id=category_id,
        vectorstore_config_dict=vectorstore_config_dict,
        embeddings=embeddings
    )

    # Return the message (either "SUCCESS" or error message) to the caller so that any status or result information 
    # can be captured or logged outside this function.
    return message
