# documents.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
  - [Import Libraries](#import-libraries)
  - [AWS Configuration and Setup](#aws-configuration-and-setup)
  - [Helper Functions](#helper-functions)
  - [Main Functions](#main-functions)
  - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
  - [Function: `store_doc_texts`](#store_doc_texts)
  - [Function: `add_document`](#add_document)
  - [Function: `store_doc_chunks`](#store_doc_chunks)
  - [Function: `process_documents`](#process_documents)

---

## Script Overview <a name="script-overview"></a>
This script provides a framework for processing documents stored in an AWS S3 bucket. It extracts text from documents (e.g., PDFs), splits the text into semantic chunks, and updates a vectorstore with generated embeddings. The solution leverages AWS services for storage, LangChain modules for text processing and embeddings, and a PostgreSQL-based vectorstore for indexing document chunks.

### Import Libraries <a name="import-libraries"></a>
- **os, logging, uuid**: Standard Python libraries used for file handling, logging, and generating unique identifiers.
- **BytesIO (from io)**: For in-memory binary stream operations.
- **List (from typing)**: For type annotations.
- **boto3**: AWS SDK used for interacting with S3.
- **pymupdf**: Library for reading and extracting text from PDF documents.
- **BedrockEmbeddings (from langchain_aws)**: Class for generating text embeddings using an AWS model.
- **PGVector (from langchain_postgres)**: Represents the vectorstore for document embeddings.
- **Document (from langchain_core.documents)**: Container class for document chunks.
- **SemanticChunker (from langchain_experimental.text_splitter)**: Splits long text into semantically meaningful chunks.
- **SQLRecordManager, index (from langchain.indexes)**: Tools to manage and update document indexing within the vectorstore.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- The script initializes an S3 client using **boto3**.
- It retrieves the `EMBEDDING_BUCKET_NAME` from the environment variables, which is used to store intermediate extracted text files.

### Helper Functions <a name="helper-functions"></a>
- **store_doc_texts**: Downloads a document (e.g., a PDF) from S3, extracts text from each page using **pymupdf**, and uploads each page's text as a separate file back to S3.
- **store_doc_chunks**: Downloads each text file from S3, splits the content into semantic chunks using **SemanticChunker**, and attaches metadata to each chunk before adding them to the vectorstore.

### Main Functions <a name="main-functions"></a>
- **add_document**: Combines the helper functions to process a document. It first extracts and stores text pages via **store_doc_texts**, then splits the text into semantic chunks via **store_doc_chunks**, and finally returns a list of document chunks ready for indexing.
- **process_documents**: The primary function that iterates over all documents in a specified category folder within an S3 bucket, processes each document via **add_document**, and updates the vectorstore index using a **SQLRecordManager**.

### Execution Flow <a name="execution-flow"></a>
1. **Document Extraction**: The script downloads documents from a specified S3 bucket and extracts page-level text content using **store_doc_texts**.
2. **Semantic Chunking**: The extracted text is divided into semantic chunks by **store_doc_chunks**.
3. **Vectorstore Update**: Each document's chunks are processed by **add_document** and then indexed using **process_documents**, which integrates with a PostgreSQL-backed vectorstore and a SQLRecordManager.

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Function: `store_doc_texts` <a name="store_doc_texts"></a>
```python
def store_doc_texts(
    bucket: str,
    category_id: str, 
    document_name: str, 
    output_bucket: str
) -> List[str]:
    """
    Extract and store the text from each document page in an S3 bucket.

    This function constructs the S3 key from the given prefix (`category_id`) and 
    file name (`document_name`), then uses PyMuPDF to extract the text from each 
    page of the document. Each page's text is uploaded to the `output_bucket` as a 
    separate file. The resulting objects follow the pattern:
    
        <category_id>/<document_name>_page_<page_num>.txt
        
    Example:
        If category_id = "docs" and document_name = "example.pdf", the full S3 key 
        will be "docs/example.pdf", and the resulting page texts will be stored as:

            docs/example.pdf_page_1.txt
            docs/example.pdf_page_2.txt

    Args:
        bucket (str): The name of the S3 bucket containing the document.
        category_id (str): The folder or category ID in the S3 bucket where the document is stored.
        document_name (str): The name of the document file.
        output_bucket (str): The name of the S3 bucket where the extracted text files will be stored.

    Returns:
        List[str]: A list of keys corresponding to the stored text files for each page.
    """
```

#### Purpose
Splits a document (e.g., a PDF) into separate text files for each page and uploads them to an S3 bucket.

#### Process Flow
1. Finds the document in the S3 folder.
2. Open the document with pymupdf.
3. Extract text from each page and write it to a BytesIO buffer.
4. Upload each page’s text to the output S3 bucket.
5. Return a list of generated file keys.

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
        bucket (str): The name of the S3 bucket containing the document.
        category_id (str): The folder or category ID in the S3 bucket where the document is stored.
        document_name (str): The name of the document file.
        vectorstore (PGVector): The vectorstore instance where document chunks will be stored.
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
4. Note: The final indexing is triggered later in `process_documents`.

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

    This function downloads each text file (each representing a page of a document) from the specified S3 bucket,
    uses a semantic text splitter to create chunks, attaches metadata including the source S3 URL and a unique document ID,
    and then adds these chunks to the vectorstore. After processing, the original text file is deleted from the bucket.

    Args:
        bucket (str): The name of the S3 bucket containing the text files.
        documentnames (List[str]): A list of keys for the text files in the bucket.
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
    processes each document by extracting its text and splitting it into chunks (via `add_document`),
    and then indexes all document chunks in the vectorstore using the provided record manager.
    If no document chunks are found, a cleanup indexing operation is still performed.

    Args:
        bucket (str): The name of the S3 bucket containing the documents.
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
6. Note: This function calls `add_document` for each file and then calls `index(...)`.

#### Inputs and Outputs
- **Inputs**:
  - S3 bucket name and category folder.
  - Instances of **PGVector**, **BedrockEmbeddings**, and **SQLRecordManager**.
- **Outputs**:
  - None (the function updates the vectorstore by side effect).

---

[🔼 Back to top](#table-of-contents)
