# helper.py

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
This script provides functionality for:
1. Initializing a PGVector-based vector store (via `get_vectorstore`).
2. Storing categorized documents from an Amazon S3 bucket into that vector store (via `store_category_data`).

It uses AWS’s `boto3` for S3 operations, `BedrockEmbeddings` for generating text embeddings, and `PGVector` (a PostgreSQL-based vector storage library) for storing those embeddings.

### Import Libraries <a name="import-libraries"></a>
- **logging**: For logging messages at different severity levels.
- **boto3**: AWS SDK for Python, used to manage S3 interactions.
- **typing**: Provides `Dict`, `Optional`, and `Tuple` for Python type hints.
- **psycopg2**: Postgres database adapter.
- **BedrockEmbeddings** (from `langchain_aws`): Custom embeddings wrapper to transform text into vector embeddings.
- **PGVector** (from `langchain_postgres`): Vector store implementation that persists vectors to a Postgres database.
- **process_documents** (from `processing.documents`): A function that processes and uploads documents to the vector store.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- **S3 Client** (`boto3.client('s3')`): Provides methods to interact with S3 objects, such as listing, uploading, or downloading.

### Helper Functions <a name="helper-functions"></a>
- **`get_vectorstore`**: Creates and returns a PGVector instance and a connection string, or `None` if initialization fails.

### Main Functions <a name="main-functions"></a>
- **`store_category_data`**: Fetches or initializes a vector store using `get_vectorstore`, and calls `process_documents` to index files from a specified category in an S3 bucket.

### Execution Flow <a name="execution-flow"></a>
1. **Initialize Vector Store**: `get_vectorstore` creates a Postgres connection string and PGVector instance.
2. **Process and Store Documents**: `store_category_data` calls `process_documents` to read and store documents from S3 into the vector store under a specified category.

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
    ...
```
#### Purpose
Creates a `PGVector` instance for storing vector embeddings, and returns the vector store alongside a connection string. If any error occurs, logs the exception and returns `None`.

#### Process Flow
1. Constructs the `postgresql+psycopg://` connection string using the provided credentials.
2. Instantiates a `PGVector` object with the provided embeddings, collection name, and connection details.
3. Returns `(vectorstore, connection_string)` or `None` on failure.

#### Inputs and Outputs
- **Inputs**:
  - `collection_name` (str): Name for the logical collection/scope of vectors.
  - `embeddings` (BedrockEmbeddings): Embeddings provider for text-vector transformations.
  - `dbname` (str): The target PostgreSQL database name.
  - `user` (str): Database username.
  - `password` (str): Database password.
  - `host` (str): Hostname or IP of the database server.
  - `port` (int): Port number for the database server.
- **Outputs**:
  - A tuple `(PGVector, str)` if successful, or `None` if any exception is raised during initialization.

[🔼 Back to top](#table-of-contents)

---

### Function: `store_category_data` <a name="store_category_data"></a>
```python
def store_category_data(
    bucket: str,
    category_id: str,
    vectorstore_config_dict: Dict[str, str], 
    embeddings: BedrockEmbeddings
) -> str:
    ...
```
#### Purpose
Orchestrates the retrieval or initialization of a PGVector store from configuration details, then processes documents from the specified `bucket/category_id` path in S3, and finally stores them in the vector store.

#### Process Flow
1. Calls `get_vectorstore` with `vectorstore_config_dict` to obtain `(vectorstore, connection_string)`.
2. Passes `vectorstore` to `process_documents`, which handles reading, embedding, and storing documents.
3. Returns a status message: `"SUCCESS"` if processing completes without restricted content, or an error message if restricted content is detected.

#### Inputs and Outputs
- **Inputs**:
  - `bucket` (str): The name of the S3 bucket containing documents.
  - `category_id` (str): A folder or category in S3 that holds the documents to be processed.
  - `vectorstore_config_dict` (Dict[str, str]): Contains database connection info and collection name (e.g., keys like `'collection_name', 'dbname', 'user', 'password', 'host', 'port'`).
  - `embeddings` (BedrockEmbeddings): Used to generate embeddings for the documents.
- **Outputs**:
  - A string indicating success or detailing an error from `process_documents`.

[🔼 Back to top](#table-of-contents)
