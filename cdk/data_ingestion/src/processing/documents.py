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
# BUCKET_NAME = "DSA-data-ingestion-bucket"
EMBEDDING_BUCKET_NAME = os.environ["EMBEDDING_BUCKET_NAME"]
print('EMBEDDING_BUCKET_NAME',EMBEDDING_BUCKET_NAME)

# DLS header list for course assessment (phase 2)
dls_header_list = [
    "Enhancing inclusivity within digital post-secondary education",
    "Advancing lasting and meaningful reconciliation in technology-enhanced learning environments",
    "Building an accessible, affordable, and sustainable digital post-secondary education",
    "Taking a human-centred approach",
    "Providing lifelong learning opportunities",
    "Developing technology, infrastructure, and human resources to make post-secondary education more equitable",
    "Building a collaborative post-secondary system",
    "Making the digital space safer",
    "Conducting research and implementing evaluation tools into digital learning technologies, models, and pedagogy",
    "Institutional leadership strategies for technology-enhanced learning",
    "Pedagogy strategies for technology-enhanced learning",
    "Glossary"
]

import json
import pymupdf
from typing import List

def extract_guidelines_all(
    pdf_path: str, 
    header_list: List[str]
) -> None:
    """
    Extract guidelines from a PDF document and store them in JSON format on S3.

    Args:
        pdf_path (str): The path to the PDF file containing the guidelines.
        header_list (List[str]): A list of guideline headers as strings. The last header is used as a stopping 
                                 condition for parsing the document.

    Raises:
        ValueError: If no text was extracted for any given guideline.
        Exception: For any other unexpected errors that occur during processing.

    Returns:
        None: The function writes its output to 'dls_guidelines.json' in the 'text-extraction-data-dls' S3 bucket.
    """
    try:
        doc = pymupdf.open(pdf_path)
        content = {}
        current_header = None
        current_bullet = None
        buffer = ""
        stop_processing = False

        # Mapping normalized headers to their original form, ignoring the last header "Glossary"
        normalized_headers = {header.replace(" ", "").lower(): header for header in header_list[:-1]}

        # Prepopulate content with all headers so they always appear, ignoring the last header "Glossary"
        for header in header_list[:-1]:
            content[header] = []

        last_header = header_list[-1]

        for page_num in range(len(doc)):
            if stop_processing:
                break

            page = doc.load_page(page_num)
            text = page.get_text("text")
            lines = text.split("\n")

            for line in lines:
                if stop_processing:
                    break

                buffer += line.strip() + " "

                # Check if the buffer matches any header
                normalized_buffer = buffer.replace(" ", "").lower()
                for norm_header, orig_header in normalized_headers.items():
                    if norm_header in normalized_buffer:
                        # If we've reached the last header, stop processing
                        if orig_header == last_header:
                            stop_processing = True
                            break  # Exit the header checking loop

                        # Save current bullet point before changing header
                        if current_bullet and current_header in content:
                            content[current_header].append(current_bullet.strip())
                            current_bullet = None

                        current_header = orig_header
                        buffer = ""  # Clear buffer once the header is matched
                        break  # Stop checking other headers if one is matched

                # If we are within a section under a header, process bullet points
                if current_header and not stop_processing:
                    if "•" in line:
                        # Save the current bullet point if any
                        if current_bullet:
                            content[current_header].append(current_bullet.strip())
                        current_bullet = line.strip()  # Start a new bullet point
                    elif current_bullet is not None:
                        # Append subsequent lines to the current bullet point
                        current_bullet += " " + line.strip()

        # Save any remaining bullet point after the loop ends
        if current_header and current_bullet:
            content[current_header].append(current_bullet.strip())

        # Content cleanup: remove any text after the last full stop in each bullet point
        for key in list(content.keys()):
            bullets = content[key]
            new_bullets = []
            for bullet in bullets:
                index = bullet.rfind('.')
                if index != -1:
                    new_bullet = bullet[:index+1]  # Include the full stop
                    new_bullets.append(new_bullet)
                else:
                    new_bullets.append(bullet)
            content[key] = new_bullets

        # Validate content
        for key, bullets in content.items():
            if not bullets:
                # Raise an error if no text was extracted for the guideline
                raise ValueError(f"No text was extracted for the guideline: '{key}'")

        # Instead of writing to a local file, write directly to S3
        # Use BytesIO as a file-like object for S3 upload
        json_buffer = BytesIO()
        json.dump(content, json_buffer, indent=4, ensure_ascii=False)
        json_buffer.seek(0)

        s3.upload_fileobj(json_buffer, 'text-extraction-data-dls', 'dls_guidelines.json')

    except Exception as e:
        print(f"An error occurred: {e}")

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
    category (str): The category ID folder in the S3 bucket.
    filename (str): The name of the document file.
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
    
    Args:
    bucket (str): The name of the S3 bucket containing the text files.
    filenames (List[str]): A list of keys for the text files in the bucket.
    vectorstore (PGVector): The vectorstore instance.
    embeddings (BedrockEmbeddings): The embeddings instance.
    
    Returns:
    List[Document]: A list of all document chunks for this document that were added to the vectorstore.
    """
    text_splitter = SemanticChunker(embeddings)
    this_doc_chunks = []

    for documentname in documentnames:
        this_uuid = str(uuid.uuid4()) # Generating one UUID for all chunks of from a specific page in the document
        output_buffer = BytesIO()
        s3.download_fileobj(bucket, documentname, output_buffer)
        output_buffer.seek(0)
        doc_texts = output_buffer.read().decode('utf-8')
        doc_chunks = text_splitter.create_documents([doc_texts])
        
        head, _, _ = documentname.partition("_page")
        true_filename = head # Converts 'CourseCode_XXX_-_Course-Name.pdf_page_1.txt' to 'CourseCode_XXX_-_Course-Name.pdf'
        
        doc_chunks = [x for x in doc_chunks if x.page_content]
        
        for doc_chunk in doc_chunks:
            if doc_chunk:
                doc_chunk.metadata["source"] = f"s3://{bucket}/{true_filename}"
                doc_chunk.metadata["doc_id"] = this_uuid
            else:
                logger.warning(f"Empty chunk for {documentname}")
        
        s3.delete_object(Bucket=bucket,Key=documentname)
        print(f"Deleting {documentname} from {bucket}")
        this_doc_chunks.extend(doc_chunks)
       
    return this_doc_chunks
'''                
def process_documents(
    bucket: str,
    category_id: str, 
    vectorstore: PGVector, 
    embeddings: BedrockEmbeddings,
    record_manager: SQLRecordManager
) -> None:
    """
    Process and add text documents from an S3 bucket to the vectorstore.
    
    Args:
    bucket (str): The name of the S3 bucket containing the text documents.
    course (str): The course ID folder in the S3 bucket.
    vectorstore (PGVector): The vectorstore instance.
    embeddings (BedrockEmbeddings): The embeddings instance.
    record_manager (SQLRecordManager): Manages list of documents in the vectorstore for indexing.
    """
    print("start processing document")
    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket, Prefix=f"{category_id}/")
    all_doc_chunks = []
    
    try:
        for page in page_iterator:
            print("checking paginator  003")
            if "Contents" not in page:
                continue  # Skip pages without any content (e.g., if the bucket is empty)
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
'''
def process_documents(
    bucket: str,
    category_id: str, 
    vectorstore: PGVector, 
    embeddings: BedrockEmbeddings,
    record_manager: SQLRecordManager
) -> None:
    """
    Process and add text documents from an S3 bucket to the vectorstore.
    
    Args:
    bucket (str): The name of the S3 bucket containing the text documents.
    category_id (str): The category ID folder in the S3 bucket.
    vectorstore (PGVector): The vectorstore instance.
    embeddings (BedrockEmbeddings): The embeddings instance.
    record_manager (SQLRecordManager): Manages list of documents in the vectorstore for indexing.
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

                # Check if the document name contains 'digital_learning_strategy'
                if "digital_learning_strategy" in documentname:
                    # Download the PDF locally
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
                        s3.download_fileobj(bucket, documentname, tmp_file)
                        tmp_file_path = tmp_file.name
                    
                    # Extract guidelines
                    extract_guidelines_all(tmp_file_path, dls_header_list)
                    
                    # Upload the resulting dls_guidelines.json to the 'text-extraction-data-dls' bucket
                    with open('dls_guidelines.json', 'rb') as fp:
                        s3.upload_fileobj(fp, 'text-extraction-data-dls', 'dls_guidelines.json')
                    
                    # Remove the temporary local PDF file and the local json file
                    os.remove(tmp_file_path)
                    os.remove('dls_guidelines.json')

                # Proceed with normal document processing
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
