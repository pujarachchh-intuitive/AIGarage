import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ibm import WatsonxLLM

# AG2 config dict for Gemini (used by CartographerAgent, FixerAgent)
GEMINI_CONFIG = {
    "model": "gemini-1.5-pro",
    "api_key": os.getenv("GEMINI_API_KEY"),
    "api_type": "google",
}


def get_gemini_ag2_config() -> dict:
    """Return AG2-compatible config dict for Gemini 1.5 Pro."""
    return {"config_list": [GEMINI_CONFIG], "temperature": 0.1}


def get_gemini_langchain() -> ChatGoogleGenerativeAI:
    """Return LangChain ChatGoogleGenerativeAI instance (used by LangChain tools and chains)."""
    return ChatGoogleGenerativeAI(
        model="gemini-1.5-pro",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.1,
    )


def get_watsonx_langchain() -> WatsonxLLM:
    """Return WatsonX LLM via LangChain (used by DocUnderstanding, Inspector — cheaper read-only analysis)."""
    return WatsonxLLM(
        model_id="ibm/granite-34b-code-instruct",
        url="https://us-south.ml.cloud.ibm.com",
        apikey=os.getenv("WATSONX_API_KEY"),
        project_id=os.getenv("WATSONX_PROJECT_ID", ""),
        params={"max_new_tokens": 2048, "temperature": 0.1},
    )


def get_watsonx_ag2_config() -> dict:
    """Return AG2-compatible config dict using WatsonX (via LangChain bridge)."""
    return {
        "config_list": [
            {
                "model": "ibm/granite-34b-code-instruct",
                "api_key": os.getenv("WATSONX_API_KEY"),
                "api_type": "watsonx",
                "base_url": "https://us-south.ml.cloud.ibm.com",
            }
        ],
        "temperature": 0.1,
    }
