import re

def split_content_and_questions(content: str):
    """
    Splits the content into main content and follow-up questions.

    Args:
    content (str): The text containing the main response and follow-up questions.

    Returns:
    tuple: A tuple containing two elements:
        - main_content (str): The content before the questions section.
        - questions (list): A list of follow-up questions.
    """
    # Split the content into main content and questions
    match = re.search(r"(.*)You might have the following questions:(.*)", content, re.DOTALL)
    
    if match:
        main_content = match.group(1).strip()  # Content before the questions section
        questions_text = match.group(2).strip()  # Text containing the questions
    else:
        main_content = content.strip()  # If no questions section, return full content
        questions_text = ""
    
    # Split questions into a list
    questions = [question.strip() for question in questions_text.splitlines() if question.strip()]
    
    return main_content, questions




content = """I think there might be some confusion! Elon Musk is not related to the Digital Learning Strategy. He's an entrepreneur and business magnate who is known for his roles as the CEO of SpaceX and Tesla, Inc. He's not involved in the development or implementation of the Digital Learning Strategy.

If you have any questions about the Digital Learning Strategy, I'd be happy to help!

You might have the following questions:

What is Digital Learning Strategy?

How does the Digital Learning Strategy affect me?"""

# Split content and questions
main_content, questions = split_content_and_questions(content)

# print("Main Content:")
print(main_content)
# print("\nQuestions:")
print(questions)
