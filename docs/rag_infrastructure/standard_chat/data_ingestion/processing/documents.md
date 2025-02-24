# documents.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
  - [Import Libraries](#import-libraries)
  - [AWS Configuration and Setup](#aws-configuration-and-setup)
  - [Helper Functions](#helper-functions)
  - [Main Functions](#main-functions)
  - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
  - [Function: `extract_txt`](#extract_txt)
  - [Function: `store_doc_texts`](#store_doc_texts)
  - [Function: `add_document`](#add_document)
  - [Function: `store_doc_chunks`](#store_doc_chunks)
  - [Function: `process_documents`](#process_documents)

---

## Script Overview <a name="script-overview"></a>
This script provides a framework for processing documents stored in an AWS S3 bucket. It extracts text from documents (e.g., PDFs), splits the text into semantic chunks, and updates a vectorstore with generated embeddings. The solution leverages AWS services for storage, LangChain modules for text processing and embeddings, and a PostgreSQL-based vectorstore for indexing document chunks.

### Import Libraries <a name="import-libraries"></a>
- **os, tempfile, logging, uuid**: Standard Python libraries used for file handling, temporary file creation, logging, and generating unique identifiers.
- **BytesIO (from io)**: For in-memory binary stream operations.
- **List (from typing)**: For type annotations.
- **boto3**: AWS SDK used for interacting with S3.
- **pymupdf**: Library for reading and extracting text from PDF documents.
- **json**: For JSON serialization and deserialization.
- **BedrockEmbeddings (from langchain_aws)**: Class for generating text embeddings using an AWS model.
- **PGVector (from langchain_postgres)**: Represents the vectorstore for document embeddings.
- **Document (from langchain_core.documents)**: Container class for document chunks.
- **SemanticChunker (from langchain_experimental.text_splitter)**: Splits long text into semantically meaningful chunks.
- **SQLRecordManager, index (from langchain.indexes)**: Tools to manage and update document indexing within the vectorstore.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- The script initializes an S3 client using **boto3**.
- It retrieves the `EMBEDDING_BUCKET_NAME` from the environment variables, which is used to store intermediate extracted text files.

### Helper Functions <a name="helper-functions"></a>
- **extract_txt**: Downloads a file from S3, reads its content as text, and returns the extracted text.
- **store_doc_texts**: Downloads a document (e.g., a PDF) from S3, extracts text from each page using **pymupdf**, and uploads each page's text as a separate file back to S3.
- **store_doc_chunks**: Downloads each text file from S3, splits the content into semantic chunks using **SemanticChunker**, and attaches metadata to each chunk before adding them to the vectorstore.

### Main Functions <a name="main-functions"></a>
- **add_document**: Combines the helper functions to process a document. It first extracts and stores text pages via **store_doc_texts**, then splits the text into semantic chunks via **store_doc_chunks**, and finally returns a list of document chunks ready for indexing.
- **process_documents**: The primary function that iterates over all documents in a specified category folder within an S3 bucket, processes each document via **add_document**, and updates the vectorstore index using a **SQLRecordManager**.

### Execution Flow <a name="execution-flow"></a>
1. **Document Extraction**: The script downloads documents from a specified S3 bucket and extracts text content using **extract_txt** and **store_doc_texts**.
2. **Semantic Chunking**: The extracted text is divided into semantic chunks by **store_doc_chunks**.
3. **Vectorstore Update**: Each document's chunks are processed by **add_document** and then indexed using **process_documents**, which integrates with a PostgreSQL-backed vectorstore and a SQLRecordManager.
4. **Cleanup**: Temporary files are removed, and processed text files are deleted from the S3 bucket to maintain storage hygiene.

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Function: `extract_txt` <a name="extract_txt"></a>
```python
def extract_txt(
    bucket: str,
    document_key: str
) -> str:
    """
    Extract text from a file stored in an S3 bucket.

    This function downloads a file from the specified S3 bucket using the provided key,
    reads its content as UTF-8 text, and returns the extracted text.

    Args:
        bucket (str): The name of the S3 bucket.
        document_key (str): The key of the file in the S3 bucket.

    Returns:
        str: The extracted text from the file.
    """
```

#### Purpose
Downloads a file from S3, reads its content, and returns the text. It is useful for simple text-based documents stored in S3.

#### Process Flow
1. Create a temporary file.
2. Download the file using the provided S3 bucket and key.
3. Open and read the file content as UTF-8.
4. Clean up the temporary file and return the text.

#### Inputs and Outputs
- **Inputs**:
  - `bucket` (str): S3 bucket name.
  - `document_key` (str): S3 key for the document.
- **Outputs**:
  - Returns the extracted text (str).

---

### Function: `store_doc_texts` <a name="store_doc_texts"></a>
```python
def store_doc_texts(
    bucket: str,
    category_id: str, 
    document_name: str, 
    output_bucket: str
) -> List[str]:
    """
    Extract and store the text from each page of a document in an S3 bucket.

    This function downloads a document from the specified S3 bucket and category folder,
    extracts text from each page using pymupdf, and stores each page's text as a separate file 
    in the output S3 bucket. The generated file keys follow the pattern: 
    `<category_id>/<document_name>_page_<page_num>.txt`.

    Args:
        bucket (str): The S3 bucket containing the document.
        category_id (str): The folder or category ID in the S3 bucket.
        document_name (str): The name of the document file.
        output_bucket (str): The S3 bucket where the extracted text files will be stored.

    Returns:
        List[str]: A list of keys corresponding to the stored text files for each page.
    """
```

#### Purpose
Splits a document (e.g., a PDF) into separate text files for each page and uploads them to an S3 bucket.

#### Process Flow
1. Download the document using a temporary file.
2. Open the document with pymupdf.
3. Extract text from each page and write it to a BytesIO buffer.
4. Upload each page’s text to the output S3 bucket.
5. Delete the temporary file and return a list of generated file keys.

#### Inputs and Outputs
- **Inputs**:
  - `bucket`: Source S3 bucket name.
  - `category_id`: Category or folder in the bucket.
  - `document_name`: Name of the document file.
  - `output_bucket`: Destination S3 bucket for text files.
- **Outputs**:
  - A list of S3 keys for the uploaded text files.

---

### Function: `add_document` <a name="add_document"></a>
```python
def add_document(
    bucket: str,
    category_id: str, 
    document_name: str,
    vectorstore: PGVector, 
    embeddings: BedrockEmbeddings,
    output_bucket: str = EMBEDDING_BUCKET_NAME
) -> List[Document]:
    """
    Add a document to the vectorstore by extracting its text and creating semantic chunks.

    This function processes a document by:
      1. Extracting each page's text using `store_doc_texts`.
      2. Splitting the text into semantic chunks via `store_doc_chunks`.
      3. Adding metadata (such as the source S3 URL and a unique document ID) to each chunk.
      4. Ingesting the chunks into the provided vectorstore.

    Args:
        bucket (str): The S3 bucket containing the document.
        category_id (str): The folder or category ID in the S3 bucket.
        document_name (str): The name of the document file.
        vectorstore (PGVector): The vectorstore instance for storing document chunks.
        embeddings (BedrockEmbeddings): The embeddings instance used to generate document embeddings.
        output_bucket (str, optional): The S3 bucket for storing intermediate extracted text files.
                                       Defaults to the EMBEDDING_BUCKET_NAME environment variable.

    Returns:
        List[Document]: A list of document chunks that were added to the vectorstore.
    """
```

#### Purpose
Coordinates the extraction of text from a document and its conversion into semantic chunks that are stored in the vectorstore.

#### Process Flow
1. Call **store_doc_texts** to extract and store text pages.
2. Call **store_doc_chunks** to split each page into semantic chunks.
3. Return the list of document chunks ready for indexing.

#### Inputs and Outputs
- **Inputs**:
  - S3 bucket and category details.
  - Document file name.
  - Vectorstore and embeddings instances.
  - Optional output bucket name.
- **Outputs**:
  - A list of **Document** objects representing processed chunks.

---

### Function: `store_doc_chunks` <a name="store_doc_chunks"></a>
```python
def store_doc_chunks(
    bucket: str, 
    documentnames: List[str],
    vectorstore: PGVector, 
    embeddings: BedrockEmbeddings
) -> List[Document]:
    """
    Process text files by splitting them into semantic chunks and adding them to the vectorstore.

    This function downloads each text file from the specified S3 bucket, uses a semantic text splitter
    to create chunks, attaches metadata (including source S3 URL and a unique document ID) to each chunk,
    and then adds these chunks to the vectorstore. After processing, the original text file is deleted.

    Args:
        bucket (str): The S3 bucket containing the text files.
        documentnames (List[str]): A list of S3 keys for the text files.
        vectorstore (PGVector): The vectorstore instance to which document chunks will be added.
        embeddings (BedrockEmbeddings): The embeddings instance used for generating semantic chunks.

    Returns:
        List[Document]: A list of document chunks created and added to the vectorstore.
    """
```

#### Purpose
Converts text files into semantically meaningful chunks, enriches them with metadata, and integrates them into the vectorstore.

#### Process Flow
1. Iterate through each text file (representing a document page).
2. Generate a unique document identifier.
3. Download and decode the file content.
4. Use **SemanticChunker** to split the text.
5. Attach metadata (source URL and document ID) to each chunk.
6. Delete the processed text file from S3.
7. Return the list of document chunks.

#### Inputs and Outputs
- **Inputs**:
  - S3 bucket name and list of document text keys.
  - Vectorstore and embeddings instances.
- **Outputs**:
  - A list of processed **Document** chunks.

---

### Function: `process_documents` <a name="process_documents"></a>
```python
def process_documents(
    bucket: str,
    category_id: str, 
    vectorstore: PGVector, 
    embeddings: BedrockEmbeddings,
    record_manager: SQLRecordManager
) -> None:
    """
    Process all documents in a specified category from an S3 bucket and update the vectorstore index.

    This function uses an S3 paginator to iterate through all documents in the given category folder,
    processes each document by extracting its text and splitting it into semantic chunks (via `add_document`),
    and then indexes all document chunks in the vectorstore using the provided record manager.
    If no document chunks are found, a cleanup indexing operation is still performed.

    Args:
        bucket (str): The S3 bucket containing the documents.
        category_id (str): The category folder in the S3 bucket to process.
        vectorstore (PGVector): The vectorstore instance for storing document chunks.
        embeddings (BedrockEmbeddings): The embeddings instance used to generate document embeddings.
        record_manager (SQLRecordManager): Manager for maintaining records of documents in the vectorstore.
    """
```

#### Purpose
Orchestrates the document processing workflow by iterating over S3 documents in a given category, processing each document, and updating the vectorstore index.

#### Process Flow
1. Use an S3 paginator to list documents within the specified category.
2. For each document, extract text and create semantic chunks via **add_document**.
3. Accumulate all document chunks.
4. Update or clean up the vectorstore index using the provided **SQLRecordManager**.
5. Log the indexing result or the absence of documents.

#### Inputs and Outputs
- **Inputs**:
  - S3 bucket name and category folder.
  - Instances of **PGVector**, **BedrockEmbeddings**, and **SQLRecordManager**.
- **Outputs**:
  - None (the function updates the vectorstore by side effect).

---

[🔼 Back to top](#table-of-contents)
