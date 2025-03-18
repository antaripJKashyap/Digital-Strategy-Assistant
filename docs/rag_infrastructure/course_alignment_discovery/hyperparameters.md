# Hyperparameters in `course_alignment_discovery`

## Table of Contents <a name="table-of-contents"></a>
1. [LLM-Related Hyperparameters](#llm-related-hyperparameters)  
   1.1. Chat LLM Configuration (Text Generation)  
   1.2. Embeddings for Ingestion (Data Ingestion)
2. [PGVector-Related Hyperparameters](#pgvector-related-hyperparameters)  
   2.1. Data Ingestion Vectorstore
   2.2. Text Generation Vectorstore
3. [Environment Variables](#environment-variables)  
   3.1. Data Ingestion Environment Variables  
   3.2. Text Generation Environment Variables 
4. [Document Processing & Guardrail Behavior](#document-processing--guardrail-behavior)

---

## 1. LLM-Related Hyperparameters <a name="llm-related-hyperparameters"></a>

### 1.1. Chat LLM Configuration (Text Generation)

Within **`cdk/comparison_text_generation/src/helpers/chat.py`**, the `get_bedrock_llm(...)` function defines the Chat LLM:

```python
def get_bedrock_llm(bedrock_llm_id: str, temperature: float = 0) -> ChatBedrockConverse:
    return ChatBedrockConverse(
        model=bedrock_llm_id,
        temperature=temperature,
        # Additional kwargs: https://api.python.langchain.com/en/latest/aws/chat_models/langchain_aws.chat_models.bedrock_converse.ChatBedrockConverse.html
        max_tokens=None,
        top_p=None
    )
```

| **Parameter**   | **Purpose**                                                                                 | **Current Value**        | **Acceptable Values**                                                                                             | **Location**                                              |
|-----------------|---------------------------------------------------------------------------------------------|---------------------------|--------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------|
| `bedrock_llm_id`| Identifies which Bedrock model to use for chat completions (e.g., Claude, Titan, etc.).    | Fetched from an SSM Param (e.g., `BEDROCK_LLM_PARAM`). | Must be a valid Bedrock model ID (e.g., `"anthropic.claude-v2"`, `"amazon.titan-text-large-v1"`).                | **`cdk/comparison_text_generation/src/helpers/chat.py`** |
| `temperature`   | Controls randomness of the generated text.                                              | `0` (default)   | A float between 0 and 1. Higher values = more creative outputs.                  | **`cdk/comparison_text_generation/src/helpers/chat.py`** |
| `max_tokens`    | Max tokens to generate. `max_tokens` sets an upper bound on how many tokens the model will generate in its response. If you specify an integer (e.g., `max_tokens=1000`), the model will stop generating once it reaches that limit. If you set `max_tokens=None`, the model will not enforce a specific token cutoff (although the model’s overall context window may still limit it).                                   | `None` (default)                                       | Any non-negative integer (e.g., 1, 50, 5000, etc.). | **`cdk/comparison_text_generation/src/helpers/chat.py`** (`get_bedrock_llm()`) |
| `top_p`    | The percentage of most-likely candidates that are considered for the next token. Must be 0 to 1. For example, if you choose a value of 0.8 for `top_p`, the model selects from the top 80% of the probability distribution of tokens that could be next in the sequence. | `None` (default)                                       | A float between 0 and 1. Higher values = more diverse and creative outputs, but sometimes at the cost of coherence. | **`cdk/comparison_text_generation/src/helpers/chat.py`** (`get_bedrock_llm()`) |

---

### 1.2. Embeddings for Ingestion (Data Ingestion)

When ingesting documents, the pipeline uses a Bedrock embedding model to generate vectors before storing them in PGVector. The **`EMBEDDING_MODEL_PARAM`** (an environment variable, see [Data Ingestion Environment Variables](#data-ingestion-environment-variables)) points to an SSM parameter that contains the **Bedrock embedding model ID** (e.g., `"amazon.titan-embed-text-v1"`).

- **Usage:** Passed into `BedrockEmbeddings(...)` in **`cdk/comparison_data_ingestion/src/main.py`**  
- **Acceptable Values:** Must be a recognized Bedrock Embedding model ID (e.g., `"amazon.titan-embed-text-v1"`, `"ai21.embedding-gecko"`).

[🔼 Back to top](#table-of-contents)

---

## 2. PGVector-Related Hyperparameters <a name="pgvector-related-hyperparameters"></a>

### 2.1. Data Ingestion Vectorstore

Defined in **`cdk/comparison_data_ingestion/src/helpers/helper.py`** (`get_vectorstore`), which instantiates a `PGVector`:

```python
vectorstore = PGVector(
    embeddings=embeddings,
    collection_name=collection_name,
    connection=connection_string,
    use_jsonb=True
)
```

| **Parameter**     | **Purpose**                                                           | **Current Value**                                 | **Acceptable Values**                                   | **Location**                                                              |
|-------------------|-----------------------------------------------------------------------|---------------------------------------------------|---------------------------------------------------------|---------------------------------------------------------------------------|
| `collection_name` | Name of the “table” or collection where vectors are stored.           | Passed in (e.g., `"session123"`).                 | Any valid string.                                       | **`cdk/comparison_data_ingestion/src/helpers/helper.py`** in `get_vectorstore()` |
| `connection`      | The PostgreSQL connection URI.                                        | Built from secrets (`dbname`, `user`, `password`, `host`, `port`). | Must be a valid Postgres connection URI.                | **`cdk/comparison_data_ingestion/src/helpers/helper.py`** in `get_vectorstore()` |
| `embeddings`      | The BedrockEmbeddings instance for generating vectors.                | Derived from `EMBEDDING_MODEL_PARAM`.             | Must match a supported Bedrock embedding model.         | **`cdk/comparison_data_ingestion/src/helpers/helper.py`**                |
| `use_jsonb`       | Determines if metadata is stored in a JSONB column.                   | `True`                                            | `True` or `False`.                                       | **`cdk/comparison_data_ingestion/src/helpers/helper.py`** in `get_vectorstore()` |

---

### 2.2. Text Generation Vectorstore

In **`cdk/comparison_text_generation/src/helpers/vectorstore.py`**, the retrieval logic also relies on PGVector:

```python
def get_vectorstore_retriever_ordinary(
    vectorstore_config_dict: Dict[str, str],
    embeddings
) -> VectorStoreRetriever:
    vectorstore, _ = get_vectorstore(...)
    return vectorstore.as_retriever(search_kwargs={'k': 5}), vectorstore
```

| **Parameter**     | **Purpose**                                                         | **Current Value**                                           | **Acceptable Values**                                    | **Location**                                                                         |
|-------------------|---------------------------------------------------------------------|-------------------------------------------------------------|-----------------------------------------------------------|--------------------------------------------------------------------------------------|
| `collection_name` | Specifies the PGVector collection/table used during retrieval.      | `vectorstore_config_dict['collection_name']`               | Any valid identifier.                                    | **`cdk/comparison_text_generation/src/helpers/vectorstore.py`**                     |
| `search_kwargs`   | Defines search parameters (like top-K documents).                   | `{'k': 5}`                                                  | Positive integer for top-K retrieval.                    | **`vectorstore.as_retriever(...)`** call in `get_vectorstore_retriever_ordinary()`  |
| `embeddings`      | Converts queries into vectors for retrieval.                        | Sourced from the Bedrock embedding model (`EMBEDDING_MODEL_PARAM`). | Must match a recognized Bedrock embedding model.         | **`cdk/comparison_text_generation/src/helpers/vectorstore.py`**                     |

[🔼 Back to top](#table-of-contents)

---

## 3. Environment Variables <a name="environment-variables"></a>

Below are the environment variables used across the **Data Ingestion** and **Text Generation** workflows.

### 3.1. Data Ingestion Environment Variables

These are set in the Lambda environment for the ingestion pipeline (e.g., **`cdk/comparison_data_ingestion/src/main.py`**, **`cdk/comparison_data_ingestion/src/helpers/helper.py`**).

| **Variable**                 | **Purpose**                                                                                                                  | **Usage**                                                                                                                        | **Acceptable Values**                                                                                                | **Code Location**                                                                                                        |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `EVENT_NOTIFICATION_LAMBDA_NAME` | (Optional) Name of a Lambda for sending notifications/updates to users.                                                | May be invoked or used for cross-Lambda notifications.                                                                           | Must be the name of a valid Lambda function.                                                                         | **`cdk/comparison_data_ingestion/src/main.py`**                                                                           |
| `DB_SECRET_NAME`             | Refers to the AWS Secrets Manager secret storing DB credentials (`username`, `password`, etc.).                             | Used by `get_secret()` to obtain credentials for PGVector (`psycopg2.connect()`).                                               | Must match a valid secret name in AWS Secrets Manager.                                                                | **`cdk/comparison_data_ingestion/src/main.py`** (in `get_secret()`)                                                      |
| `REGION`                     | AWS Region (e.g., `"us-east-1"`, `"us-west-2"`).                                                                            | Passed to `boto3.client("bedrock-runtime", region_name=REGION)`, S3, Secrets Manager, etc.                                      | Must be a valid AWS Region string.                                                                                   | **`cdk/comparison_data_ingestion/src/main.py`** (used in Boto3 client creations)                                         |
| `DSA_COMPARISON_BUCKET`      | Identifies the S3 bucket containing documents to be ingested.                                                               | Used in `handler()`, then passed to `update_vectorstore_from_s3(bucket_name, session_id)`.                                      | Must be a valid S3 bucket name.                                                                                      | **`cdk/comparison_data_ingestion/src/main.py`**                                                                           |
| `RDS_PROXY_ENDPOINT`         | RDS Proxy endpoint for connecting to Postgres.                                                                               | Used as the `host` in `psycopg2.connect()` or PGVector connection strings.                                                       | Must be a valid RDS Proxy endpoint (e.g., `my-proxy.proxy-xxx.us-east-1.rds.amazonaws.com`).                          | **`cdk/comparison_data_ingestion/src/main.py`**                                                                           |
| `EMBEDDING_BUCKET_NAME`      | (Optional) S3 bucket name for storing intermediate embeddings or text outputs.                                               | Some ingestion workflows may store extracted text or partial embeddings here.                                                    | Must be a valid S3 bucket name.                                                                                      | **`cdk/comparison_data_ingestion/src/main.py`**                                                                           |
| `APPSYNC_API_URL`            | The AppSync endpoint for sending status notifications to the front end.                                                     | Invoked in `invoke_event_notification(session_id, message)`.                                                                    | Must be a valid AppSync API endpoint URL.                                                                            | **`cdk/comparison_data_ingestion/src/main.py`**                                                                           |
| `EMBEDDING_MODEL_PARAM`      | Points to an SSM Parameter with the Bedrock embedding model ID (e.g., `"amazon.titan-embed-text-v1"`).                       | Fetched by `get_parameter()`. Used when instantiating `BedrockEmbeddings`.                                                       | Must match a valid SSM Parameter name with a recognized Bedrock Embedding model ID.                                   | **`cdk/comparison_data_ingestion/src/main.py`** (passed into `BedrockEmbeddings`)                                        |

---

### 3.2. Text Generation Environment Variables

Used by **`cdk/comparison_text_generation/src/main.py`** (and helpers) to configure the text generation pipeline.

| **Variable**              | **Purpose**                                                                                                      | **Usage**                                                                                                            | **Acceptable Values**                                                                                  | **Code Location**                                                                                                 |
|---------------------------|------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `APPSYNC_API_URL`         | The AppSync endpoint for sending real-time or event notifications.                                              | Used by `invoke_event_notification(session_id, message)`.                                                            | Must be a valid AppSync API URL.                                                                               | **`cdk/comparison_text_generation/src/main.py`**                                                                   |
| `COMP_TEXT_GEN_QUEUE_URL` | Points to an SQS queue for large or long-running “comparison” jobs.                                              | May be used to queue requests if synchronous Lambda invocation might exceed time limits.                             | Must be a valid SQS queue URL.                                                                                  | **`cdk/comparison_text_generation/src/main.py`**                                                                   |
| `DB_SECRET_NAME`          | AWS Secrets Manager secret for DB credentials (standard table).                                                   | Fetched via `get_secret(DB_SECRET_NAME)` to connect for guidelines retrieval.                                        | Must match a valid AWS Secrets Manager secret name.                                                             | **`cdk/comparison_text_generation/src/main.py`**                                                                   |
| `DB_COMP_SECRET_NAME`     | A separate Secrets Manager secret for the “comparison” database.                                                 | Fetched via `get_secret_comparison(DB_COMP_SECRET_NAME)` to retrieve user-uploaded vectors.                           | Must match a valid AWS Secrets Manager secret name.                                                             | **`cdk/comparison_text_generation/src/main.py`**                                                                   |
| `REGION`                  | The AWS Region for Bedrock, SSM, etc.                                                                            | Used in Boto3 clients (e.g., `boto3.client("bedrock-runtime", region_name=REGION)`).                                 | Must be a valid AWS Region string.                                                                              | **`cdk/comparison_text_generation/src/main.py`**                                                                   |
| `RDS_PROXY_ENDPOINT`      | RDS Proxy endpoint for the main Postgres database (guidelines).                                                  | Used in `connect_to_db()` when retrieving guidelines.                                                                | Must be a valid RDS Proxy endpoint URL.                                                                         | **`cdk/comparison_text_generation/src/main.py`**                                                                   |
| `RDS_PROXY_COMP_ENDPOINT` | RDS Proxy endpoint for the “comparison” Postgres database (user-uploaded data).                                  | Used in `connect_to_comparison_db()` for retrieving user-uploaded data.                                              | Must be a valid RDS Proxy endpoint URL.                                                                         | **`cdk/comparison_text_generation/src/main.py`**                                                                   |
| `BEDROCK_LLM_PARAM`       | Points to an SSM Parameter holding the Bedrock Chat LLM model ID (e.g., `"anthropic.claude-v2"`).                | Fetched by `get_parameter(BEDROCK_LLM_PARAM)`. Passed to `get_bedrock_llm(...)`.                                     | Must match a valid SSM Parameter name whose value is a Bedrock model ID.                                       | **`cdk/comparison_text_generation/src/main.py`** (`initialize_constants()`)                                        |
| `EMBEDDING_MODEL_PARAM`   | Points to an SSM Parameter with the Bedrock embedding model ID (e.g., `"amazon.titan-embed-text-v1"`).           | Used to instantiate `BedrockEmbeddings` for vector retrieval.                                                        | Must match a valid SSM Parameter name whose value is a recognized Bedrock embedding model.                      | **`cdk/comparison_text_generation/src/main.py`** (`initialize_constants()`)                                        |
| `TABLE_NAME_PARAM`        | Points to an SSM Parameter for a DynamoDB table name used for chat or notification history.                      | Fetched by `get_parameter(TABLE_NAME_PARAM)`. May be used in `create_dynamodb_history_table()` or chat history logic. | Must be a valid SSM Parameter name; the table name can be any valid DynamoDB name.                              | **`cdk/comparison_text_generation/src/main.py`** (`initialize_constants()`)                                        |

[🔼 Back to top](#table-of-contents)

---

## 4. Document Processing & Guardrail Behavior <a name="document-processing--guardrail-behavior"></a>

Though not strictly “hyperparameters,” these settings in **`cdk/comparison_data_ingestion/src/processing/documents.py`** significantly affect ingestion behavior:

1. **Guardrails**: A Bedrock policy that blocks certain categories (financial advice, offensive content, PII, etc.).  
2. **PDF Splitting**: Each PDF is split page-by-page before applying the guardrail.  
3. **Rejection Threshold**: If **any** single page triggers a violation, **all** documents in the batch are removed from S3, and an error is returned.  
4. **Vector Indexing**: Only upon passing the guardrail check do documents get indexed with `vectorstore.add_documents(...)`.

| **Parameter**            | **Purpose**                                             | **Value / Behavior**                                 | **Acceptable Values**                                       | **Location**                                     |
|--------------------------|---------------------------------------------------------|-------------------------------------------------------|-------------------------------------------------------------|--------------------------------------------------|
| Guardrail Name           | The named policy for content blocking in Bedrock.       | `"comprehensive-guardrails"`                          | Any string name.                                            | **`setup_guardrail(guardrail_name=...)`** in `documents.py` |
| Topics & Sensitive Info  | Defines categories or PII to block (e.g., `EMAIL`).     | `FinancialAdvice`, `OffensiveContent`, PII checks (EMAIL, PHONE, NAME) | Additional or fewer guardrails can be configured as needed. | **`documents.py`** in `create_guardrail(...)` call |
| PDF Split Granularity    | Splits PDF by page (`pymupdf`).                         | One chunk (page) per split.                           | Could be adjusted for different chunk sizes.                | **`process_documents()`** in `documents.py`       |
| Page Rejection Threshold | If **any** page is blocked, the entire batch fails.     | Strict: removes the entire S3 folder of docs.         | Could be changed to remove only the offending doc.          | **`process_documents()`** in `documents.py`       |

[🔼 Back to top](#table-of-contents)
