# Hyperparameters in `course_alignment_discovery`

## Data Ingestion

### 1. Environment Variables

These variables are set in the Lambda environment. They are accessed by modules like `cdk/comparison_data_ingestion/src/main.py` and `cdk/comparison_data_ingestion/src/helpers/helper.py` to configure the ingestion pipeline.

| **Variable**                 | **Purpose**                                                                                                                          | **Usage**                                                                                                                       | **Acceptable Values**                                                                                                  | **Code Location**                                                                                           |
|------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `EVENT_NOTIFICATION_LAMBDA_NAME` | Specifies the name of another Lambda responsible for sending notifications or updates to users (if applicable).               | Not always referenced directly in the ingestion path, but may be invoked or used for cross-Lambda notifications.                      | Must be the name of a valid Lambda function.                                                                           | **`cdk/comparison_data_ingestion/src/main.py`**                                                              |
| `DB_SECRET_NAME`             | Refers to the AWS Secrets Manager secret storing DB credentials (`username`, `password`, etc.).                                      | Used by `get_secret()` to obtain credentials for PGVector (`psycopg2.connect()`).                                                      | Must match the name of a valid secret in AWS Secrets Manager.                                                          | **`cdk/comparison_data_ingestion/src/main.py`** (used in `get_secret()`)                                      |
| `REGION`                     | Specifies the AWS Region (e.g., `"us-east-1"`, `"us-west-2"`) for services such as Bedrock, S3, Secrets Manager, etc.               | Passed to `boto3.client("bedrock-runtime", region_name=REGION)` and `boto3.client("ssm", region_name=REGION)`.                          | Must be a valid AWS Region string.                                                                                     | **`cdk/comparison_data_ingestion/src/main.py`** (used in various Boto3 client creations)                     |
| `DSA_COMPARISON_BUCKET`      | Identifies the S3 bucket containing the documents to be ingested.                                                                    | In `handler()`, used to validate the S3 bucket source and pass to `update_vectorstore_from_s3(bucket_name, session_id)`.               | Must be a valid S3 bucket name.                                                                                        | **`cdk/comparison_data_ingestion/src/main.py`** (queried in `handler()` and passed downstream)               |
| `RDS_PROXY_ENDPOINT`         | The RDS Proxy endpoint used to connect to Postgres.                                                                                  | Used as the `host` parameter in `psycopg2.connect()` or PGVector connection strings.                                                   | Must be a valid RDS Proxy endpoint (e.g., `my-proxy.proxy-xxx.us-east-1.rds.amazonaws.com`).                           | **`cdk/comparison_data_ingestion/src/main.py`** (referenced in `update_vectorstore_from_s3()` and helper code)|
| `EMBEDDING_BUCKET_NAME`      | (Optional) S3 bucket name for storing intermediate embeddings or text outputs (if used).                                            | Some ingestion workflows store extracted text or partial embeddings in this bucket.                                                    | Must be a valid S3 bucket name.                                                                                        | **`cdk/comparison_data_ingestion/src/main.py`** (referenced in `update_vectorstore_from_s3()`)               |
| `APPSYNC_API_URL`            | The URL endpoint for AppSync, used for sending status notifications to the front end.                                               | Invoked in `invoke_event_notification(session_id, message)` calls.                                                                     | Must be a valid AppSync API endpoint URL.                                                                              | **`cdk/comparison_data_ingestion/src/main.py`** (used in `invoke_event_notification()`)                      |
| `EMBEDDING_MODEL_PARAM`      | Points to an SSM Parameter containing the Bedrock embedding model ID (e.g., `"amazon.titan-embed-text-v1"`).                         | Fetched by `get_parameter()`. Used when instantiating `BedrockEmbeddings`.                                                             | Must match a valid SSM Parameter name in AWS; the parameter’s value should be a recognized Bedrock Embedding model ID. | **`cdk/comparison_data_ingestion/src/main.py`** (passed into `BedrockEmbeddings` via `update_vectorstore_from_s3()`) |

---

### 2. Vectorstore (PGVector) Configuration

The ingestion pipeline uses **PGVector** to store embeddings. In **`cdk/comparison_data_ingestion/src/helpers/helper.py`**, `get_vectorstore` constructs the PGVector instance:

```python
vectorstore = PGVector(
    embeddings=embeddings,
    collection_name=collection_name,
    connection=connection_string,
    use_jsonb=True
)
```

