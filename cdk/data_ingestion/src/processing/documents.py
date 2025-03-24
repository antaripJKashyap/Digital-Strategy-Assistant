import os, logging, uuid
from io import BytesIO
from typing import List
import boto3, pymupdf
from langchain_aws import BedrockEmbeddings
from langchain_postgres import PGVector
from langchain_core.documents import Document
from langchain_experimental.text_splitter import SemanticChunker
from langchain.indexes import SQLRecordManager, index

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the S3 client
s3 = boto3.client('s3')
EMBEDDING_BUCKET_NAME = os.environ["EMBEDDING_BUCKET_NAME"]


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
    # Get document bytes directly from S3
    response = s3.get_object(Bucket=bucket, Key=f"{category_id}/{document_name}")
    file_data = response['Body'].read()
    
    # Process document in memory
    document_filetype = document_name.split('.')[-1].lower()
    doc = pymupdf.open(stream=file_data, filetype=document_filetype)

    # Upload each page's text to S3
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text().encode("utf8")
        page_output_key = f'{category_id}/{document_name}_page_{page_num}.txt'
        
        with BytesIO(text) as page_output_buffer:
            s3.upload_fileobj(page_output_buffer, output_bucket, page_output_key)

    return [f'{category_id}/{document_name}_page_{page_num}.txt' for page_num in range(1, len(doc) + 1)]

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
    output_filenames = store_doc_texts(
        bucket=bucket,
        category_id=category_id,
        document_name=document_name,
        output_bucket=output_bucket
    )
    this_doc_chunks = store_doc_chunks(
        bucket=output_bucket,
        documentnames=output_filenames,
        vectorstore=vectorstore,
        embeddings=embeddings
    )
    
    return this_doc_chunks

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
    text_splitter = SemanticChunker(embeddings)
    this_doc_chunks = []

    for documentname in documentnames:
        this_uuid = str(uuid.uuid4())  # Generating one UUID for all chunks from a specific page in the document
        output_buffer = BytesIO()
        s3.download_fileobj(bucket, documentname, output_buffer)
        output_buffer.seek(0)
        doc_texts = output_buffer.read().decode('utf-8')
        doc_chunks = text_splitter.create_documents([doc_texts])
        
        head, _, _ = documentname.partition("_page")
        true_filename = head  # Converts 'CourseCode_XXX_-_Course-Name.pdf_page_1.txt' to 'CourseCode_XXX_-_Course-Name.pdf'
        
        doc_chunks = [x for x in doc_chunks if x.page_content]
        
        for doc_chunk in doc_chunks:
            if doc_chunk:
                doc_chunk.metadata["source"] = f"s3://{bucket}/{true_filename}"
                doc_chunk.metadata["doc_id"] = this_uuid
            else:
                logger.warning(f"Empty chunk for {documentname}")
        
        s3.delete_object(Bucket=bucket, Key=documentname)
        
        this_doc_chunks.extend(doc_chunks)
       
    return this_doc_chunks

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
    
    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket, Prefix=f"{category_id}/")
    all_doc_chunks = []
    
    try:
        for page in page_iterator:
            if "Contents" not in page:
                continue  # Skip pages without any content
            for document in page['Contents']:
                documentname = document['Key']

                this_doc_chunks = add_document(
                    bucket=bucket,
                    category_id=category_id,
                    document_name=documentname.split('/')[-1],
                    vectorstore=vectorstore,
                    embeddings=embeddings
                )

                all_doc_chunks.extend(this_doc_chunks)

    except Exception as e:
        logger.error(f"Error processing documents: {e}")
        raise
    
    if all_doc_chunks:  # Check if there are any documents to index
        idx = index(
            all_doc_chunks, 
            record_manager, 
            vectorstore, 
            cleanup="full",
            source_id_key="source"
        )
        logger.info(f"Indexing updates: \n {idx}")
    else:
        idx = index(
            [],
            record_manager, 
            vectorstore, 
            cleanup="full",
            source_id_key="source"
        )
        logger.info("No documents found for indexing.")
