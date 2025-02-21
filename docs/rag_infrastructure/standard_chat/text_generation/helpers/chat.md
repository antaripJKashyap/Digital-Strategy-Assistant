# chat.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
  - [Import Libraries](#import-libraries)
  - [AWS Configuration and Setup](#aws-configuration-and-setup)
  - [Data Models](#data-models)
  - [Helper Functions](#helper-functions)
  - [Main Functions](#main-functions)
  - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
  - [Class: `LLM_evaluation`](#class-llm_evaluation)
  - [Function: `create_dynamodb_history_table`](#function-create_dynamodb_history_table)
  - [Function: `get_bedrock_llm`](#function-get_bedrock_llm)
  - [Function: `get_student_query`](#function-get_student_query)
  - [Function: `get_initial_student_query`](#function-get_initial_student_query)
  - [Function: `get_response`](#function-get_response)
  - [Function: `generate_response`](#function-generate_response)
  - [Function: `get_llm_output`](#function-get_llm_output)
  - [Function: `format_to_markdown`](#function-format_to_markdown)
  - [Function: `parse_evaluation_response`](#function-parse_evaluation_response)
  - [Function: `format_docs`](#function-format_docs)
  - [Function: `get_response_evaluation`](#function-get_response_evaluation)

---

## Script Overview <a name="script-overview"></a>
This script integrates Amazon Bedrock language models and a DynamoDB-backed chat history to support a retrieval-augmented Q&A system. It provides mechanisms to:
- Store and manage conversation history in DynamoDB.
- Retrieve an LLM from Amazon Bedrock.
- Format user queries for chat consumption.
- Generate responses using retrieval-augmented generation (RAG) chains.
- Parse, evaluate, and format LLM outputs.

### Import Libraries <a name="import-libraries"></a>
```python
import boto3, re, json
from datetime import datetime
from langchain_aws import ChatBedrock, BedrockLLM
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate, MessagesPlaceholder
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.output_parsers import StrOutputParser
from langchain.chains import create_retrieval_chain
from langchain_core.runnables import RunnablePassthrough
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import DynamoDBChatMessageHistory
from langchain_core.pydantic_v1 import BaseModel, Field
from typing import Dict, Any
```

- **boto3**: AWS SDK for interacting with services like DynamoDB.
- **re, json**: Standard libraries for regular expressions and JSON manipulation.
- **datetime**: Used for handling timestamps (if needed).
- **langchain_aws**: Provides `ChatBedrock` and `BedrockLLM` for working with Amazon Bedrock language models.
- **langchain_core**: Contains prompt templates, runnable logic, and output parsing.
- **langchain.chains**: Contains chain constructs for combining documents and creating retrieval pipelines.
- **langchain_community**: Contains chat message history integrations for DynamoDB.
- **pydantic_v1**: For data validation and modeling.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- **DynamoDB**:  
  Uses `boto3.resource("dynamodb")` and `boto3.client("dynamodb")` to manage session history tables.  

- **Amazon Bedrock**:  
  The `ChatBedrock` and `BedrockLLM` classes are leveraged to create and interact with an LLM hosted on AWS.

### Data Models <a name="data-models"></a>
- **LLM_evaluation**:  
  Pydantic-based class that encapsulates a response and a follow-up question.

### Helper Functions <a name="helper-functions"></a>
- **create_dynamodb_history_table**: Ensures a DynamoDB table exists to store chat session history.
- **get_bedrock_llm**: Retrieves a Bedrock LLM instance based on a specified model ID.
- **get_student_query**: Formats raw user queries for compatibility with downstream systems.
- **get_initial_student_query**: Builds a JSON-structured initial user prompt for role selection.
- **generate_response**: Invokes the RAG chain to generate a single response.
- **get_llm_output**: Splits a complete LLM response into main content and follow-up questions.
- **format_to_markdown**: Converts evaluation dictionaries into Markdown output.
- **parse_evaluation_response**: Recursively processes and organizes evaluation output into Markdown and question lists.
- **format_docs**: Concatenates pages or chunked document text into a single string.

### Main Functions <a name="main-functions"></a>
- **get_response**: Orchestrates retrieval of context documents, runs the question-answer chain, and prepares user-facing responses.
- **get_response_evaluation**: Evaluates documents against a set of guidelines by constructing a specialized prompt and chaining with an LLM.

### Execution Flow <a name="execution-flow"></a>
1. **DynamoDB Setup**:  
   `create_dynamodb_history_table` ensures a chat-history table is present, keyed by `SessionId`.
2. **Bedrock LLM Initialization**:  
   `get_bedrock_llm` fetches a Bedrock model instance with a specified ID and temperature.
3. **Query and Retrieval**:  
   `get_response` uses a retrieval chain to bring in context from stored documents and merges it with the chat history in DynamoDB.
4. **Response Generation**:  
   The `generate_response` function repeatedly invokes the RAG chain until a non-empty result is produced.
5. **Response Parsing**:  
   `get_llm_output` extracts main content and follow-up questions from the final LLM output.
6. **Evaluation (Optional)**:  
   `get_response_evaluation` can analyze document compliance with given guidelines, returning a structured result.

[🔼 Back to top](#table-of-contents)

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Class: `LLM_evaluation` <a name="class-llm_evaluation"></a>
```python
class LLM_evaluation(BaseModel):
    response: str = Field(description="Assessment of the student's answer with a follow-up question.")
```
#### Purpose
- Serves as a Pydantic data model to encapsulate an LLM evaluation response and possibly an additional follow-up question.

#### Attributes
- **response (str)**: Contains the assessment text generated by the LLM.

---

### Function: `create_dynamodb_history_table` <a name="function-create_dynamodb_history_table"></a>
```python
def create_dynamodb_history_table(table_name: str) -> bool:
    """
    Create a DynamoDB table to store the session history if it doesn't already exist.

    Args:
    table_name (str): The name of the DynamoDB table to create.

    Returns:
    None
    """
    ...
```
#### Purpose
- Ensures there is a DynamoDB table for storing session history (using a key schema based on `SessionId`).

#### Process Flow
1. Lists existing DynamoDB tables.
2. Checks if `table_name` is already present.
3. Creates the table if necessary, using on-demand billing mode.
4. Waits for the table to exist before returning.

#### Inputs and Outputs
- **Inputs**:
  - `table_name (str)`: Desired table name in DynamoDB.
- **Outputs**:
  - No return value, but creates the DynamoDB table if missing.

---

### Function: `get_bedrock_llm` <a name="function-get_bedrock_llm"></a>
```python
def get_bedrock_llm(
    bedrock_llm_id: str,
    temperature: float = 0
) -> ChatBedrock:
    ...
```
#### Purpose
- Retrieves a Bedrock LLM instance using a specified model ID and temperature.

#### Process Flow
1. Constructs a `ChatBedrock` instance.
2. Passes `model_kwargs` such as `temperature` for controlling response creativity.

#### Inputs and Outputs
- **Inputs**:
  - `bedrock_llm_id (str)`: The unique model ID in Amazon Bedrock.
  - `temperature (float)`: Degree of randomness in LLM responses (default 0).
- **Outputs**:
  - Returns a `ChatBedrock` instance configured with the given model ID.

---

### Function: `get_student_query` <a name="function-get_student_query"></a>
```python
def get_student_query(raw_query: str) -> str:
    ...
```
#### Purpose
- Prepares raw user input for standardized processing in the conversation chain.

#### Process Flow
1. Inserts the text `user` followed by the raw query.
2. Maintains a consistent format across calls.

#### Inputs and Outputs
- **Inputs**:
  - `raw_query (str)`: The raw question or statement from the user.
- **Outputs**:
  - A templated string with user role tagging.

---

### Function: `get_initial_student_query` <a name="function-get_initial_student_query"></a>
```python
def get_initial_student_query():
    ...
```
#### Purpose
- Provides a JSON-formatted string prompting the user to select their role (Student, Educator, or Admin).

#### Process Flow
1. Constructs a dictionary with a “message” key and an “options” list.
2. Dumps it to a JSON string, making it easily interpretable by chat interfaces.

#### Inputs and Outputs
- **Inputs**:  
  - None.
- **Outputs**:
  - Returns a JSON-formatted string that asks for role selection and provides options.

---

### Function: `get_response` <a name="function-get_response"></a>
```python
def get_response(
    query: str,
    llm: ChatBedrock,
    history_aware_retriever,
    table_name: str,
    session_id: str,
    user_prompt: str
) -> dict:
    ...
```
#### Purpose
- Orchestrates the retrieval-augmented generation process for a single user query.

#### Process Flow
1. Builds a **system prompt** that includes details about the Digital Learning Strategy.
2. Creates a RAG chain that fetches relevant documents and merges them with chat history.
3. Repeatedly calls `generate_response` until a non-empty answer emerges.
4. Splits the result into main content and follow-up questions via `get_llm_output`.

#### Inputs and Outputs
- **Inputs**:
  - `query (str)`: The user’s query text.
  - `llm (ChatBedrock)`: The Bedrock LLM used for generation.
  - `history_aware_retriever`: Retrieves relevant context documents.
  - `table_name (str)`: DynamoDB table name for storing conversation history.
  - `session_id (str)`: Unique ID for the current chat session.
  - `user_prompt (str)`: Additional instructions appended to the system prompt.
- **Outputs**:
  - A `dict` with:
    - `"llm_output"`: The main content of the LLM response.
    - `"options"`: Follow-up questions or suggestions extracted from the response.

---

### Function: `generate_response` <a name="function-generate_response"></a>
```python
def generate_response(conversational_rag_chain: object, query: str, session_id: str) -> str:
    ...
```
#### Purpose
- Invokes the RAG chain to generate the LLM’s response to a single query.

#### Process Flow
1. Calls the `invoke` method on the `conversational_rag_chain`.
2. Passes in the user `query` and a configuration block containing `session_id`.
3. Returns only the “answer” portion of the response.

#### Inputs and Outputs
- **Inputs**:
  - `conversational_rag_chain (object)`: RAG chain that merges the retriever and LLM pipeline.
  - `query (str)`: The user’s question or prompt.
  - `session_id (str)`: Identifier to track chat context in DynamoDB.
- **Outputs**:
  - A `str` containing the generated response text.

---

### Function: `get_llm_output` <a name="function-get_llm_output"></a>
```python
def get_llm_output(response: str) -> dict:
    ...
```
#### Purpose
- Splits the raw LLM response into main content and follow-up questions based on a delimiter.

#### Process Flow
1. Searches for `"You might have the following questions:"` in the response.
2. Splits the text into main content (before the delimiter) and question list (after the delimiter).
3. Converts URLs in the main content to Markdown links.
4. Organizes the follow-up questions into a list.

#### Inputs and Outputs
- **Inputs**:
  - `response (str)`: The full text returned by the LLM.
- **Outputs**:
  - A `dict` containing:
    - `"llm_output"`: The main response text.
    - `"options"`: A list of follow-up questions (if any).

---

### Function: `format_to_markdown` <a name="function-format_to_markdown"></a>
```python
def format_to_markdown(evaluation_results: dict) -> str:
    ...
```
#### Purpose
- Converts a dictionary of evaluation results into a Markdown-formatted string.

#### Process Flow
1. Iterates over the dictionary items (key-value pairs).
2. Formats each key as a heading and the corresponding text as a paragraph.

#### Inputs and Outputs
- **Inputs**:
  - `evaluation_results (dict)`: Keys are headings, and values are body content.
- **Outputs**:
  - Returns a single string formatted in Markdown, with headings and paragraphs.

---

### Function: `parse_evaluation_response` <a name="function-parse_evaluation_response"></a>
```python
def parse_evaluation_response(evaluation_output: dict) -> dict:
    ...
```
#### Purpose
- Recursively parses an evaluation output structure and generates Markdown plus a list of questions.

#### Process Flow
1. Walks through the `evaluation_output` dict, which may contain nested dicts or lists.
2. Aggregates text content under `main_content` and collects question-like items under `options`.
3. Converts the final result to Markdown using `format_to_markdown`.

#### Inputs and Outputs
- **Inputs**:
  - `evaluation_output (dict)`: Nested dictionary of evaluation data.
- **Outputs**:
  - A dictionary containing:
    - `"llm_output"` (str): The Markdown-formatted result.
    - `"options"` (list): Follow-up questions or items extracted during parsing.

---

### Function: `format_docs` <a name="function-format_docs"></a>
```python
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)
```
#### Purpose
- Concatenates multiple documents’ page contents into a single string for feeding into an LLM or retriever.

#### Process Flow
1. Joins the `page_content` of each document with double newlines.

#### Inputs and Outputs
- **Inputs**:
  - `docs (list)`: A list of document objects, each with a `page_content` attribute.
- **Outputs**:
  - A single string combining all pages or content blocks.

---

### Function: `get_response_evaluation` <a name="function-get_response_evaluation"></a>
```python
def get_response_evaluation(llm, retriever, guidelines_file) -> dict:
    ...
```
#### Purpose
- Evaluates documents against a set of guidelines by prompting the LLM with context from the retriever.

#### Process Flow
1. Parses the `guidelines_file` into a Python structure (if it is a string).
2. Creates a prompt template that includes documents and the guidelines.
3. Iterates over each guideline entry, running the chain and collecting responses.
4. Uses `parse_evaluation_response` to format final output.

#### Inputs and Outputs
- **Inputs**:
  - `llm`: The LLM instance (e.g., `ChatBedrock`) for generating evaluation text.
  - `retriever`: Provides relevant document contexts.
  - `guidelines_file`: A JSON file or string specifying compliance guidelines.
- **Outputs**:
  - A dictionary containing the Markdown-rendered evaluation output and any follow-up questions (`options`).

---

[🔼 Back to top](#table-of-contents)
