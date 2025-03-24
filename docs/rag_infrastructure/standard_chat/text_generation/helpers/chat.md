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
  - [Function: `get_user_query`](#function-get_user_query)
  - [Function: `get_initial_user_query`](#function-get_initial_user_query)
  - [Function: `get_response`](#function-get_response)
  - [Function: `generate_response`](#function-generate_response)
  - [Function: `get_llm_output`](#function-get_llm_output)
  - [Function: `format_to_markdown`](#function-format_to_markdown)
  - [Function: `parse_evaluation_response`](#function-parse_evaluation_response)
  - [Function: `format_docs`](#function-format_docs)
  - [Function: `get_response_evaluation`](#function-get_response_evaluation)

---

## Script Overview <a name="script-overview"></a>
This script implements a chat system that integrates Amazon Bedrock language models with a DynamoDB-backed chat history using a retrieval-augmented generation (RAG) approach. It processes user queries by combining them with context retrieved from documents and chat history, then generates detailed responses that include follow-up questions. The system is designed to support role-based query formatting and provides functionality for document evaluation against predefined guidelines.

### Import Libraries <a name="import-libraries"></a>
- **Standard Libraries**:  
  - `logging`: Provides logging capabilities for debugging and tracking.
  - `boto3`: AWS SDK for interacting with DynamoDB.
  - `re`: Enables regular expression operations for text processing.
  - `json`: Supports JSON parsing and stringifying.
  - `datetime`: Handles date and time operations.

- **LangChain and AWS Modules**:  
  - `langchain_aws`: Supplies `ChatBedrockConverse` for working with Amazon Bedrock language models.
  - `langchain_core.prompts`: Contains prompt templates and message placeholders (`PromptTemplate`, `ChatPromptTemplate`, `MessagesPlaceholder`).
  - `langchain.chains.combine_documents`: Provides `create_stuff_documents_chain` to combine document contexts.
  - `langchain_core.output_parsers`: Includes `StrOutputParser` to parse text outputs.
  - `langchain.chains`: Provides `create_retrieval_chain` for building retrieval pipelines.
  - `langchain_core.runnables`: Contains `RunnablePassthrough` for simple data passing.
  - `langchain_core.runnables.history`: Offers `RunnableWithMessageHistory` to manage chat history.
  - `langchain_community.chat_message_histories`: Implements `DynamoDBChatMessageHistory` to log messages in DynamoDB.
  - `langchain_core.pydantic_v1`: Uses `BaseModel` and `Field` for data modeling.
  
- **Typing**:  
  - Provides type hints such as `Dict`, `Any`, `Optional`, and `Tuple`.

### AWS Configuration and Setup <a name="aws-configuration-and-setup"></a>
- **DynamoDB Integration**:  
  The function `create_dynamodb_history_table` ensures that a DynamoDB table (keyed by `SessionId`) exists to store conversation history using on-demand billing.

- **Amazon Bedrock Integration**:  
  The functions `get_bedrock_llm` and related components utilize Amazon Bedrock models (via `ChatBedrockConverse`) to generate responses based on user queries and contextual data.

### Helper Functions <a name="helper-functions"></a>
- **get_user_query**: Formats raw user queries by prefixing them with a "user" tag.
- **get_initial_user_query**: Generates a JSON-formatted prompt to allow users to select their role.
- **generate_response**: Invokes the retrieval chain to produce an LLM-generated response.
- **get_llm_output**: Processes the LLM output, splitting it into primary response content and follow-up questions.
- **format_to_markdown**: Converts dictionaries of evaluation results into Markdown format.
- **parse_evaluation_response**: Recursively organizes evaluation output into Markdown and a list of follow-up options.
- **format_docs**: Concatenates document content into a single string for context retrieval.

### Main Functions <a name="main-functions"></a>
- **get_response**: Coordinates the construction of a system prompt, integrates document retrieval and chat history, and generates a final answer with follow-up questions.
- **get_response_evaluation**: Evaluates documents against provided guidelines by constructing a specialized prompt, invoking the LLM, and returning structured Markdown output.

### Execution Flow <a name="execution-flow"></a>
1. **DynamoDB Table Setup**:  
   The system checks for (and creates if necessary) a DynamoDB table to store chat session history.
2. **LLM Initialization**:  
   A Bedrock language model is instantiated via `get_bedrock_llm` using a specific model ID and temperature setting.
3. **Query Formatting**:  
   User queries are formatted using `get_user_query` and `get_initial_user_query` to ensure consistent processing.
4. **Response Generation**:  
   The `get_response` function creates a detailed system prompt and builds a retrieval chain that integrates context and chat history. It repeatedly generates responses until a non-empty answer is produced and then processes the output using `get_llm_output`.
5. **Optional Document Evaluation**:  
   The `get_response_evaluation` function can be used to assess documents against guidelines, returning results in Markdown format along with any follow-up suggestions.

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
- Ensures a DynamoDB table exists to log conversation history, preserving chat context across sessions.

#### Process Flow
1. Lists existing DynamoDB tables using `boto3`.
2. Checks if the specified `table_name` exists.
3. Creates the table with `SessionId` as the key if it does not exist, then waits for its availability.

#### Inputs and Outputs
- **Inputs**:  
  - `table_name`: The desired DynamoDB table name.
- **Outputs**:  
  - None; the function performs table creation as a side effect.

---

### Function: `get_bedrock_llm` <a name="function-get_bedrock_llm"></a>
```python
def get_bedrock_llm(
    bedrock_llm_id: str,
    temperature: Optional[float] = 0,
    max_tokens: Optional[int] = None,
    top_p : Optional[float] = None
) -> ChatBedrockConverse:
    """
    Retrieve a Bedrock LLM instance configured with the given model ID and temperature.

    Args:
        bedrock_llm_id (str): The unique identifier for the Bedrock LLM model.
        temperature (float, optional): A parameter that controls the randomness 
            of generated responses (default is 0).
        max_tokens (int, optional): Sets an upper bound on how many tokens the model will generate in its response (default is None).
        top_p (float, optional): Indicates the percentage of most-likely candidates that are considered for the next token (default is None).

    Returns:
        ChatBedrockConverse: An instance of the Bedrock LLM corresponding to the provided model ID.
    """
    logger.info(
        "Initializing ChatBedrockConverse with model_id '%s', temperature '%s', max_tokens '%s', top_p '%s'.",
        bedrock_llm_id, 
        temperature,
        max_tokens, 
        top_p
    )

    return ChatBedrockConverse(
        model=bedrock_llm_id,
        temperature=temperature,
        # Additional kwargs: https://api.python.langchain.com/en/latest/aws/chat_models/langchain_aws.chat_models.bedrock_converse.ChatBedrockConverse.html
        max_tokens=max_tokens,
        top_p=top_p
    )
```
#### Purpose
- Instantiates a `ChatBedrockConverse` object using a specified model ID and a temperature parameter to control response variability.

#### Process Flow
1. Logs the initialization parameters.
2. Returns a configured `ChatBedrockConverse` instance.

#### Inputs and Outputs
- **Inputs**:  
  - `bedrock_llm_id`: Unique identifier for the language model.
  - `temperature`: Optional parameter to control response randomness.
  - `max_tokens`: Optional parameter to set an upper bound on how many tokens the model will generate in its response.
  - `top_p`: Optional parameter to indicate the percentage of most-likely candidates that are considered for the next token.
- **Outputs**:  
  - A `ChatBedrockConverse` instance.

---

### Function: `get_user_query` <a name="function-get_user_query"></a>
```python
def get_user_query(raw_query: str) -> str:
    """
    Format the user's raw query into a system-ready template.

    This includes prefixing the query with 'user' for clarity in prompt contexts.

    Args:
        raw_query (str): The raw query input from the user.

    Returns:
        str: The formatted query string suitable for downstream processing.
    """
```
#### Purpose
- Standardizes user input by adding a "user" prefix, ensuring consistency in the conversation context.

#### Process Flow
1. Prefixes the raw query with "user".
2. Returns the formatted query string.

#### Inputs and Outputs
- **Inputs**:  
  - `raw_query`: The unformatted query from the user.
- **Outputs**:  
  - A string formatted for use in the RAG chain.

---

### Function: `get_initial_user_query` <a name="function-get_initial_user_query"></a>
```python
def get_initial_user_query() -> str:
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
- Provides a starting prompt that allows users to select their role, thereby tailoring subsequent interactions.

#### Process Flow
1. Constructs a dictionary with a welcome message and role options.
2. Converts the dictionary to a JSON string.

#### Inputs and Outputs
- **Inputs**:  
  - None.
- **Outputs**:  
  - A JSON string that contains role selection options.

---

### Function: `get_response` <a name="function-get_response"></a>
```python
def get_response(
    query: str,
    llm: ChatBedrockConverse,
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
        query (str): The user's query.
        llm (ChatBedrockConverse): The language model instance.
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
- Orchestrates response generation by constructing a detailed system prompt, integrating context retrieval with chat history, and invoking the LLM.

#### Process Flow
1. Logs and constructs a comprehensive system prompt that includes Digital Learning Strategy details and role-specific instructions.
2. Creates a chat prompt template and builds a retrieval chain.
3. Wraps the chain with a DynamoDB-based history manager.
4. Repeatedly calls `generate_response` until a valid response is obtained.
5. Parses the output into main content and follow-up questions using `get_llm_output`.

#### Inputs and Outputs
- **Inputs**:  
  - `query`: User’s query.
  - `llm`: The language model instance.
  - `history_aware_retriever`: Component for retrieving context documents.
  - `table_name`: DynamoDB table for chat history.
  - `session_id`: Unique conversation identifier.
  - `user_prompt`: Additional prompt instructions.
- **Outputs**:  
  - A dictionary with `"llm_output"` and `"options"`.

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
- Invokes the retrieval chain with the provided query and session context, returning the generated response.

#### Process Flow
1. Calls the `invoke` method on the `conversational_rag_chain` with the query and session configuration.
2. Returns the "answer" field from the resulting output.

#### Inputs and Outputs
- **Inputs**:  
  - `conversational_rag_chain`: The retrieval chain object.
  - `query`: User’s query.
  - `session_id`: Identifier for the current session.
- **Outputs**:  
  - A string containing the LLM-generated answer.

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
- Processes and splits the raw LLM output into primary response text and follow-up queries.

#### Process Flow
1. Searches for a delimiter in the response text.
2. Converts any URLs into Markdown hyperlinks.
3. Splits follow-up questions based on punctuation and returns them in a list.

#### Inputs and Outputs
- **Inputs**:  
  - `response`: The full text output from the LLM.
- **Outputs**:  
  - A dictionary with keys `"llm_output"` and `"options"`.

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
- Formats evaluation result dictionaries into a Markdown string with clear headings and content.

#### Process Flow
1. Iterates over each key-value pair.
2. Prepends a heading format and combines the output into a single Markdown string.

#### Inputs and Outputs
- **Inputs**:  
  - `evaluation_results`: Dictionary of evaluation data.
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
- Recursively processes evaluation results to produce Markdown-formatted text and extract follow-up options.

#### Process Flow
1. Iterates through each item in the evaluation dictionary.
2. Recursively processes nested dictionaries.
3. Formats the aggregated text using `format_to_markdown`.

#### Inputs and Outputs
- **Inputs**:  
  - `evaluation_output`: Nested dictionary containing evaluation results.
- **Outputs**:  
  - A dictionary with `"llm_output"` (Markdown text) and `"options"` (list of follow-up items).

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
- Combines the content of multiple documents into one continuous text block to be used as context.

#### Process Flow
1. Iterates over document objects.
2. Joins the `page_content` of each document using double newlines.

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
- Evaluates documents against specified guidelines by constructing a custom prompt and invoking the LLM, then aggregates the results into Markdown format with follow-up suggestions.

#### Process Flow
1. Converts the `guidelines_file` into a Python dictionary if necessary.
2. Constructs a prompt template that includes document context and evaluation guidelines.
3. Iterates through each guideline, invoking a RAG chain to generate evaluation responses.
4. Aggregates and processes the responses using `parse_evaluation_response`.

#### Inputs and Outputs
- **Inputs**:  
  - `llm`: The language model instance.
  - `retriever`: Component to retrieve relevant document context.
  - `guidelines_file`: Guidelines for evaluation (JSON or string).
- **Outputs**:  
  - A dictionary containing `"llm_output"` (Markdown formatted evaluation) and `"options"` (follow-up questions).

---

[🔼 Back to top](#table-of-contents)
