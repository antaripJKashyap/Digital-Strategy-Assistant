import os, tempfile, logging, uuid
from io import BytesIO
from typing import List
import boto3, pymupdf
from langchain_aws import BedrockEmbeddings
from langchain_postgres import PGVector
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


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
                
def process_documents(
    bucket: str,
    category_id: str, 
    vectorstore: PGVector, 
    embeddings: BedrockEmbeddings
) -> None:
    """
    Process and add text documents from an S3 bucket to the vectorstore.
    
    Args:
        bucket (str): The name of the S3 bucket containing the documents.
        category_id (str): The folder/prefix for these documents in S3.
        vectorstore (PGVector): The vectorstore instance.
        embeddings (BedrockEmbeddings): The embeddings instance.
    """
    print("Start processing documents...")

    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket, Prefix=f"{category_id}/")

    try:
        for page in page_iterator:
            # If the S3 bucket (for this prefix) is empty, skip
            if "Contents" not in page:
                continue

            for document_obj in page['Contents']:
                document_key = document_obj["Key"]

                # Skip "folder" objects in S3
                if document_key.endswith("/"):
                    continue

                print(f"Processing: {document_key}")

                # 1) Download the PDF to a temp file
                with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
                    s3.download_file(bucket, document_key, tmp_file.name)
                    tmp_file_path = tmp_file.name

                # 2) Open and extract each page
                docs = []
                doc_id = str(uuid.uuid4()) # One UUID for all texts extracted from a specific document
                try:
                    doc_pdf = pymupdf.open(tmp_file_path)
                    
                    for page_index, page_data in enumerate(doc_pdf, start=1):
                        page_text = page_data.get_text()

                        # Skip empty pages
                        if not page_text.strip():
                            continue

                        # Create a Document object for each page
                        # You can add more metadata: e.g. "topic", "location", etc.
                        new_doc = Document(
                            page_content=page_text,
                            metadata={
                                "id": doc_id,
                                "filename": document_key,
                                "page": page_index,
                                "category_id": category_id,
                            }
                        )
                        docs.append(new_doc)

                    doc_pdf.close()
                finally:
                    # Clean up local file
                    os.remove(tmp_file_path)

                # 3) Add them to the vector store in one shot
                if docs:
                    vectorstore.add_documents(docs)
                    print(f"Added {len(docs)} documents to the vector store.")

                # Deleting the S3 object after processing
                s3.delete_object(Bucket=bucket, Key=document_key)
                print(f"Deleted {document_key} from S3 after ingestion.")

    except Exception as e:
        logger.error(f"Error processing documents: {e}")
        raise
