from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    # LLM provider selection
    llm_provider: str = "claude"  # claude | openai | gemini | minimax
    llm_model: str = ""  # empty = use provider default

    # API keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""
    minimax_api_key: str = ""
    minimax_group_id: str = ""

    # Gmail OAuth
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_redirect_uri: str = "http://localhost:8000/api/gmail/callback"
    frontend_url: str = "http://localhost:8080"

    @property
    def active_model(self) -> str:
        if self.llm_model:
            return self.llm_model
        defaults = {
            "claude": "claude-sonnet-4-6",
            "openai": "gpt-4.1-nano",
            "gemini": "gemini-1.5-pro",
            "minimax": "MiniMax-M2.7",
        }
        return defaults.get(self.llm_provider, "claude-sonnet-4-5")

    @property
    def active_api_key(self) -> str:
        keys = {
            "claude": self.anthropic_api_key,
            "openai": self.openai_api_key,
            "gemini": self.google_api_key,
            "minimax": self.minimax_api_key,
        }
        return keys.get(self.llm_provider, "")


settings = Settings()
