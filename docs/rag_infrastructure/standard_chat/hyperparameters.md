# Hyperparameters in `standard_chat`

## Table of Contents <a name="table-of-contents"></a>
1. [LLM Configuration](#llm-configuration)
2. [PGVector Configuration](#pgvector-configuration)  
   2.1. Data Ingestion PGVector  
   2.2. Text Generation PGVector
3. [Indexing Behavior](#indexing-behavior)
4. [Environment Variables](#environment-variables)  
   4.1. Data Ingestion Environment Variables
   4.2. Text Generation Environment Variables

---

## 1. LLM Configuration <a name="llm-configuration"></a>

In **`cdk/text_generation/src/helpers/chat.py`**, the Bedrock LLM is configured with:

```python
def get_bedrock_llm(bedrock_llm_id: str, temperature: float = 0) -> ChatBedrock:
    return ChatBedrock(
        model_id=bedrock_llm_id,
        model_kwargs=dict(temperature=temperature),
    )
```

| **Parameter**    | **Purpose**                                                                  | **Current Value**                                   | **Acceptable Values**                                                                    | **Location**                                                         |
|------------------|------------------------------------------------------------------------------|-----------------------------------------------------|------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| `bedrock_llm_id` | Identifies which Bedrock model (e.g., Claude, Titan, etc.) to use for chat.   | Retrieved from `BEDROCK_LLM_PARAM` at runtime.      | Must match a valid Bedrock model ID (e.g., `"anthropic.claude-v1"`, `"amazon.titan-text-large-v1"`). | **`cdk/text_generation/src/helpers/chat.py`** (`get_bedrock_llm()`) |
| `temperature`    | Controls randomness of the generated text.                                   | `0` (default)                                       | A float typically between 0 and 1 (some models accept up to 5.0). Higher values = more creative outputs. | **`cdk/text_generation/src/helpers/chat.py`** (`get_bedrock_llm()`) |

[🔼 Back to top](#table-of-contents)

---

## 2. PGVector Configuration <a name="pgvector-configuration"></a>

This section covers how `PGVector` is configured in both the Data Ingestion and Text Generation pipelines.

### 2.1. Data Ingestion PGVector

In **`cdk/data_ingestion/src/helpers/helper.py`**, the `get_vectorstore` function initializes the `PGVector` instance:

```python
vectorstore = PGVector(
    embeddings=embeddings,
    collection_name=collection_name,
    connection=connection_string,
    use_jsonb=True
)
```

| **Parameter**     | **Purpose**                                             | **Current Value**                                       | **Acceptable Values**                          | **Location**                                           |
|-------------------|---------------------------------------------------------|---------------------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| `collection_name` | Identifies the collection (schema/table) used by PGVector. | Set to a string from `vectorstore_config_dict`.           | Any valid string (e.g., `"my_collection"`).     | **`cdk/data_ingestion/src/helpers/helper.py`** in `get_vectorstore()` |
| `use_jsonb`       | Determines if chunk metadata is stored in a JSONB column. | `True`                                                  | `True` or `False`                              | **`cdk/data_ingestion/src/helpers/helper.py`** in `PGVector(...)`      |
| `connection`      | Connection string for the PostgreSQL database.          | Derived from the environment’s secrets and parameters.  | Must be a valid Postgres connection URI.       | **`cdk/data_ingestion/src/helpers/helper.py`** in `get_vectorstore()`  |

---

### 2.2. Text Generation PGVector

In **`cdk/text_generation/src/helpers/helper.py`**, the `get_vectorstore` function also initializes a `PGVector` instance:

```python
vectorstore = PGVector(
    embeddings=embeddings,
    collection_name=collection_name,
    connection=connection_string,
    use_jsonb=True
)
```

| **Parameter**     | **Purpose**                                                           | **Current Value**                                                                            | **Acceptable Values**                           | **Location**                                              |
|-------------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------------|-------------------------------------------------|-----------------------------------------------------------|
| `collection_name` | Identifies which schema or table PGVector uses for storing embeddings. | Derived from `vectorstore_config_dict['collection_name']` in `cdk/text_generation/src/main.py`. | Any valid Postgres identifier (e.g., `"all"`).   | **`cdk/text_generation/src/helpers/helper.py`** (`get_vectorstore()`) |
| `connection`      | PostgreSQL connection string passed to PGVector.                      | Built in `get_vectorstore()` using secrets (`dbname`, `user`, `password`, etc.).            | Must be a valid Postgres connection URI.         | **`cdk/text_generation/src/helpers/helper.py`** (`get_vectorstore()`) |
| `use_jsonb`       | Determines if chunk metadata is stored as JSONB in Postgres.          | `True`                                                                                      | `True` or `False`.                               | **`cdk/text_generation/src/helpers/helper.py`** (`PGVector(...)`)     |


[🔼 Back to top](#table-of-contents)

---

## 3. Indexing Behavior <a name="indexing-behavior"></a>

In **`cdk/data_ingestion/src/processing/documents.py`**, the `process_documents` function calls the `index(...)` utility:

```python
idx = index(
    all_doc_chunks,
    record_manager,
    vectorstore,
    cleanup="full",
    source_id_key="source"
)
```

| **Parameter**       | **Purpose**                                          | **Current Value**                                  | **Acceptable Values**                                        | **Location**                                                    |
|---------------------|------------------------------------------------------|----------------------------------------------------|---------------------------------------------------------------|-----------------------------------------------------------------|
| `cleanup`           | Determines how stale records are removed.           | `"full"` (Removes any previous records not present in the new chunk set.) | `"full"`, `"none"`, `"incremental"`, or `"scoped_full"`        | **`cdk/data_ingestion/src/processing/documents.py`** in the `index(...)` call |
| `source_id_key`     | Identifies the source key in each chunk’s metadata. | `"source"`                                        | Any string matching a metadata field                          | **`cdk/data_ingestion/src/processing/documents.py`** in the `index(...)` call |


[🔼 Back to top](#table-of-contents)

---

## 4. Environment Variables <a name="environment-variables"></a>

Below are the environment variables used in both the Data Ingestion and Text Generation workflows.

### 4.1. Data Ingestion Environment Variables

These variables are set in the Lambda environment. They are accessed by **`cdk/data_ingestion/src/main.py`** (and other modules) to configure the pipeline.

| **Variable**                   | **Purpose**                                                                                                           | **Usage**                                                                                                              | **Acceptable Values**                                                  | **Code Location**                                                                                 |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `SM_DB_CREDENTIALS`            | Refers to the name of the AWS Secrets Manager secret storing the database credentials (username, password, etc.).     | Fetched by `get_secret()` to obtain the DB credentials.                                                               | Must match the name of a valid secret in AWS Secrets Manager.            | **`cdk/data_ingestion/src/main.py`** (used in `get_secret()`)                                    |
| `REGION`                       | Specifies the AWS Region for services such as Bedrock and S3.                                                         | Configures the Boto3 client (`bedrock-runtime`).                                                                       | Any valid AWS Region (e.g., `"us-east-1"`, `"us-west-2"`).              | **`cdk/data_ingestion/src/main.py`** (passed to `boto3.client("bedrock-runtime", region_name=REGION)`) |
| `BUCKET`                       | Identifies the S3 bucket that triggers ingestion upon file upload.                                                    | Stored in `DSA_DATA_INGESTION_BUCKET`. Lambda handler filters events from this bucket.                                 | Must be a valid S3 bucket name.                                          | **`cdk/data_ingestion/src/main.py`** (used in `handler()` to validate the event’s S3 bucket)     |
| `RDS_PROXY_ENDPOINT`           | Specifies the endpoint for Amazon RDS Proxy that provides connectivity to the Postgres database.                      | Incorporated into `connect_to_db()` for the DB host.                                                                   | Must be a valid RDS Proxy endpoint (e.g., `my-proxy.proxy-xxx.us-east-1.rds.amazonaws.com`). | **`cdk/data_ingestion/src/main.py`** (used in `connect_to_db()`)                                 |
| `EMBEDDING_BUCKET_NAME`        | Indicates the S3 bucket where extracted text files or embedding artifacts are stored.                                  | Used in intermediate steps for storing `.txt` page outputs.                                                            | Must be a valid S3 bucket name.                                          | **`cdk/data_ingestion/src/main.py`** (referenced in `update_vectorstore_from_s3()`), **`cdk/data_ingestion/src/processing/documents.py` (store_doc_texts)** |
| `EMBEDDING_MODEL_PARAM`        | Points to a parameter in AWS Systems Manager (SSM) that holds the Bedrock embedding model ID.                         | Fetched by `get_parameter()` and used by `BedrockEmbeddings`.                                                         | Must match a valid SSM Parameter name; the value is often `"amazon.titan-embed-text-v1"`.         | **`cdk/data_ingestion/src/main.py`** (used in `update_vectorstore_from_s3()` / `BedrockEmbeddings`) |

---

### 4.2. Text Generation Environment Variables

These variables are set in the Lambda environment. They are accessed by **`cdk/text_generation/src/main.py`** (and other modules) to configure the pipeline.

| **Variable**                 | **Purpose**                                                                                               | **Usage**                                                                                                                                                                                   | **Acceptable Values**                                                                                           | **Code Location**                                                                           |
|------------------------------|-----------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `COMP_TEXT_GEN_QUEUE_URL`    | Specifies the SQS queue used to handle “comparison” requests.                                            | When `comparison` is detected in the request, **`cdk/text_generation/src/main.py`** sends a message (with deduplication) to this FIFO queue and immediately returns a response.             | Must be a valid FIFO SQS queue URL.                                                                                                | **`cdk/text_generation/src/main.py`** (`handler()` logic for `comparison` flag)             |
| `DB_SECRET_NAME` <br>(or `SM_DB_CREDENTIALS`) | Refers to the AWS Secrets Manager secret containing DB credentials (user, password, etc.).         | Fetched via `get_secret(DB_SECRET_NAME)` to obtain connection parameters for `psycopg2.connect()` in **`connect_to_db()`**.                                                                 | Must match the name of a valid secret in AWS Secrets Manager.                                                                      | **`cdk/text_generation/src/main.py`** (used in `connect_to_db()`)                           |
| `REGION`                     | Specifies the AWS Region (e.g., `"us-east-1"`, `"us-west-2"`) for Bedrock, SSM, Secrets Manager, etc.     | Passed to `boto3.client("bedrock-runtime", region_name=REGION)` and `boto3.client("ssm", region_name=REGION)`.                                                                              | Must be a valid AWS Region string.                                                                                                 | **`cdk/text_generation/src/main.py`** (used in various AWS client initializations)          |
| `RDS_PROXY_ENDPOINT`         | The RDS Proxy endpoint for the primary Postgres database.                                                | Used in **`connect_to_db()`** as the `host` parameter for `psycopg2.connect()`.                                                                                                             | Must be a valid RDS Proxy endpoint (e.g., `myproxy.proxy-xxx.region.rds.amazonaws.com`).                                                              | **`cdk/text_generation/src/main.py`** (referenced in `connect_to_db()`)                    |
| `BEDROCK_LLM_PARAM`          | Points to an SSM Parameter containing the Bedrock LLM model ID.                                          | Retrieved by **`get_parameter(BEDROCK_LLM_PARAM, BEDROCK_LLM_ID)`**. The returned value is passed to `get_bedrock_llm()` to instantiate the Chat LLM.                                       | Must be a valid SSM Parameter name; value is a Bedrock model ID (e.g., `"anthropic.claude-v1"`).                                                     | **`cdk/text_generation/src/main.py`** (used in `initialize_constants()`)                    |
| `EMBEDDING_MODEL_PARAM`      | Points to an SSM Parameter containing the Bedrock embedding model ID.                                    | Retrieved by **`get_parameter(EMBEDDING_MODEL_PARAM, EMBEDDING_MODEL_ID)`**. The returned value is used by `BedrockEmbeddings`.                                                              | Must be a valid SSM Parameter name; for example `"amazon.titan-embed-text-v1"`.                                                                         | **`cdk/text_generation/src/main.py`** (used in `initialize_constants()`)                    |
| `TABLE_NAME_PARAM`           | Points to an SSM Parameter indicating the DynamoDB table name for chat history.                          | Retrieved in **`initialize_constants()`**. The returned string is used in `create_dynamodb_history_table()` and `RunnableWithMessageHistory`.                                               | Must be a valid SSM Parameter name; the table name can be any valid DynamoDB name.                                                                     | **`cdk/text_generation/src/main.py`** (used in `initialize_constants()`)                    |

[🔼 Back to top](#table-of-contents)
