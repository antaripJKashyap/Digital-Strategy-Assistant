# chat.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
  - [Import Libraries](#import-libraries)
  - [AWS Configuration and Setup](#aws-configuration-and-setup)
  - [Helper Functions](#helper-functions)
  - [Main Functions](#main-functions)
  - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
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
This script implements a chat system that integrates Amazon Bedrock language models with a DynamoDB-backed chat history using retrieval-augmented generation (RAG). It is designed to process user queries, enrich them with contextual documents, and generate responses that include follow-up questions. The system supports role-based query formatting and evaluation of document compliance against provided guidelines.

### Import Libraries <a name="import-libraries"></a>
The script uses a variety of libraries and modules:
- **Standard Libraries**:  
  - `logging`: For logging events and errors.
  - `boto3`: AWS SDK for Python, used for interacting with DynamoDB.
  - `re`: Regular expressions for text processing.
  - `json`: For JSON manipulation.
  - `datetime`: For handling date and time.

- **LangChain and Related Modules**:  
  - `langchain_aws`: Provides `ChatBedrock` and `BedrockLLM` for interacting with Amazon Bedrock models.
  - `langchain_core.prompts`: Contains `PromptTemplate`, `ChatPromptTemplate`, and `MessagesPlaceholder` for prompt management.
  - `langchain.chains.combine_documents`: Provides `create_stuff_documents_chain` for combining document contexts.
  - `langchain_core.output_parsers`: Provides `StrOutputParser` for parsing LLM outputs.
  - `langchain.chains`: Contains `create_retrieval_chain` for building retrieval-based generation pipelines.
  - `langchain_core.runnables`: Includes `RunnablePassthrough` for data transformations.
  - `langchain_core.runnables.history`: Provides `RunnableWithMessageHistory` to integrate chat history.
  - `langchain_community.chat_message_histories`: Offers `DynamoDBChatMessageHistory` to store conversation logs in DynamoDB.
  - `langchain_core.pydantic_v1`: Uses `BaseModel` and `Field` for structured data models.

- **Typing**:  
  - Provides type hints such as `Dict`, `Any`, `Optional`, and `Tuple`.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- **DynamoDB Setup**:  
  The function `create_dynamodb_history_table` uses `boto3` to list and create a DynamoDB table (keyed by `SessionId`) for storing session history. This ensures that conversation context is preserved across interactions.
  
- **Amazon Bedrock Integration**:  
  The functions `get_bedrock_llm` and related components leverage Amazon Bedrock’s language models (via `ChatBedrock` and `BedrockLLM`) to generate responses based on user queries and context.

### Helper Functions <a name="helper-functions"></a>
- **get_student_query**: Formats raw user queries by prefixing them with the user role.
- **get_initial_student_query**: Provides a JSON structure prompting users to select their role.
- **generate_response**: Invokes the RAG chain to generate a response for a given query.
- **get_llm_output**: Processes the LLM response, splitting it into the main content and follow-up questions.
- **format_to_markdown**: Converts evaluation dictionaries into Markdown format.
- **parse_evaluation_response**: Recursively processes evaluation outputs into Markdown and a list of follow-up questions.
- **format_docs**: Combines the content of multiple documents into a single string for context feeding.

### Main Functions <a name="main-functions"></a>
- **get_response**: Orchestrates the process of generating a response by integrating the LLM, retrieval chain, and DynamoDB-backed message history.
- **get_response_evaluation**: Evaluates documents against specific guidelines using a prompt template and the LLM, aggregating the results in a structured format.

### Execution Flow <a name="execution-flow"></a>
1. **DynamoDB Table Check/Creation**:  
   The system first ensures that a DynamoDB table exists (via `create_dynamodb_history_table`) to store the conversation history.

2. **LLM Initialization**:  
   The `get_bedrock_llm` function retrieves a language model instance configured with a specified model ID and response temperature.

3. **Query Processing and Formatting**:  
   User queries are formatted using `get_student_query` and `get_initial_student_query` to ensure consistency and role-awareness.

4. **Response Generation**:  
   The `get_response` function builds a system prompt, creates a retrieval chain incorporating document context and chat history, and generates a response using `generate_response`. The response is then split into main content and follow-up questions using `get_llm_output`.

5. **Evaluation (Optional)**:  
   Documents can be evaluated against a set of guidelines using `get_response_evaluation`, which constructs a prompt with context and returns Markdown-formatted evaluation results.

[🔼 Back to top](#table-of-contents)

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Function: `create_dynamodb_history_table` <a name="function-create_dynamodb_history_table"></a>
```python
def create_dynamodb_history_table(table_name: str) -> None:
    """
    Create a DynamoDB table to store session history if it does not already exist.
    
    The table is keyed by 'SessionId' and uses on-demand billing (PAY_PER_REQUEST).
    If the table already exists, no action is taken.

    Args:
        table_name (str): The name of the DynamoDB table to create.

    Returns:
        None
    """
```
#### Purpose
- Ensures that a DynamoDB table exists for storing conversation history, keyed by `SessionId`.

#### Process Flow
1. Uses `boto3` to list existing tables.
2. Checks if the specified table exists.
3. Creates the table if it does not exist and waits for its availability.

#### Inputs and Outputs
- **Inputs**:
  - `table_name`: Name of the DynamoDB table.
- **Outputs**:
  - None (the function performs side effects by creating the table if necessary).

---

### Function: `get_bedrock_llm` <a name="function-get_bedrock_llm"></a>
```python
def get_bedrock_llm(
    bedrock_llm_id: str,
    temperature: float = 0
) -> ChatBedrock:
    """
    Retrieve a Bedrock LLM instance configured with the given model ID and temperature.

    Args:
        bedrock_llm_id (str): The unique identifier for the Bedrock LLM model.
        temperature (float, optional): A parameter that controls the randomness 
            of generated responses (default is 0).

    Returns:
        ChatBedrock: An instance of the Bedrock LLM corresponding to the provided model ID.
    """
```
#### Purpose
- Initializes and returns a `ChatBedrock` instance configured with the specified model ID and temperature.

#### Process Flow
1. Constructs the `ChatBedrock` instance.
2. Logs the initialization parameters.

#### Inputs and Outputs
- **Inputs**:
  - `bedrock_llm_id`: Unique identifier for the model.
  - `temperature`: Controls response variability.
- **Outputs**:
  - A `ChatBedrock` object for generating responses.

---

### Function: `get_student_query` <a name="function-get_student_query"></a>
```python
def get_student_query(raw_query: str) -> str:
    """
    Format the student's raw query into a system-ready template.

    This includes prefixing the query with 'user' for clarity in prompt contexts.

    Args:
        raw_query (str): The raw query input from the student.

    Returns:
        str: The formatted query string suitable for downstream processing.
    """
```
#### Purpose
- Standardizes user input by prefixing it with a user tag, ensuring consistency in subsequent processing.

#### Process Flow
1. Formats the query by appending the `user` tag.
2. Returns the formatted string.

#### Inputs and Outputs
- **Inputs**:
  - `raw_query`: The unformatted user query.
- **Outputs**:
  - A string formatted for use in the conversation chain.

---

### Function: `get_initial_student_query` <a name="function-get_initial_student_query"></a>
```python
def get_initial_student_query() -> str:
    """
    Generate a JSON-formatted initial query structure for user role selection.

    This prompts users to select from three roles: Student/prospective student, 
    Educator/educational designer, or Admin.

    Returns:
        str: A JSON-formatted string prompting role selection and 
             providing follow-up options.
    """
```
#### Purpose
- Provides a starting prompt that asks the user to select a role, thereby tailoring the response context.

#### Process Flow
1. Constructs a dictionary with a message and options.
2. Converts the dictionary to a JSON string.

#### Inputs and Outputs
- **Inputs**: None.
- **Outputs**:
  - A JSON-formatted string containing a welcome message and role options.

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
    """
    Generate a response to a user query using an LLM and a history-aware retriever.

    This function:
      1. Builds a system prompt that references the Digital Learning Strategy.
      2. Creates a RAG (Retrieval-Augmented Generation) chain to handle query 
         and context retrieval.
      3. Uses a DynamoDB-backed message history for conversational context.

    Args:
        query (str): The student's query.
        llm (ChatBedrock): The language model instance.
        history_aware_retriever: The retriever that supplies relevant context documents.
        table_name (str): The name of the DynamoDB table for message history.
        session_id (str): A unique identifier for the conversation session.
        user_prompt (str): Additional instructions or context for the system prompt.

    Returns:
        dict: A dictionary containing:
            - "llm_output" (str): The generated response text.
            - "options" (list[str]): A list of follow-up questions or prompts.
    """
```
#### Purpose
- Coordinates the overall response generation by combining prompt creation, document retrieval, and LLM invocation.

#### Process Flow
1. Constructs a detailed system prompt incorporating context and user instructions.
2. Builds a retrieval chain with a chat history wrapper.
3. Continuously generates responses until a non-empty output is produced.
4. Parses the final response into main content and follow-up questions.

#### Inputs and Outputs
- **Inputs**:
  - `query`: The user's query.
  - `llm`: The language model instance.
  - `history_aware_retriever`: The retriever component for context.
  - `table_name`: DynamoDB table name.
  - `session_id`: Session identifier.
  - `user_prompt`: Additional prompt instructions.
- **Outputs**:
  - A dictionary with keys `"llm_output"` and `"options"`.

---

### Function: `generate_response` <a name="function-generate_response"></a>
```python
def generate_response(conversational_rag_chain: object, query: str, session_id: str) -> str:
    """
    Invoke a RAG chain to generate a response for a given query.

    Args:
        conversational_rag_chain (object): The RAG chain that retrieves 
            context documents and integrates them into responses.
        query (str): The input query for which a response is needed.
        session_id (str): A unique identifier for the conversation session.

    Returns:
        str: The generated answer from the LLM, incorporating retrieval context and chat history.
    """
```
#### Purpose
- Calls the RAG chain to generate an LLM response, integrating both context and chat history.

#### Process Flow
1. Invokes the chain with the provided query and session configuration.
2. Returns the response’s answer portion.

#### Inputs and Outputs
- **Inputs**:
  - `conversational_rag_chain`: The retrieval chain object.
  - `query`: The user’s query.
  - `session_id`: Session identifier.
- **Outputs**:
  - A string with the generated response.

---

### Function: `get_llm_output` <a name="function-get_llm_output"></a>
```python
def get_llm_output(response: str) -> dict:
    """
    Split the LLM response text into main content and follow-up questions.

    This function looks for a delimiter "You might have the following questions:" 
    to separate the response into two sections: 
      1. The main response content.
      2. A list of subsequent questions.

    Args:
        response (str): The complete response text from the LLM.

    Returns:
        dict: A dictionary with:
            - "llm_output" (str): Main content before the question delimiter.
            - "options" (list[str]): The extracted follow-up questions, if any.
    """
```
#### Purpose
- Processes the raw LLM response by separating the primary content from any follow-up queries.

#### Process Flow
1. Uses a regular expression to locate a delimiter.
2. Converts URLs within the main text into Markdown links.
3. Splits follow-up questions into a list.

#### Inputs and Outputs
- **Inputs**:
  - `response`: The full text output from the LLM.
- **Outputs**:
  - A dictionary with `"llm_output"` and `"options"`.

---

### Function: `format_to_markdown` <a name="function-format_to_markdown"></a>
```python
def format_to_markdown(evaluation_results: dict) -> str:
    """
    Convert a dictionary of evaluation results into Markdown format.

    Each key-value pair is transformed into a heading (key) and the associated text (value).

    Args:
        evaluation_results (dict): A dictionary where each key is a heading 
            and each value is the corresponding content.

    Returns:
        str: A multi-line string formatted in Markdown.
    """
```
#### Purpose
- Formats a dictionary of evaluation outputs into a neatly structured Markdown string.

#### Process Flow
1. Iterates over each key-value pair.
2. Prepends headings and organizes the content into Markdown.

#### Inputs and Outputs
- **Inputs**:
  - `evaluation_results`: Dictionary of evaluation details.
- **Outputs**:
  - A Markdown-formatted string.

---

### Function: `parse_evaluation_response` <a name="function-parse_evaluation_response"></a>
```python
def parse_evaluation_response(evaluation_output: dict) -> dict:
    """
    Parse the output of `get_response_evaluation` to produce markdown and a list of follow-up options.

    This function iterates over the evaluation output, which may nest additional dictionaries 
    (recursively calling itself). It organizes text content into a main_content list and 
    follow-up questions or options into a separate list.

    Args:
        evaluation_output (dict): The raw evaluation result dictionary 
            (could be nested with additional dicts).

    Returns:
        dict: A dictionary with:
            - "llm_output" (str): Rendered Markdown text of the evaluation results.
            - "options" (list[str]): Any follow-up questions or options extracted.
    """
```
#### Purpose
- Recursively processes the evaluation result to generate Markdown content and extract follow-up options.

#### Process Flow
1. Walks through each key-value pair in the evaluation output.
2. Recursively handles nested dictionaries.
3. Uses `format_to_markdown` to generate Markdown-formatted text.

#### Inputs and Outputs
- **Inputs**:
  - `evaluation_output`: Nested dictionary of evaluation data.
- **Outputs**:
  - A dictionary containing `"llm_output"` (Markdown) and `"options"` (list of questions).

---

### Function: `format_docs` <a name="function-format_docs"></a>
```python
def format_docs(docs: list) -> str:
    """
    Join the page_content of a list of documents into a single string.

    Used for feeding the relevant text context to the LLM or retriever.

    Args:
        docs (list): A list of document objects, each having a 'page_content' attribute.

    Returns:
        str: A concatenated string of all document contents, separated by newlines.
    """
```
#### Purpose
- Combines the `page_content` from multiple document objects into one cohesive string.

#### Process Flow
1. Iterates over each document.
2. Joins the content using double newlines.

#### Inputs and Outputs
- **Inputs**:
  - `docs`: List of document objects.
- **Outputs**:
  - A single concatenated string.

---

### Function: `get_response_evaluation` <a name="function-get_response_evaluation"></a>
```python
def get_response_evaluation(llm, retriever, guidelines_file) -> dict:
    """
    Evaluate documents against a set of guidelines using an LLM and a retriever.

    The process:
      1. Converts a guidelines JSON or string input into a Python dict.
      2. Uses a prompt template for each guideline, combining the retriever output 
         and the guideline into an evaluation request.
      3. Aggregates evaluation results into a dictionary.

    Args:
        llm: The LLM instance (e.g., Bedrock).
        retriever: The retriever that provides relevant document context.
        guidelines_file: JSON or a string representing guidelines used for evaluation.

    Returns:
        dict: Parsed evaluation results in a structure containing:
              - "llm_output" (str): Markdown-formatted content.
              - "options" (list[str]): Follow-up questions or suggestions, if present.
    """
```
#### Purpose
- Evaluates the compliance of documents against specified guidelines by constructing a custom prompt and invoking the LLM.

#### Process Flow
1. Converts the guidelines input into a Python dictionary.
2. Builds a prompt template that incorporates document context and the guidelines.
3. Iterates over each guideline, invoking a RAG chain to obtain an evaluation.
4. Aggregates and parses the results using `parse_evaluation_response`.

#### Inputs and Outputs
- **Inputs**:
  - `llm`: The language model instance.
  - `retriever`: Retrieves document context.
  - `guidelines_file`: Guidelines for document evaluation.
- **Outputs**:
  - A dictionary containing `"llm_output"` (Markdown) and `"options"` (list of follow-up items).

---

[🔼 Back to top](#table-of-contents)
