# vectorstore.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
  - [Import Libraries](#import-libraries)
  - [LLM and Embeddings Usage](#llm-and-embeddings-usage)
  - [Main Function](#main-function)
  - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
  - [Function: `get_vectorstore_retriever`](#get_vectorstore_retriever)

---

## Script Overview <a name="script-overview"></a>
This script provides a mechanism to create a **history-aware retriever** for LangChain-based applications. Specifically, it:
1. Connects to a vector store using the provided configuration.
2. Creates a retriever from the vector store.
3. Wraps the retriever with additional functionality to reformulate user queries in context of chat history before retrieving relevant documents.

### Import Libraries <a name="import-libraries"></a>
- **typing.Dict**: For type annotations of dictionaries.
- **langchain_core.vectorstores.VectorStoreRetriever**: Base retriever interface for document retrieval from a vector store.
- **langchain_core.prompts.ChatPromptTemplate, MessagesPlaceholder**: Utilities to build prompts that can dynamically incorporate chat history and user queries.
- **langchain.chains.create_history_aware_retriever**: Utility to create a retriever that reformulates the user’s latest query based on previous context.
- **helpers.helper.get_vectorstore**: Custom helper function to initialize and return a vector store instance based on provided configuration.

### LLM and Embeddings Usage <a name="llm-and-embeddings-usage"></a>
- The `llm` parameter is used to generate reformulated user questions, ensuring the retriever can interpret them correctly in isolation from the broader chat context.
- The `embeddings` parameter (commented out as `BedrockEmbeddings`) is used by the underlying vector store to convert text to vector representations for semantic search and retrieval.

### Main Function <a name="main-function"></a>
- **get_vectorstore_retriever**: Connects to the vector store, creates a base retriever, and then converts it into a history-aware retriever capable of dynamically reformulating queries based on conversation history.

### Execution Flow <a name="execution-flow"></a>
1. **Vector Store Initialization**: The script calls `get_vectorstore` with the parameters in `vectorstore_config_dict` (like collection name, database name, host, etc.) and the specified embeddings.
2. **Retriever Creation**: Once the vector store is retrieved, it is converted to a standard `VectorStoreRetriever` using `vectorstore.as_retriever()`.
3. **History-Aware Retrieval**:
   - A system prompt (`contextualize_q_system_prompt`) instructs the model to create a standalone question from the user’s latest query, incorporating any context from prior conversation.
   - A chat prompt template (`contextualize_q_prompt`) is then used to format this conversation data appropriately.
   - `create_history_aware_retriever` combines this prompt with the retriever, returning a specialized retrieval chain that can handle multi-turn conversations seamlessly.

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Function: `get_vectorstore_retriever` <a name="get_vectorstore_retriever"></a>
```python
def get_vectorstore_retriever(
    llm,
    vectorstore_config_dict: Dict[str, str],
    embeddings#: BedrockEmbeddings
) -> VectorStoreRetriever:
    """
    Retrieve the vectorstore and return the history-aware retriever object.

    Args:
        llm: The language model instance used to generate the response.
        vectorstore_config_dict (Dict[str, str]): The configuration dictionary for the vectorstore, including parameters like collection name, database name, user, password, host, and port.
        embeddings (BedrockEmbeddings): The embeddings instance used to process the documents.

    Returns:
        VectorStoreRetriever: A history-aware retriever instance.
    """
    vectorstore, _ = get_vectorstore(
        collection_name=vectorstore_config_dict['collection_name'],
        embeddings=embeddings,
        dbname=vectorstore_config_dict['dbname'],
        user=vectorstore_config_dict['user'],
        password=vectorstore_config_dict['password'],
        host=vectorstore_config_dict['host'],
        port=int(vectorstore_config_dict['port'])
    )

    retriever = vectorstore.as_retriever()
    # Contextualize question and create history-aware retriever
    contextualize_q_system_prompt = (
        "Given a chat history and the latest user question "
        "which might reference context in the chat history, "
        "formulate a standalone question which can be understood "
        "without the chat history. Do NOT answer the question, "
        "just reformulate it if needed and otherwise return it as is."
    )

    contextualize_q_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", contextualize_q_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )

    history_aware_retriever = create_history_aware_retriever(
        llm, retriever, contextualize_q_prompt
    )

    return history_aware_retriever
```
#### Purpose
- Initializes and configures a history-aware document retriever.  
- Ensures any new user question is reformulated in context of chat history.

#### Process Flow
1. **Vector Store Retrieval**: Uses `get_vectorstore` to connect to a vector store (e.g., PGVector, Pinecone, etc.) with the given credentials and settings.
2. **Retriever Creation**: Converts the vector store into a `VectorStoreRetriever`.
3. **Contextualization Prompt**: Constructs a system prompt and prompt template to transform the current user query into a self-contained question.
4. **History-Aware Retriever**: Uses `create_history_aware_retriever` to integrate the contextualization logic with the base retriever.

#### Inputs and Outputs
- **Inputs**:
  - `llm`: The language model instance (e.g., an LLM from LangChain).
  - `vectorstore_config_dict (Dict[str, str])`: Contains connection parameters like `collection_name`, `dbname`, `user`, `password`, etc.
  - `embeddings`: The embeddings instance (e.g., `BedrockEmbeddings`).
- **Outputs**: 
  - Returns a `VectorStoreRetriever` that can handle conversation history and reformulate user queries accordingly.

---

[🔼 Back to top](#table-of-contents)