| **Parameter**       | **Purpose**                                                           | **Current Value**                                                          | **Acceptable Values**                                  | **Location**                                                |
|---------------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------|--------------------------------------------------------|-------------------------------------------------------------|
| `collection_name`   | The table/collection name for storing vector data.                   | Passed in as `vectorstore_config_dict["collection_name"]`.                 | Any valid string or identifier (e.g., `"session123"`). | **`cdk/comparison_data_ingestion/src/helpers/helper.py`** in `get_vectorstore()` |
| `connection`        | The PostgreSQL connection URI used to connect to the database.       | Built from secrets: `dbname`, `user`, `password`, `host`, `port`.          | Must be a valid Postgres connection URI.               | **`cdk/comparison_data_ingestion/src/helpers/helper.py`** in `get_vectorstore()` |
| `embeddings`        | BedrockEmbeddings instance specifying the model for vector creation. | Derived from `EMBEDDING_MODEL_PARAM`.                                      | Must match a supported Bedrock embedding model.        | **`cdk/comparison_data_ingestion/src/helpers/helper.py`** (passed into `get_vectorstore()`)          |
| `use_jsonb`         | Determines if metadata is stored in a JSONB column.                  | `True`                                                                     | `True` or `False`.                                      | **`cdk/comparison_data_ingestion/src/helpers/helper.py`** in `get_vectorstore()` |

---

### 3. Document Processing & Guardrail Behavior

In **`cdk/comparison_data_ingestion/src/processing/documents.py`**, the `process_documents()` function:

1. Creates or retrieves a **guardrail** in Bedrock to block certain content (financial advice, offensive content, PII, etc.).
2. Downloads each PDF from S3, splits it by page, and calls `bedrock_runtime_client.apply_guardrail(...)` on each page.
3. If **any** page triggers a guardrail violation, **all** documents in the batch are deleted from S3, and an error message is returned.
4. If no violation is detected, `vectorstore.add_documents(...)` indexes the text in PGVector.

While not strictly “hyperparameters”, these guardrail settings and the chunking-by-page logic significantly affect ingestion behavior:

| **Parameter**            | **Purpose**                                          | **Value / Behavior**                             | **Acceptable Values** | **Location**                                     |
|--------------------------|------------------------------------------------------|--------------------------------------------------|-----------------------|--------------------------------------------------|
| Guardrail Name           | The name used to register and look up the policy.   | `"comprehensive-guardrails"`                     | Any string.          | **`setup_guardrail(guardrail_name=...)`** in `documents.py` |
| Topics & Sensitive Info  | Defines which categories or PII types to block.     | `FinancialAdvice`, `OffensiveContent`, and PII checks for `EMAIL`, `PHONE`, `NAME` | Additional or fewer guardrails can be configured as needed. | **`documents.py`** in `create_guardrail(...)` call          |
| PDF Split Granularity    | Splits documents page-by-page via `pymupdf`.        | One chunk per page.                              | Could be further splitted or combined. | **`process_documents()`** in `documents.py`                 |
| Page Rejection Threshold | If **any** page triggers a block, entire batch fails. | Strict: entire S3 folder is removed on violation. | Could be adjusted to only remove the offending file. | **`process_documents()`** in `documents.py`                 |

---

## Text Generation

### 1. Environment Variables

Below are the key environment variables used by modules like `cdk/comparison_text_generation/src/main.py` to configure the text generation process.

