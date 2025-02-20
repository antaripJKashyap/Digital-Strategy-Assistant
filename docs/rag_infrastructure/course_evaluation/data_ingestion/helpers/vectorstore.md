# vectorstore.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
    - [Import Libraries](#import-libraries)
    - [AWS Configuration and Setup](#aws-configuration-and-setup)
    - [Helper Functions](#helper-functions)
    - [Main Functions](#main-functions)
    - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
    - [Function: `update_vectorstore`](#update_vectorstore)

---

## Script Overview <a name="script-overview"></a>
This script defines a single function, `update_vectorstore`, which updates a vector store with embeddings for documents and images located in an AWS S3 bucket. It interacts with a helper function, `store_category_data`, to perform the underlying data storage and embedding operations.

### Import Libraries <a name="import-libraries"></a>
- **typing.Dict**: Used for providing type hints for dictionaries.
- **helpers.helper.store_category_data**: A helper function that processes and stores data in a vector store, handling the ingestion and embedding creation.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- The function expects:
  - A bucket name (`bucket`) corresponding to an S3 bucket where documents and images reside.
  - A `category_id` representing the folder or category within the bucket to process.
- AWS credentials are assumed to be configured elsewhere, typically via environment variables or AWS CLI.

### Helper Functions <a name="helper-functions"></a>
- **store_category_data**: Performs data ingestion and embedding operations. It processes items in the specified `bucket` and `category_id` using the provided embeddings and vector store configuration.

### Main Functions <a name="main-functions"></a>
- **update_vectorstore**: Manages the embedding process for a given category in the S3 bucket by invoking `store_category_data` and returns a status message ("SUCCESS" or an error message).

### Execution Flow <a name="execution-flow"></a>
1. **Parameters**: The user supplies the S3 `bucket` name, `category_id`, vector store configuration dictionary, and an embeddings instance.
2. **update_vectorstore**: 
   - Calls `store_category_data` to ingest and process documents and images.
   - Receives either "SUCCESS" or an error message indicating restricted content conflicts.
3. **Output**: Returns the status message to the caller, which can then log or handle it accordingly.

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Function: `update_vectorstore` <a name="update_vectorstore"></a>
```python
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
        "SUCCESS" if all documents are processed without guardrail conflicts, 
             or an error message string if restricted content is detected.
    """
    message = store_category_data(
        bucket=bucket,
        category_id=category_id,
        vectorstore_config_dict=vectorstore_config_dict,
        embeddings=embeddings
    )

    return message
```
#### Purpose
- Orchestrates the update of a vector store by calling the `store_category_data` helper function, which processes documents and images from a specified `bucket` and `category_id` using the provided embeddings and vector store configuration.

#### Process Flow
1. Receives the S3 bucket name, the folder/category identifier, vector store configuration, and embeddings.
2. Calls `store_category_data` with these parameters to ingest and embed documents/images.
3. Returns the status message from `store_category_data`, which is either:
   - **"SUCCESS"** if the update completes without guardrail conflicts, or
   - **An error message** indicating detected restricted content.

#### Inputs and Outputs
- **Inputs**:
  - `bucket`: Name of the S3 bucket.
  - `category_id`: Folder or category within the S3 bucket to process.
  - `vectorstore_config_dict`: Dictionary of configuration parameters (database, host, port, user, etc.) for the vector store.
  - `embeddings`: Embedding instance (e.g., BedrockEmbeddings) to generate vector representations of text or images.
- **Outputs**:
  - Returns **"SUCCESS"** or an **error message string** based on the processing outcome.

[🔼 Back to top](#table-of-contents)
