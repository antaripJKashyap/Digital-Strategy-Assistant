import os, tempfile, logging, uuid
from io import BytesIO
from typing import List
import boto3, pymupdf
from langchain_aws import BedrockEmbeddings
from langchain_postgres import PGVector
from langchain_core.documents import Document
from langchain_experimental.text_splitter import SemanticChunker
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.indexes import SQLRecordManager, index

# from transformers import pipeline

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the S3 client
s3 = boto3.client('s3')
# BUCKET_NAME = "DSA-data-ingestion-bucket"
EMBEDDING_BUCKET_NAME = os.environ["EMBEDDING_BUCKET_NAME"]

print('EMBEDDING_BUCKET_NAME', EMBEDDING_BUCKET_NAME)

# Initialize the offensive content classifier
# offensive_classifier = pipeline("text-classification", model="cardiffnlp/twitter-roberta-base-offensive")

def extract_txt(
    bucket: str,
    document_key: str
) -> str:
    """
    Extract text from a file stored in an S3 bucket.
    
    Args:
    bucket (str): The name of the S3 bucket.
    file_key (str): The key of the file in the S3 bucket.
    
    Returns:
    str: The extracted text.
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
    Store the text of each page of a document in an S3 bucket.
    
    Args:
    bucket (str): The name of the S3 bucket containing the document.
    category_id (str): The category ID folder in the S3 bucket.
    document_name (str): The name of the document file.
    output_bucket (str): The name of the S3 bucket for storing the extracted text.
    
    Returns:
    List[str]: A list of keys for the stored text files in the output bucket.
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
    Add a document to the vectorstore.
    
    Args:
    bucket (str): The name of the S3 bucket containing the document.
    category_id (str): The category ID folder in the S3 bucket.
    document_name (str): The name of the document file.
    vectorstore (PGVector): The vectorstore instance.
    embeddings (BedrockEmbeddings): The embeddings instance.
    output_bucket (str, optional): The name of the S3 bucket for storing extracted data. Defaults to 'temp-extracted-data'.
    
    Returns:
    List[Document]: A list of all document chunks for this document that were added to the vectorstore.
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
    Store chunks of documents in the vectorstore.
    
    Before embedding them, check if any chunk is offensive. If yes, raise an error and stop the pipeline.
    
    Args:
    bucket (str): The name of the S3 bucket containing the text files.
    documentnames (List[str]): A list of keys for the text files in the bucket.
    vectorstore (PGVector): The vectorstore instance.
    embeddings (BedrockEmbeddings): The embeddings instance.
    
    Returns:
    List[Document]: A list of all document chunks for this document that were added to the vectorstore.
    """
    #text_splitter = SemanticChunker(embeddings)
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=100, chunk_overlap=0)
    this_doc_chunks = []

    for documentname in documentnames:
        this_uuid = str(uuid.uuid4()) # One UUID for all chunks from a specific page
        output_buffer = BytesIO()
        s3.download_fileobj(bucket, documentname, output_buffer)
        output_buffer.seek(0)
        doc_texts = output_buffer.read().decode('utf-8')
        doc_chunks = text_splitter.create_documents([doc_texts])
        
        head, _, _ = documentname.partition("_page")
        true_filename = head
        
        doc_chunks = [x for x in doc_chunks if x.page_content]

        # Check each doc_chunk for offensive content
        # for doc_chunk in doc_chunks:
            # predictions = offensive_classifier(doc_chunk.page_content)
            # label = predictions[0]['label']
            # score = predictions[0]['score']
            # if label == "offensive":  # If flagged as offensive, raise an error
                # s3.delete_object(Bucket=bucket, Key=documentname)
                # raise ValueError(f"Offensive content detected in chunk: {doc_chunk.page_content[:50]}... (label={label}, score={score})")

        # If none are offensive, then proceed
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
    embeddings: BedrockEmbeddings
) -> None:
    """
    Process and add text documents from an S3 bucket to the vectorstore.
    
    Args:
    bucket (str): The name of the S3 bucket containing the text documents.
    category_id (str): The category ID folder in the S3 bucket.
    vectorstore (PGVector): The vectorstore instance.
    embeddings (BedrockEmbeddings): The embeddings instance.
    """
    print("start processing document")
    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket, Prefix=f"{category_id}/")
    all_doc_chunks = []
    
    try:
        for page in page_iterator:
            print("checking paginator  003")
            if "Contents" not in page:
                continue  # Skip pages without any content (e.g. if the bucket is empty)
            for document in page['Contents']:
                documentname = document['Key']
                # Skip directories (common in S3 listings)
                if documentname.endswith('/'):
                    continue
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
    
    if all_doc_chunks:  # If there are new document chunks, add them to the vectorstore
        added_docs_ids = vectorstore.add_documents(all_doc_chunks)
        print(f"{len(added_docs_ids)} document chunks added with ids = {added_docs_ids}")
