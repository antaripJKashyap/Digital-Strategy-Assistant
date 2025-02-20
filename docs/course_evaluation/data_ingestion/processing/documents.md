# guardrails.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
  - [Import Libraries](#import-libraries)
  - [AWS Configuration and Setup](#aws-configuration-and-setup)
  - [Helper Functions](#helper-functions)
  - [Main Functions](#main-functions)
  - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
  - [Function: `setup_guardrail`](#setup_guardrail)
  - [Function: `process_documents`](#process_documents)

---

## Script Overview <a name="script-overview"></a>
This script provides functionality for managing and applying AI guardrails using AWS Bedrock. It also processes documents from an S3 bucket, checks them for restricted content (financial advice, offensive material, and PII), and, if safe, stores them in a vector store (`PGVector`) for later retrieval or indexing.

### Import Libraries <a name="import-libraries"></a>
- **os, tempfile, logging, uuid, time**: Standard Python libraries for file handling, temporary file creation, logging, generating unique identifiers, and time-based operations.
- **BytesIO**: Used to handle in-memory streams.
- **typing (List, Optional, Dict)**: Provides type annotations for better code clarity.
- **boto3**: AWS SDK for Python, for interacting with AWS services like S3 and Bedrock.
- **pymupdf**: Used to read and process PDF files.
- **langchain_aws.BedrockEmbeddings**: (Imported but not used in the snippet) Typically handles embedding generation through AWS Bedrock.
- **langchain_postgres.PGVector**: A vector store used to store document embeddings in a PostgreSQL database.
- **langchain_core.documents.Document**: A standardized data structure representing documents in the LangChain ecosystem.
- **langchain_text_splitters.RecursiveCharacterTextSplitter**: (Imported but not used in the snippet) A utility for splitting text into segments.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- **boto3.client('s3')**: Initializes the AWS S3 client to list, download, and delete files in an S3 bucket.
- **boto3.client('bedrock')** / **boto3.client('bedrock-runtime')**: Communicates with AWS Bedrock for guardrail creation and content checks.

### Helper Functions <a name="helper-functions"></a>
- **setup_guardrail**: Ensures that a specified guardrail exists in AWS Bedrock. If it does not exist, creates and publishes a new one.

### Main Functions <a name="main-functions"></a>
- **process_documents**: Main entry point for processing a collection of documents in an S3 bucket. Each document is examined page-by-page, checked against guardrails, and stored in the `PGVector` vector store if safe.

### Execution Flow <a name="execution-flow"></a>
1. **setup_guardrail** is called to confirm the presence of a Bedrock guardrail. If the guardrail does not exist, it is created and published.
2. **process_documents** gathers the relevant documents (PDF files) from S3, applies the guardrail checks on each page, and either stores them in the vector store or halts processing (deleting the original files) if restricted content is detected.

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Function: `setup_guardrail` <a name="setup_guardrail"></a>
```python
def setup_guardrail(guardrail_name: str) -> tuple[str, str]:
    """
    Returns (guardrail_id, version) after ensuring a valid published guardrail exists.
    """
    ...
    return guardrail_id, guardrail_version
```
#### Purpose
Validates or creates a guardrail in AWS Bedrock, publishing a new guardrail version if none is found.

#### Process Flow
1. Lists existing guardrails from Bedrock and checks if a guardrail with `guardrail_name` exists.
2. If not found, creates a new guardrail specifying:
   - **Topic Policies**: Blocks financial advice and offensive content.
   - **Sensitive Information Policy**: Blocks or anonymizes PII (emails, phone numbers, names).
3. Publishes the guardrail and returns its ID and version.

#### Inputs and Outputs
- **Inputs**:
  - `guardrail_name`: A string identifying the guardrail to look for or create.
- **Outputs**:
  - Returns a tuple `(guardrail_id, guardrail_version)` indicating the existing or newly created guardrail’s ID and published version.

[🔼 Back to top](#table-of-contents)

---

### Function: `process_documents` <a name="process_documents"></a>
```python
def process_documents(
    bucket: str,
    category_id: str, 
    vectorstore: PGVector
) -> str:
    ...
    return "SUCCESS"
```
#### Purpose
Processes a set of documents stored in an S3 bucket under a given prefix. For each PDF file:
1. Applies Bedrock guardrail checks to detect restricted content.
2. If restricted content is found, deletes all documents from S3 and returns an error message.
3. If safe, stores the documents in the `PGVector` vector store and removes them from S3.

#### Process Flow
1. **Guardrail Setup**: Retrieves or creates a comprehensive guardrail via `setup_guardrail`.
2. **Document Listing**: Uses S3 pagination to list all document keys under the specified prefix (`category_id`).
3. **Document Parsing**:
   - Downloads each PDF file to a temporary path.
   - Iterates over each page:
     - Extracts text and applies guardrail checks.
     - If restricted content is detected:
       - Deletes all documents from S3.
       - Returns the corresponding error message.
     - If allowed, appends the page text as a `Document` object to a list for indexing.
4. **Vector Store Update**: If no guardrail is triggered, all page texts are added to the vector store. The original files in S3 are then deleted.
5. **Return Value**: Returns `"SUCCESS"` if processing completes without blockages.

#### Inputs and Outputs
- **Inputs**:
  - `bucket`: Name of the S3 bucket containing the documents.
  - `category_id`: Prefix/path in the S3 bucket where documents are stored.
  - `vectorstore`: An instance of `PGVector` where successfully processed documents are stored.
- **Outputs**:
  - Returns `"SUCCESS"` if all documents pass guardrail checks.
  - Returns a guardrail-based error message if any document triggers restricted content checks.

[🔼 Back to top](#table-of-contents)
