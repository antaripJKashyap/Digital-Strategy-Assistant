import os, tempfile, logging, uuid
from io import BytesIO
from typing import List, Optional, Dict
import boto3, pymupdf
from langchain_aws import BedrockEmbeddings
from langchain_postgres import PGVector
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the clients
s3 = boto3.client('s3')
bedrock_client = boto3.client(service_name='bedrock')
bedrock_runtime_client = boto3.client(service_name='bedrock-runtime')

def setup_guardrail(guardrail_name: str) -> tuple[str, str]:
    """
    Returns (guardrail_id, version) after ensuring a valid published guardrail exists.
    """
    guardrail_name = guardrail_name
    guardrail_name_exists = False
    guardrail_id = None
    guardrail_version = None

    # Check if a guardrail with the name 'guardrail_name' exists
    paginator = bedrock_client.get_paginator('list_guardrails')
    for page in paginator.paginate():
        for guardrail in page.get('guardrails', []):
            if guardrail['name'] == guardrail_name:
                logger.info(f"Found guardrail name={guardrail_name}, version={guardrail_version}, id={guardrail_id}")
                guardrail_id = guardrail['id']
                guardrail_version = guardrail.get('version')
                guardrail_name_exists = True

    # If not 'guardrail_name_exists', then create a new guardrail with the name 'guardrail_name' and publish it
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
        guardrail_id = response['guardrailId']
        logger.info(f"ID: {guardrail_id}")
        
        # Publish the initial version
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
    logger.info("Starting document processing...")

    guardrail_id, guardrail_version = setup_guardrail(guardrail_name='comprehensive-guardrails')  
    if not guardrail_version.isdigit():
        raise ValueError(f"Invalid guardrail version: {guardrail_version}")

    # Collect all document keys to process
    document_keys = []
    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket, Prefix=f"{category_id}/")
    try:
        for page in page_iterator:
            if "Contents" not in page:
                continue
            for obj in page['Contents']:
                key = obj['Key']
                if not key.endswith("/"):
                    document_keys.append(key)
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise

    all_docs = []
    error_message = None

    for document_key in document_keys:
        logger.info(f"Processing document: {document_key}")
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
                tmp_path = tmp_file.name
                s3.download_file(bucket, document_key, tmp_path)

            doc_pdf = pymupdf.open(tmp_path)
            doc_id = str(uuid.uuid4())
            
            for page_idx, page in enumerate(doc_pdf, start=1):
                page_text = page.get_text().strip()
                if not page_text:
                    continue

                # Apply guardrail check
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
                    
                    # Guardrail response handling
                    if response.get('action') == 'GUARDRAIL_INTERVENED':
                        error_message = None
                        # Check assessments in priority order
                        for assessment in response.get('assessments', []):
                            # 1. Check for financial advice and 2. offensive content
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

                            # 3. Check for PII
                            if not error_message and 'sensitiveInformationPolicy' in assessment:
                                for pii in assessment['sensitiveInformationPolicy'].get('piiEntities', []):
                                    if pii.get('action') in ['BLOCKED', 'ANONYMIZED']:
                                        error_message = "Sorry, I cannot process your document(s) because I've detected sensitive (personally identifiable) information in them."
                                        break
                                if error_message:
                                    break

                        # If no specific error found but guardrail intervened
                        if not error_message:
                            error_message = "Sorry, I cannot process your document(s) due to restricted content."

                        # Cleanup and return
                        doc_pdf.close()
                        return error_message

                except Exception as e:
                    logger.error(f"Error applying guardrail: {e}")
                    raise

                # Create document if no guardrail triggered
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
        finally:
            # Safe cleanup: Only delete if file exists
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
                logger.debug(f"Cleaned up temp file: {tmp_path}")

    # If no errors, add to vectorstore and delete S3 objects
    if all_docs:
        vectorstore.add_documents(all_docs)
        logger.info(f"Added {len(all_docs)} documents to vectorstore.")
    for key in document_keys:
        s3.delete_object(Bucket=bucket, Key=key)
        logger.info(f"Deleted {key} from S3.")
    
    return "SUCCESS"