| **Variable**             | **Purpose**                                                                                            | **Usage**                                                                                                                                                          | **Acceptable Values**                                                                                             | **Code Location**                                                                                          |
|--------------------------|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `APPSYNC_API_URL`        | The AppSync endpoint for sending real-time or event notifications.                                    | Used by `invoke_event_notification(session_id, message)`.                                                                                                                  | Must be a valid AppSync API URL.                                                                                 | **`cdk/comparison_text_generation/src/main.py`** (and other modules calling `invoke_event_notification()`) |
| `COMP_TEXT_GEN_QUEUE_URL`| Points to an SQS queue for passing large or long-running “comparison” jobs.                           | May be used to queue requests if direct synchronous Lambda invocation might exceed time limits.                                                                            | Must be a valid SQS queue URL.                                                                                    | **`cdk/comparison_text_generation/src/main.py`**                                                           |
| `DB_SECRET_NAME`         | The AWS Secrets Manager secret for DB credentials (standard table).                                    | Fetched by `get_secret(DB_SECRET_NAME)` to connect for guidelines retrieval.                                                                                               | Must match a valid AWS Secrets Manager secret name.                                                               | **`cdk/comparison_text_generation/src/main.py`**                                                           |
| `DB_COMP_SECRET_NAME`    | A separate Secrets Manager secret for the “comparison” database.                                       | Fetched by `get_secret_comparison(DB_COMP_SECRET_NAME)` to connect for user-uploaded vector retrieval.                                                                     | Must match a valid AWS Secrets Manager secret name.                                                               | **`cdk/comparison_text_generation/src/main.py`**                                                           |
| `REGION`                 | The AWS Region (e.g., `"us-east-1"`) for Bedrock, SSM, etc.                                           | Used in Boto3 clients (`boto3.client("bedrock-runtime", region_name=REGION)`).                                                                                             | Must be a valid AWS Region string.                                                                                | **`cdk/comparison_text_generation/src/main.py`**                                                           |
| `RDS_PROXY_ENDPOINT`     | The RDS Proxy endpoint for the main Postgres database.                                                | Used in **`connect_to_db()`** when retrieving guidelines.                                                                                                                   | Must be a valid RDS Proxy endpoint URL.                                                                           | **`cdk/comparison_text_generation/src/main.py`**                                                           |
| `RDS_PROXY_COMP_ENDPOINT`| The RDS Proxy endpoint for the “comparison” Postgres database.                                        | Used in **`connect_to_comparison_db()`** for user-uploaded data retrieval.                                                                                                  | Must be a valid RDS Proxy endpoint URL.                                                                           | **`cdk/comparison_text_generation/src/main.py`**                                                           |
| `BEDROCK_LLM_PARAM`      | Points to an SSM Parameter holding the Bedrock Chat LLM model ID (e.g., `"anthropic.claude-v2"`).     | Fetched by `get_parameter(BEDROCK_LLM_PARAM)`. The result is passed to `get_bedrock_llm(...)`.                                                                             | Must match a valid SSM Parameter name; the parameter’s value should be a Bedrock model ID.                     | **`cdk/comparison_text_generation/src/main.py`** (`initialize_constants()`)                                |
| `EMBEDDING_MODEL_PARAM`  | Points to an SSM Parameter containing the Bedrock embedding model ID (e.g., `"amazon.titan-embed-text-v1"`). | Used to instantiate `BedrockEmbeddings` for vector retrieval (`embeddings = BedrockEmbeddings(...)`).                                                                     | Must match a valid SSM Parameter name; the parameter’s value should be a recognized Bedrock embedding model.      | **`cdk/comparison_text_generation/src/main.py`** (`initialize_constants()`)                                |
| `TABLE_NAME_PARAM`       | Points to an SSM Parameter for a DynamoDB table name used for chat or notification history.           | Fetched by `get_parameter(TABLE_NAME_PARAM)`. May be used by `create_dynamodb_history_table()` or `RunnableWithMessageHistory`.                                            | Must be a valid SSM Parameter name; the table name can be any valid DynamoDB name.                                | **`cdk/comparison_text_generation/src/main.py`** (`initialize_constants()`)                                |

---

### 2. Vectorstore (PGVector) Configuration

For text generation, the code also uses PGVector for retrieval. In **`cdk/comparison_text_generation/src/helpers/vectorstore.py`**, we see:

```python
def get_vectorstore_retriever_ordinary(
    vectorstore_config_dict: Dict[str, str],
    embeddings
) -> VectorStoreRetriever:
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
```

| **Parameter**       | **Purpose**                                                         | **Current Value**                                                   | **Acceptable Values**                                                 | **Location**                                                          |
|---------------------|---------------------------------------------------------------------|---------------------------------------------------------------------|------------------------------------------------------------------------|------------------------------------------------------------------------|
| `collection_name`   | Specifies the name (table/collection) in PGVector for retrieval.    | Derived from `vectorstore_config_dict['collection_name']`.          | Any valid identifier.                                                 | **`cdk/comparison_text_generation/src/helpers/vectorstore.py`**        |
| `search_kwargs`     | Defines search parameters such as top-K documents (`k`).            | `{'k': 5}`                                                          | Positive integer for the top-k retrieval count.                       | **`vectorstore.as_retriever(...)`** call in `get_vectorstore_retriever_ordinary()` |
| `embeddings`        | The embeddings used to convert queries into vectors for retrieval.  | Sourced from the Bedrock embedding model indicated by `EMBEDDING_MODEL_PARAM`. | Must match a recognized Bedrock embedding model.                      | **`cdk/comparison_text_generation/src/helpers/vectorstore.py`**        |

---

### 3. LLM Configuration

In **`cdk/comparison_text_generation/src/helpers/chat.py`**, `get_bedrock_llm(...)` sets up the Bedrock Chat LLM:

```python
def get_bedrock_llm(bedrock_llm_id: str, temperature: float = 0) -> ChatBedrock:
    return ChatBedrock(
        model_id=bedrock_llm_id,
        model_kwargs=dict(temperature=temperature),
    )
```

| **Parameter**      | **Purpose**                                                          | **Current Value**                     | **Acceptable Values**                                               | **Location**                                      |
|--------------------|----------------------------------------------------------------------|---------------------------------------|-----------------------------------------------------------------------|---------------------------------------------------|
| `bedrock_llm_id`   | Identifies which Bedrock model to use for chat completions (e.g., Claude, Titan, etc.). | Fetched from `BEDROCK_LLM_PARAM`.     | Must be a valid Bedrock model ID (e.g., `"anthropic.claude-v1"`, `"amazon.titan-text-large-v1"`). | **`cdk/comparison_text_generation/src/helpers/chat.py`** |
| `temperature`      | Controls randomness/creativity in responses.                         | `0` (hardcoded default).              | Typically a float between 0 and 2 (some models allow up to 5). Higher = more creative responses.      | **`cdk/comparison_text_generation/src/helpers/chat.py`** |
