import logging, uuid, time
from typing import List
import boto3, pymupdf
from langchain_postgres import PGVector
from langchain_core.documents import Document

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the clients
s3 = boto3.client('s3')
bedrock_client = boto3.client(service_name='bedrock')
bedrock_runtime_client = boto3.client(service_name='bedrock-runtime')

def setup_guardrail(guardrail_name: str) -> tuple[str, str]:
    """
    Ensure a guardrail with a given name is created and published if it doesn't exist.
    Returns a tuple (guardrail_id, guardrail_version) for the guardrail.
    
    Args:
        guardrail_name (str): The name of the guardrail to create or retrieve.
    
    Returns:
        A tuple (guardrail_id (str), guardrail_version (str)).
    """
    guardrail_name_exists = False
    guardrail_id = None
    guardrail_version = None

    # Check if a guardrail with the given name already exists
    paginator = bedrock_client.get_paginator('list_guardrails')
    for page in paginator.paginate():
        for guardrail in page.get('guardrails', []):
            if guardrail['name'] == guardrail_name:
                # If found, capture its existing ID and version
                logger.info(f"Found guardrail name={guardrail_name}, version={guardrail_version}, id={guardrail_id}")
                guardrail_id = guardrail['id']
                guardrail_version = guardrail.get('version')
                guardrail_name_exists = True

    # If the guardrail does not exist, create and publish a new one
    if not guardrail_name_exists:
        logger.info(f"Creating new guardrail\nName: {guardrail_name}")
        response = bedrock_client.create_guardrail(
            name=guardrail_name,
            description='Block financial advice and PII',
            topicPolicyConfig={
                'topicsConfig': [
                    {
                        'name': 'FinancialAdvice',
                        'definition': 'Providing personalized financial guidance or investment recommendations.',
                        'examples': [
                            'Which mutual fund should I invest in for retirement?',
                            'Can you advise on the best way to reduce my debt?'
                        ],
                        'type': 'DENY'
                    },
                    {
                        'name': 'OffensiveContent',
                        'definition': 'Content that includes hate speech, discriminatory remarks, explicit material, or language intended to offend individuals or groups.',
                        'examples': [
                            'Tell me a joke about [a specific race or religion].',
                            'Share an offensive meme targeting [a specific group].'
                        ],
                        'type': 'DENY'
                    }
                ]
            },
            sensitiveInformationPolicyConfig={
                'piiEntitiesConfig': [
                    {'type': 'EMAIL', 'action': 'BLOCK'},
                    {'type': 'PHONE', 'action': 'BLOCK'},
                    {'type': 'NAME', 'action': 'ANONYMIZE'}
                ]
            },
            blockedInputMessaging='Sorry, I cannot respond to that.',
            blockedOutputsMessaging='Sorry, I cannot respond to that.'
        )
        
        # Wait for 5 seconds so that the guardrail's status can become 'READY'
        logger.info("Waiting for 5 seconds so that the created guardrail's status changes to 'READY'...")
        time.sleep(5)
        
        guardrail_id = response['guardrailId']
        logger.info(f"ID: {guardrail_id}")
        
        # Publish the initial version of the guardrail
        version_response = bedrock_client.create_guardrail_version(
            guardrailIdentifier=guardrail_id,
            description='Published version',
            clientRequestToken=str(uuid.uuid4())
        )
        guardrail_version = version_response['version']
        logger.info(f"Version: {guardrail_version}")

    print(f"\n\nReturning guardrail with name = {guardrail_name}, id = {guardrail_id}, version = {guardrail_version}.")
    return guardrail_id, guardrail_version

