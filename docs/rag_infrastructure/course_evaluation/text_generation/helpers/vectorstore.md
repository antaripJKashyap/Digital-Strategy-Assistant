# vectorstore.py

## Table of Contents <a name="table-of-contents"></a>
- [Script Overview](#script-overview)
  - [Import Libraries](#import-libraries)
  - [Helper Functions](#helper-functions)
  - [Main Function](#main-function)
  - [Execution Flow](#execution-flow)
- [Detailed Function Descriptions](#detailed-function-descriptions)
  - [Function: `get_vectorstore_retriever_ordinary`](#get_vectorstore_retriever_ordinary)

---

## Script Overview <a name="script-overview"></a>
This script provides functionality to:
1. Retrieve a vector store based on user-specified configuration parameters.
2. Create a standard (non-history aware) retriever from that vector store.

### Import Libraries <a name="import-libraries"></a>
- **typing**: Provides the `Dict` type hint for function parameters.
- **langchain_core.vectorstores.VectorStoreRetriever**: Represents a retriever object for vector-based document retrieval.
- **helpers.helper.get_vectorstore**: Custom helper function to instantiate or connect to the vector store.

### Helper Functions <a name="helper-functions"></a>
- **`get_vectorstore`** (from `helpers.helper`): Retrieves or creates a configured vector store based on the provided parameters like collection name, embeddings, database details, etc.

### Main Function <a name="main-function"></a>
- **`get_vectorstore_retriever_ordinary`**: Uses the helper function `get_vectorstore` to create a retriever and return it along with the raw vector store object.

### Execution Flow <a name="execution-flow"></a>
1. Read the configuration dictionary (`vectorstore_config_dict`) containing necessary parameters.
2. Call `get_vectorstore` to establish or retrieve the existing vector store.
3. Convert the vector store into a retriever with specified search parameters.
4. Return both the retriever and the underlying vector store.

---

## Detailed Function Descriptions <a name="detailed-function-descriptions"></a>

### Function: `get_vectorstore_retriever_ordinary` <a name="get_vectorstore_retriever_ordinary"></a>
```python
from typing import Dict

from langchain_core.vectorstores import VectorStoreRetriever
from helpers.helper import get_vectorstore


def get_vectorstore_retriever_ordinary(
    vectorstore_config_dict: Dict[str, str],
    embeddings  # : BedrockEmbeddings
) -> VectorStoreRetriever:
    """
    Retrieve the vectorstore and return an ordinary (non-history aware) retriever,
    along with the vectorstore itself.

    Args:
        vectorstore_config_dict (Dict[str, str]): The configuration dictionary
            for the vectorstore, including parameters like collection name,
            database name, user, password, host, and port.
        embeddings (BedrockEmbeddings): The embeddings instance used to process
            the documents.

    Returns:
        (VectorStoreRetriever, VectorStore): A tuple containing:
            - An ordinary (non-history aware) retriever instance.
            - The vectorstore instance.
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
    
    return vectorstore.as_retriever(search_kwargs={'k': 5}), vectorstore
```

#### Purpose
Creates a straightforward vector store retriever configured to return the top 5 matching results. It also provides direct access to the underlying vector store (the vector store is returned as well).

#### Process Flow
1. Uses the `get_vectorstore` helper to either load or initialize a vector store based on the given configuration.
2. Converts the vector store into a retriever with `search_kwargs={'k': 5}`.
3. Returns both the retriever and the raw vector store.

#### Inputs and Outputs
- **Inputs**:
  - `vectorstore_config_dict`: Dictionary containing connection details and configuration for the vector store, such as `collection_name`, `dbname`, `user`, `password`, `host`, and `port`.
  - `embeddings`: An embeddings instance (e.g., `BedrockEmbeddings`) used to embed documents and queries.
- **Outputs**:
  - A tuple `(retriever, vectorstore)`:
    - **retriever**: A `VectorStoreRetriever` configured for top-5 retrieval.
    - **vectorstore**: The underlying vector store object itself which allows further direct interaction if needed.

[🔼 Back to top](#table-of-contents)
