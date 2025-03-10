# Hyperparameters in `standard_chat`

This document describes the primary parameters and configuration values used throughout the data ingestion and vectorstore update pipeline. The information below includes:

- **Environment Variables**
- **Vectorstore (PGVector) Configuration**  
- **Indexing Behavior**  

Each section explains the parameter’s purpose, its current default or typical value, acceptable ranges (if applicable), and where it is defined in the code base.

---

## 1. Environment Variables

These variables are set in the Lambda environment. They are accessed by `main.py` (and other modules) to configure the pipeline.

| **Variable**                   | **Purpose**                                                                                                           | **Typical Usage**                                                    | **Acceptable Values**                                                  | **Code Location**                                                         |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `SM_DB_CREDENTIALS`            | Refers to the name of the AWS Secrets Manager secret storing the database credentials (username, password, etc.).     | Fetched by `get_secret()` to obtain the DB credentials.              | Must match the name of a valid secret in AWS Secrets Manager.            | **`main.py`** (used in `get_secret()`)                                    |
| `REGION`                       | Specifies the AWS Region for services such as Bedrock and S3.                                                         | Configures the Boto3 client (`bedrock-runtime`).                     | Any valid AWS Region (e.g., `"us-east-1"`, `"us-west-2"`).              | **`main.py`** (passed to `boto3.client("bedrock-runtime", region_name=REGION)`) |
| `BUCKET`                       | Identifies the S3 bucket that triggers ingestion upon file upload.                                                    | Stored in `DSA_DATA_INGESTION_BUCKET`. Lambda handler filters events from this bucket. | Must be a valid S3 bucket name.                                          | **`main.py`** (used in `handler()` to validate the event’s S3 bucket)     |
| `RDS_PROXY_ENDPOINT`           | Specifies the endpoint for Amazon RDS Proxy that provides connectivity to the Postgres database.                      | Incorporated into `connect_to_db()` for the DB host.                  | Must be a valid RDS Proxy endpoint (e.g., `my-proxy.proxy-xxx.us-east-1.rds.amazonaws.com`). | **`main.py`** (used in `connect_to_db()`)                                 |
| `EMBEDDING_BUCKET_NAME`        | Indicates the S3 bucket where extracted text files or embedding artifacts are stored.                                  | Used in intermediate steps for storing `.txt` page outputs.          | Must be a valid S3 bucket name.                                          | **`main.py`** (referenced in `update_vectorstore_from_s3()`), **`documents.py` (store_doc_texts)** |
| `EMBEDDING_MODEL_PARAM`        | Points to a parameter in AWS Systems Manager (SSM) that holds the Bedrock embedding model ID.                         | Fetched by `get_parameter()` and used by `BedrockEmbeddings`.        | Must match a valid SSM Parameter name; the value is often something like `"amazon.titan-embed-text-v1"`. | **`main.py`** (used in `update_vectorstore_from_s3()` / `BedrockEmbeddings`) |

### Modification Location

- **AWS Lambda Environment**: In the Lambda console, under **Configuration** > **Environment variables**.  
- **AWS Secrets Manager**: The credentials are stored in the secret named by `SM_DB_CREDENTIALS`.  
- **AWS Systems Manager**: The parameter specified by `EMBEDDING_MODEL_PARAM` can be updated as needed (e.g., to switch embedding models).

---

## 2. Vectorstore (PGVector) Configuration

In `helpers/helper.py`, the `get_vectorstore` function initializes the `PGVector` instance:

```python
vectorstore = PGVector(
    embeddings=embeddings,
    collection_name=collection_name,
    connection=connection_string,
    use_jsonb=True
)
```

| **Parameter**       | **Purpose**                                             | **Current Value**                  | **Acceptable Values**                  | **Location**                               |
|---------------------|---------------------------------------------------------|------------------------------------|-----------------------------------------|--------------------------------------------|
| `collection_name`   | Identifies the collection (schema/table) used by PGVector. | Set to a string from `vectorstore_config_dict`. | Any valid string (e.g., `"my_collection"`). | **`helpers/helper.py`** in `get_vectorstore()` |
| `use_jsonb`         | Determines if chunk metadata is stored in a JSONB column. | `True`                             | `True` or `False`                       | **`helpers/helper.py`** in `PGVector(...)`  |
| `connection`        | Connection string for the PostgreSQL database.          | Derived from the environment’s secrets and parameters. | Must be a valid Postgres connection URI. | **`helpers/helper.py`** in `get_vectorstore()`  |

### Modification Location

- **File**: `helpers/helper.py`  
- **Function**: `get_vectorstore`  
- **Relevant Lines**: Instantiation of `PGVector(...)`.

---

## 3. Indexing Behavior

In `documents.py`, the `process_documents` function calls the `index(...)` utility:

```python
idx = index(
    all_doc_chunks,
    record_manager,
    vectorstore,
    cleanup="full",
    source_id_key="source"
)
```

- **`cleanup="full"`**: Removes any previous records not present in the new chunk set.  
- **`source_id_key="source"`**: Points to the metadata key used for deduplication.

| **Parameter**       | **Purpose**                                          | **Current Value** | **Acceptable Values** | **Location**                  |
|---------------------|------------------------------------------------------|-------------------|-----------------------|-------------------------------|
| `cleanup`           | Determines how stale records are removed.           | `"full"`          | `"full"`, `"none"`, `"incremental"`, or `"scoped_full"`  | **`documents.py`** in the `index(...)` call |
| `source_id_key`     | Identifies the source key in each chunk’s metadata. | `"source"`        | Any string matching a metadata field         | **`documents.py`** in the `index(...)` call |

### Modification Location

- **File**: `documents.py`  
- **Function**: `process_documents`  
- **Relevant Lines**: Where `index(...)` is invoked.
