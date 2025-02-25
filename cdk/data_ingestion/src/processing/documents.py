import os, tempfile, logging, uuid
from io import BytesIO
from typing import List
import boto3, pymupdf, json
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
print('EMBEDDING_BUCKET_NAME', EMBEDDING_BUCKET_NAME)

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
    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        s3.download_fileobj(bucket, document_key, tmp_file)
        tmp_file_path = tmp_file.name

    try:
        with open(tmp_file_path, 'r', encoding='utf-8') as file:
            text = file.read()
    finally:
        os.remove(tmp_file_path)

    return text

def store_doc_texts(
    bucket: str,
    category_id: str, 
    document_name: str, 
    output_bucket: str
) -> List[str]:
    """
    Extract and store the text from each page of a document in an S3 bucket.

    This function downloads a document (such as a PDF) from the specified S3 bucket and category folder,
    extracts the text from each page using pymupdf, and stores each page's text as a separate file in the output S3 bucket.
    The generated file keys follow the pattern: `<category_id>/<document_name>_page_<page_num>.txt`.

    Args:
        bucket (str): The name of the S3 bucket containing the document.
        category_id (str): The folder or category ID in the S3 bucket where the document is stored.
        document_name (str): The name of the document file.
        output_bucket (str): The name of the S3 bucket where the extracted text files will be stored.

    Returns:
        List[str]: A list of keys corresponding to the stored text files for each page.
    """
    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        s3.download_file(bucket, f"{category_id}/{document_name}", tmp_file.name)
        doc = pymupdf.open(tmp_file.name)
        
        with BytesIO() as output_buffer:
            for page_num, page in enumerate(doc, start=1):
                text = page.get_text().encode("utf8")
                output_buffer.write(text)
                output_buffer.write(bytes((12,)))
                
                page_output_key = f'{category_id}/{document_name}_page_{page_num}.txt'
                
                with BytesIO(text) as page_output_buffer:
                    s3.upload_fileobj(page_output_buffer, output_bucket, page_output_key)

        os.remove(tmp_file.name)

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
        print(f"Deleting {documentname} from {bucket}")
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
    print("start processing document")
    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket, Prefix=f"{category_id}/")
    all_doc_chunks = []
    
    try:
        for page in page_iterator:
            print("checking paginator  003")
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
