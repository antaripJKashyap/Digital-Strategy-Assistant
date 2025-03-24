# vectorstore.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
    - [Import Libraries](#import-libraries)
    - [AWS Configuration and Setup](#aws-configuration-and-setup)
    - [Helper Functions](#helper-functions)
    - [Main Functions](#main-functions)
    - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
    - [Function: `get_vectorstore`](#get_vectorstore)
    - [Function: `store_category_data`](#store_category_data)

---

## Script Overview <a name="script-overview"></a>
This script provides functionality for initializing and configuring a PGVector-based vector store and then ingesting data (documents) from an AWS S3 bucket into that vector store. It also manages metadata records in a PostgreSQL database via `langchain.indexes.SQLRecordManager`.

### Import Libraries <a name="import-libraries"></a>
- **logging**: For logging script activities and errors.
- **boto3**: AWS SDK for Python, used here to instantiate the S3 client.
- **typing (Dict, Optional, Tuple)**: For type hints.
- **psycopg2**: PostgreSQL database adapter for Python (used by `langchain_postgres.PGVector` under the hood).
- **langchain_aws.BedrockEmbeddings**: Manages embedding generation for text data.
- **langchain_postgres.PGVector**: Stores and retrieves embeddings in a PostgreSQL database with the pgvector extension.
- **langchain.indexes.SQLRecordManager**: A manager for indexing and storing metadata about documents.
- **processing.documents.process_documents**: Custom function (presumably) that processes documents from S3 and ingests them into the vector store.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- **boto3.client('s3')**: Initializes the S3 client for downloading, uploading, or listing objects from an S3 bucket.

### Helper Functions <a name="helper-functions"></a>
The main helper function is `get_vectorstore`, which constructs and returns a PGVector instance (and its connection string).

### Main Functions <a name="main-functions"></a>
1. **`store_category_data`**: Coordinates the ingestion process of documents from a specified S3 bucket and category into the PGVector store.

### Execution Flow <a name="execution-flow"></a>
1. `get_vectorstore` is called to initialize the vector store and retrieve a connection string.
2. Once the vector store is established, `store_category_data` sets up the schema via `SQLRecordManager`, then calls the external `process_documents` function to ingest documents from S3 into the vector store.

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Function: `get_vectorstore` <a name="get_vectorstore"></a>
```python
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
```

#### Purpose
Creates a vector store instance that leverages pgvector for storing and retrieving embeddings, and constructs the database connection string.

#### Process Flow
1. Builds the connection string for the PostgreSQL database.
2. Instantiates a `PGVector` object, passing the necessary embeddings, collection name, and connection details.
3. Logs success or failure, returning the `(vectorstore, connection_string)` tuple or `None` if an error occurs.

#### Inputs and Outputs
- **Inputs**:
  - `collection_name`: Name of the PGVector collection to use.
  - `embeddings`: Embeddings handler (e.g., Amazon Bedrock-based).
  - `dbname`: Name of the Postgres database.
  - `user`: Username for Postgres.
  - `password`: Password for Postgres.
  - `host`: Hostname or IP where Postgres is running.
  - `port`: Port number for Postgres.
- **Outputs**:
  - A tuple `(PGVector, str)` if successful, representing the vector store instance and its connection string.
  - `None` if an exception occurs.

---

### Function: `store_category_data` <a name="store_category_data"></a>
```python
def store_category_data(
    bucket: str,
    category_id: str,
    vectorstore_config_dict: Dict[str, str], 
    embeddings: BedrockEmbeddings
) -> None:
    """
    Store data from an S3 bucket into a PGVector-backed vector store.

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
```

#### Purpose
Coordinates the process of ingesting documents from a specific S3 bucket category into a PGVector store.

#### Process Flow
1. Calls `get_vectorstore` to initialize the PGVector instance and retrieve the connection string.
2. Creates or updates the schema needed to store metadata using `SQLRecordManager`.
3. Calls `process_documents` (an external function) to fetch, process, and store documents from S3 into the vector store.
4. Logs the outcome.

#### Inputs and Outputs
- **Inputs**:
  - `bucket`: The name of the S3 bucket containing the documents.
  - `category_id`: Identifier for a sub-folder or category within the S3 bucket.
  - `vectorstore_config_dict`: A dictionary containing database and collection config (e.g., collection name, DB credentials).
  - `embeddings`: The embeddings instance to generate vector embeddings for the documents.
- **Outputs**:
  - `None` (documents are processed and stored; no direct return).

[🔼 Back to top](#table-of-contents)
