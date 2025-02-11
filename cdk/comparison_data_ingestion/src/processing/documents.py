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

def parse_guardrail_response(response: dict) -> dict:
    """
    Parses the guardrail response to determine if any guardrails were triggered.
    """
    if response.get("action") == "NONE":
        return {"triggered": False}

    for assessment in response.get("assessments", []):
        if "sensitiveInformationPolicy" in assessment:
            pii_entities = assessment["sensitiveInformationPolicy"].get("piiEntities", [])
            if any(entity.get("action") in ["BLOCKED", "ANONYMIZED"] for entity in pii_entities):
                return {
                    "triggered": True,
                    "type": "SensitiveInformation",
                    "details": {"entities": pii_entities}
                }
        if "contentPolicy" in assessment:
            filters = assessment["contentPolicy"].get("filters", [])
            for f in filters:
                if f.get("action") == "BLOCKED" and f.get("type") in [
                    "INSULTS", "HATE", "SEXUAL", "VIOLENCE", "MISCONDUCT", "PROMPT_ATTACK"
                ]:
                    return {"triggered": True, "type": "OffensiveContent", "details": {}}
    for output in response.get("outputs", []):
        if "financial advice" in output.get("text", "").lower():
            return {"triggered": True, "type": "FinancialAdvice", "details": {}}
    return {"triggered": True, "type": "RestrictedContent", "details": {}}

def setup_guardrail() -> str:
    """
    Ensures the guardrail exists and returns its ID.
    Creates the guardrail and a version if it doesn't exist.
    """
    guardrail_name = "comprehensive-guardrails"
    guardrail_id = None

    # Check existing guardrails
    response = bedrock_client.list_guardrails()
    for guardrail in response.get('guardrails', []):
        if guardrail['name'] == guardrail_name:
            guardrail_id = guardrail['id']
            break

    # Create guardrail if not found
    if not guardrail_id:
        response = bedrock_client.create_guardrail(
            name=guardrail_name,
            description='Guardrail to prevent financial advice, offensive content, and exposure of PII.',
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
                    {'type': 'EMAIL', 'action': 'ANONYMIZE'},
                    {'type': 'PHONE', 'action': 'ANONYMIZE'},
                    {'type': 'NAME', 'action': 'ANONYMIZE'}
                ]
            },
            blockedInputMessaging='Sorry, I cannot respond to that.',
            blockedOutputsMessaging='Sorry, I cannot respond to that.'
        )
        guardrail_id = response['guardrailId']
        # Create initial version ("1")
        bedrock_client.create_guardrail_version(
            guardrailIdentifier=guardrail_id,
            description='comprehensive-guardrails',
            clientRequestToken=str(uuid.uuid4())
        )
    return guardrail_id

def process_documents(
    bucket: str,
    category_id: str, 
    vectorstore: PGVector, 
    embeddings: BedrockEmbeddings
) -> str:
    """
    Process and add text documents from an S3 bucket to the vectorstore after checking guardrails.
    Returns a success message or an error message if a guardrail is triggered.
    """
    logger.info("Starting document processing...")
    guardrail_id = setup_guardrail()
    guardrail_version = "1" # The first version guardrail_name

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
        with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
            s3.download_file(bucket, document_key, tmp_file.name)
            tmp_path = tmp_file.name

        try:
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
                        content=[{"text": {"text": page_text, "qualifiers": ["grounding_source"]}}]
                    )
                    guardrail_info = parse_guardrail_response(response)
                    if guardrail_info.get("triggered"):
                        error_type = guardrail_info["type"]
                        if error_type == "FinancialAdvice":
                            error_message = "Sorry, I cannot process your document(s) because I've detected financial advice in them."
                        elif error_type == "OffensiveContent":
                            error_message = "Sorry, I cannot process your document(s) because I've detected offensive content in them."
                        elif error_type == "SensitiveInformation":
                            error_message = "Sorry, I cannot process your document(s) because I've detected sensitive (personally identifiable) information in them."
                        else:
                            error_message = f"Sorry, I cannot process your document(s) because I've detected {error_type.lower()} in them."
                        doc_pdf.close()
                        os.remove(tmp_path)
                        return error_message
                except Exception as e:
                    logger.error(f"Error applying guardrail: {e}")
                    os.remove(tmp_path)
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
            os.remove(tmp_path)
            raise
        finally:
            os.remove(tmp_path)

    # If no errors, add to vectorstore and delete S3 objects
    if all_docs:
        vectorstore.add_documents(all_docs)
        logger.info(f"Added {len(all_docs)} documents to vectorstore.")
    for key in document_keys:
        s3.delete_object(Bucket=bucket, Key=key)
        logger.info(f"Deleted {key} from S3.")
    return "SUCCESS"