def process_documents(
    bucket: str,
    category_id: str, 
    vectorstore: PGVector
) -> str:
    """
    Process documents stored in an S3 bucket under the provided category ID. 
    
    1. Retrieve or create guardrails needed for content filtering.
    2. List documents in the specified S3 path.
    3. Download and process each document (PDF), page by page.
    4. Apply the configured guardrail checks via the Bedrock Runtime.
       - If any restricted content is found, all documents are deleted from S3, 
         and processing is aborted with an error message.
    5. Otherwise, successful documents are added to the vectorstore, 
       and the originals are removed from S3.

    Args:
        bucket (str): The name of the S3 bucket containing documents to process.
        category_id (str): A specific prefix in the S3 bucket indicating which 
                        documents to process.
        vectorstore (PGVector): An instance of PGVector for adding the processed documents.
    
    Returns:
        str: 
            - "SUCCESS" if documents are processed successfully without triggering 
              guardrail conflicts. 
            - Otherwise, an error message string if restricted content is detected.
    """
    logger.info("Starting document processing...")

    # Setup or retrieve the necessary guardrail
    guardrail_id, guardrail_version = setup_guardrail(guardrail_name='comprehensive-guardrails')

    # Collect all document keys under the specified prefix
    document_keys = []
    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket, Prefix=f"{category_id}/")
    try:
        for page in page_iterator:
            if "Contents" not in page:
                continue
            for obj in page['Contents']:
                key = obj['Key']
                # Skip folders (keys ending with "/")
                if not key.endswith("/"):
                    document_keys.append(key)
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise

    all_docs = []
    error_message = None

    # Process each document individually
    for document_key in document_keys:
        logger.info(f"Processing document: {document_key}")
        try:
            # Get the document directly from S3 as bytes
            response = s3.get_object(Bucket=bucket, Key=document_key)
            file_data = response['Body'].read()
            
            # Open the document using pymupdf
            document_filetype = document_key.split('.')[-1].lower()
            doc_pdf = pymupdf.open(stream=file_data, filetype=document_filetype)
            doc_id = str(uuid.uuid4())
            
            # Extract text from each page
            for page_idx, page in enumerate(doc_pdf, start=1):
                page_text = page.get_text().strip()
                if not page_text:
                    continue

                # Apply the guardrail to the extracted text
                try:
                    response = bedrock_runtime_client.apply_guardrail(
                        guardrailIdentifier=guardrail_id,
                        guardrailVersion=guardrail_version,
                        source="INPUT",
                        content=[{"text": {
                            "text": page_text,
                            "qualifiers": ["guard_content"]}
                        }]
                    )
                    
                    # Check if guardrail intervention occurred
                    if response.get('action') == 'GUARDRAIL_INTERVENED':
                        error_message = None
                        # Inspect each assessment for violations in order of priority
                        for assessment in response.get('assessments', []):
                            # Topics policy checks (Financial Advice, Offensive Content)
                            if 'topicPolicy' in assessment:
                                for topic in assessment['topicPolicy'].get('topics', []):
                                    if topic.get('name') == 'FinancialAdvice' and topic.get('action') == 'BLOCKED':
                                        error_message = "Sorry, I cannot process your document(s) because I've detected financial advice in them."
                                        break

                                    elif topic.get('name') == 'OffensiveContent' and topic.get('action') == 'BLOCKED':
                                        error_message = "Sorry, I cannot process your document(s) because I've detected offensive content in them."
                                        break
                                if error_message:
                                    break

                            # Sensitive information policy (PII) checks
                            if not error_message and 'sensitiveInformationPolicy' in assessment:
                                for pii in assessment['sensitiveInformationPolicy'].get('piiEntities', []):
                                    if pii.get('action') in ['BLOCKED', 'ANONYMIZED']:
                                        error_message = "Sorry, I cannot process your document(s) because I've detected sensitive (personally identifiable) information in them."
                                        break
                                if error_message:
                                    break

                        # If we still have no specific message but there's an intervention
                        if not error_message:
                            error_message = "Sorry, I cannot process your document(s) due to restricted content."

                        # Cleanup before aborting
                        doc_pdf.close()

                        # Delete all documents from S3 since the user must re-upload 
                        # for a new attempt
                        for key in document_keys:
                            s3.delete_object(Bucket=bucket, Key=key)
                            logger.info(f"Deleted {key} from S3.")

                        # Return the error message triggered by guardrails
                        return error_message

                except Exception as e:
                    logger.error(f"Error applying guardrail: {e}")
                    raise

                # If guardrail did not trigger a block, 
                # create a Document object for further processing
                all_docs.append(Document(
                    page_content=page_text,
                    metadata={
                        "id": doc_id,
                        "filename": document_key,
                        "page": page_idx,
                        "category_id": category_id,
                    }
                ))
            
            doc_pdf.close()
            
        except Exception as e:
            logger.error(f"Error processing document {document_key}: {e}")
            raise

    # If no guardrail errors occurred, add all documents to the vector store
    if all_docs:
        vectorstore.add_documents(all_docs)
        logger.info(f"Added {len(all_docs)} documents to vectorstore.")

    # Regardless of success or error, delete the original S3 objects if we've reached this point
    for key in document_keys:
        s3.delete_object(Bucket=bucket, Key=key)
        logger.info(f"Deleted {key} from S3.")
    
    # Return success if the process completed without guardrail intervention
    return "SUCCESS"
