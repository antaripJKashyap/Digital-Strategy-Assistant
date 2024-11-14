import boto3, re, json
from langchain_aws import ChatBedrock
from langchain_aws import BedrockLLM
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.chains import create_retrieval_chain
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import DynamoDBChatMessageHistory
from langchain_core.pydantic_v1 import BaseModel, Field

class LLM_evaluation(BaseModel):
    response: str = Field(description="Assessment of the student's answer with a follow-up question.")
    


def create_dynamodb_history_table(table_name: str) -> bool:
    """
    Create a DynamoDB table to store the session history if it doesn't already exist.

    Args:
    table_name (str): The name of the DynamoDB table to create.

    Returns:
    None
    
    If the table already exists, this function does nothing. Otherwise, it creates a 
    new table with a key schema based on 'SessionId'.
    """
    # Get the service resource and client.
    dynamodb_resource = boto3.resource("dynamodb")
    dynamodb_client = boto3.client("dynamodb")
    
    # Retrieve the list of tables that currently exist.
    existing_tables = []
    exclusive_start_table_name = None
    
    while True:
        if exclusive_start_table_name:
            response = dynamodb_client.list_tables(ExclusiveStartTableName=exclusive_start_table_name)
        else:
            response = dynamodb_client.list_tables()
        
        existing_tables.extend(response.get('TableNames', []))
        
        if 'LastEvaluatedTableName' in response:
            exclusive_start_table_name = response['LastEvaluatedTableName']
        else:
            break
    
    if table_name not in existing_tables:  # Create a new table if it doesn't exist.
        # Create the DynamoDB table.
        table = dynamodb_resource.create_table(
            TableName=table_name,
            KeySchema=[{"AttributeName": "SessionId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "SessionId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        
        # Wait until the table exists.
        table.meta.client.get_waiter("table_exists").wait(TableName=table_name)

def get_bedrock_llm(
    bedrock_llm_id: str,
    temperature: float = 0
) -> ChatBedrock:
    """
    Retrieve a Bedrock LLM instance based on the provided model ID.

    Args:
    bedrock_llm_id (str): The unique identifier for the Bedrock LLM model.
    temperature (float, optional): The temperature parameter for the LLM, controlling 
    the randomness of the generated responses. Defaults to 0.

    Returns:
    ChatBedrock: An instance of the Bedrock LLM corresponding to the provided model ID.
    """
    return ChatBedrock(
        model_id=bedrock_llm_id,
        model_kwargs=dict(temperature=temperature),
    )

def get_student_query(raw_query: str) -> str:
    """
    Format the student's raw query into a specific template suitable for processing.

    Args:
    raw_query (str): The raw query input from the student.

    Returns:
    str: The formatted query string ready for further processing.
    """
    student_query = f"""
    user
    {raw_query}
    
    """
    return student_query

def get_initial_student_query():
    """
    Generate an initial query for the user to interact with the system.
    Present the user with role options and provide selectable follow-up questions
    based on the selected role, each having a sample answer and additional questions.

    Returns:
    str: The formatted initial query string for the user.
    """
    
    query_structure = {
        "message": f"Hello! Please select the best role below that fits you. We can better answer your questions. Don't include personal details such as your name and private content.",
        "options": ["Student/prospective student", "Educator/educational designer", "Admin"]
        
    }

    return json.dumps(query_structure, indent=4)

def get_response(
    query: str,
    llm: ChatBedrock,
    history_aware_retriever,
    table_name: str,
    session_id: str,
    public_prompt: str,
    educator_prompt: str,
    admin_prompt: str
) -> dict:
    """
    Generates a response to a query using the LLM and a history-aware retriever for context.

    Args:
    query (str): The student's query string for which a response is needed.
    topic (str): The specific topic that the student needs to master.
    llm (ChatBedrock): The language model instance used to generate the response.
    history_aware_retriever: The history-aware retriever instance that provides relevant context documents for the query.
    table_name (str): The DynamoDB table name used to store and retrieve the chat history.
    session_id (str): The unique identifier for the chat session to manage history.

    Returns:
    dict: A dictionary containing the generated response and the source documents used in the retrieval.
    """
    # Create a system prompt for the question answering
    system_prompt = (
        ""
        "system"
        "You are an assistant for the Digital Learning Strategy. "
        "Your job is to help different users understand the Digital Learning Strategy in greater detail. "
        "The user is asked to select their role (Student/prospective student, Educator/educational designer, Institutional Admin). Depending upon their response, choose a prompt from the following 3 prompts and continue with that prompt for that particular session. "
        "This is how you should ask the user to choose a role: "
        '"message": "Hello! Please select the best role below that fits you. We can better answer your questions. Don\'t include personal details such as your name and private content.", '
        '"options": ["Student/prospective student", "Educator/educational designer", "Admin"] '
        f"{public_prompt}"
        f"{educator_prompt}"
        f"{admin_prompt}"
        "After selecting the appropriate prompt for the user, display the initial questions that the user might have and answer whatever question the user has related to the Digital Learning Strategy. "
        "After the first question has been answered, provide a list of follow-up questions under 'options', and answer any related questions. "
        "Only the initial questions (first question in the chat) and follow-up questions (second question in the chat) are defined in the prompts. Once the user asks the second question and it is answered, generate 3 questions that the user might have based on the chat history. "
        "Answer concisely."
        "documents"
        "{context}"
        ""
        "assistant"
    )
    
    qa_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )
    question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
    rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)

    conversational_rag_chain = RunnableWithMessageHistory(
        rag_chain,
        lambda session_id: DynamoDBChatMessageHistory(
            table_name=table_name, 
            session_id=session_id
        ),
        input_messages_key="input",
        history_messages_key="chat_history",
        output_messages_key="answer",
    )
    
    # Generate the response until it's not empty
    response = ""
    while not response:
        response = generate_response(
            conversational_rag_chain,
            query,
            session_id
        )

    response_data = get_llm_output(response)
    return {
        "llm_output": response_data.get("llm_output"),
        "options": response_data.get("options")
    }

    
    # return get_llm_output(response)

def generate_response(conversational_rag_chain: object, query: str, session_id: str) -> str:
    """
    Invokes the RAG chain to generate a response to a given query.

    Args:
    conversational_rag_chain: The Conversational RAG chain object that processes the query and retrieves relevant responses.
    query (str): The input query for which the response is being generated.
    session_id (str): The unique identifier for the current conversation session.

    Returns:
    str: The answer generated by the Conversational RAG chain, based on the input query and session context.
    """
    return conversational_rag_chain.invoke(
        {
            "input": query
        },
        config={
            "configurable": {"session_id": session_id}
        },  # constructs a key "session_id" in `store`.
    )["answer"]

# def get_llm_output(response: str) -> dict:
#     """
#     Processes the response from the LLM to determine if competency has been achieved.

#     Args:
#     response (str): The response generated by the LLM.

#     Returns:
#     dict: A dictionary containing the processed output from the LLM and a boolean 
#     flag indicating whether competency has been achieved.
#     """

#     competion_sentence = " Congratulations! You have achieved mastery over this module! Please try other modules to continue your learning journey! :)"
    
#     if "COMPETENCY ACHIEVED" not in response:
#         return dict(
#             llm_output=response
#         )
    
#     elif "COMPETENCY ACHIEVED" in response:
#         sentences = split_into_sentences(response)
        
#         for i in range(len(sentences)):
            
#             if "COMPETENCY ACHIEVED" in sentences[i]:
#                 llm_response=' '.join(sentences[0:i-1])
                
#                 if sentences[i-1][-1] == '?':
#                     return dict(
#                         llm_output=llm_response
#                     )
#                 else:
#                     return dict(
#                         llm_output=llm_response + competion_sentence
#                     )
#     elif "compet" in response or "master" in response:
#         return dict(
#             llm_output=response + competion_sentence
#         )

# def get_llm_output(response: str) -> dict:
#     """
#     Processes the response from the LLM to format it properly by removing newlines 
#     and ensuring follow-up questions are exclusively in 'options'.
    
#     Args:
#     response (str): The response generated by the LLM.

#     Returns:
#     dict: A dictionary containing the processed output from the LLM.
#     """
#     # Replace \n with spaces and split content from options
#     formatted_response = response.replace("\n", " ")
    
#     # Attempt to parse follow-up questions in options and keep main response in content
#     if "options:" in formatted_response:
#         # Split the content and options based on 'options:' keyword
#         content_part, options_part = formatted_response.split("options:", 1)
        
#         # Format content and options separately
#         content = content_part.strip()
#         options = [opt.strip() for opt in options_part.split(",") if opt.strip()]
#     else:
#         # If no options part is found, return entire response in content
#         content = formatted_response
#         options = []
    
#     return {
#         "llm_output": content,
#         "options": options
#     }

# import re
# import json

# def get_llm_output(response: str) -> dict:
#     """
#     Processes the response from the LLM to format it properly by removing newlines 
#     and ensuring follow-up questions are exclusively in 'options'.
    
#     Args:
#     response (str): The response generated by the LLM.

#     Returns:
#     dict: A dictionary containing the processed output from the LLM.
#     """
#     # Remove newline characters
#     formatted_response = response.replace("\n", " ")

#     # Look for options list embedded within the content
#     options_pattern = r"options:\s*\[(.*?)\]"
#     options_match = re.search(options_pattern, formatted_response)

#     if options_match:
#         # Extract options as a list of questions
#         options_text = options_match.group(1)
        
#         # Split questions by separating at ", " and cleaning up quotes
#         options = [q.strip().strip("\"") for q in options_text.split(",") if q.strip()]
        
#         # Remove options part from content
#         content = re.sub(options_pattern, "", formatted_response).strip()
#     else:
#         # If no options found, treat the whole response as content
#         content = formatted_response
#         options = []

#     return {
#         "llm_output": content,
#         "options": options
#     }
def get_llm_output(response: str) -> dict:
    """
    Processes the response from the LLM to keep all content in the 'content' field 
    and leave 'options' as an empty list.
    
    Args:
    response (str): The response generated by the LLM.

    Returns:
    dict: A dictionary with the entire response in 'content' and 'options' empty.
    """
    # Keep the entire response in 'content'
    content = response.strip()
    
    # Set 'options' to an empty list
    options = []

    return {
        "llm_output": content,
        "options": options
    }



def split_into_sentences(paragraph: str) -> list[str]:
    """
    Splits a given paragraph into individual sentences using a regular expression to detect sentence boundaries.

    Args:
    paragraph (str): The input text paragraph to be split into sentences.

    Returns:
    list: A list of strings, where each string is a sentence from the input paragraph.

    This function uses a regular expression pattern to identify sentence boundaries, such as periods, question marks, 
    or exclamation marks, and avoids splitting on abbreviations (e.g., "Dr." or "U.S.") by handling edge cases. The 
    resulting list contains sentences extracted from the input paragraph.
    """
    # Regular expression pattern
    sentence_endings = r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s'
    sentences = re.split(sentence_endings, paragraph)
    return sentences

