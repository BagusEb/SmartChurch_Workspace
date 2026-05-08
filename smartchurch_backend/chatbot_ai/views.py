import asyncio
import json
import os
import traceback
import uuid
from typing import Annotated, Optional, Literal
from urllib.parse import quote_plus
from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from langchain_core.messages import messages_to_dict
from typing_extensions import TypedDict

from cachetools import TTLCache
from langchain.agents import create_agent
from langchain_community.chat_message_histories import SQLChatMessageHistory
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
)
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_openrouter import ChatOpenRouter
from langsmith import traceable
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command
from pydantic import BaseModel
from rest_framework.renderers import BaseRenderer
from sqlalchemy import create_engine, text

from .prompts import (
    GUARDRAIL_AGENT_SYSTEM_PROMPT,
    MAIN_AGENT_SYSTEM_PROMPT,
    QUERY_POSTGRES_TOOL_DESCRIPTION,
    GENERATE_SEABORN_PLOT_TOOL_DESCRIPTION,
    GET_SCHEMA_TOOL_DESCRIPTION,
    SCHEMA_CATALOG,
)

# LangSmith tracing — configure from Django settings (moved to settings.py)
langsmith_api_key = getattr(
    settings, "LANGSMITH_API_KEY", os.getenv("LANGSMITH_API_KEY", "")
)
langsmith_project = getattr(settings, "LANGSMITH_PROJECT", "smartchurch-ai")
langsmith_tracing = getattr(settings, "LANGSMITH_TRACING", True)
langsmith_endpoint = getattr(
    settings, "LANGSMITH_ENDPOINT", "https://api.smith.langchain.com"
)

# Ensure the environment variables used by langchain/langsmith integrations are set
if langsmith_api_key:
    os.environ["LANGSMITH_API_KEY"] = langsmith_api_key
if langsmith_project:
    os.environ["LANGSMITH_PROJECT"] = langsmith_project
os.environ["LANGSMITH_TRACING"] = str(bool(langsmith_tracing)).lower()
if langsmith_endpoint:
    os.environ["LANGSMITH_ENDPOINT"] = langsmith_endpoint

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CHAT_CACHE_TTL_SECONDS = 3600
MAX_CACHE_SIZE = 100
GUARDRAIL_NODE_NAME = "guardrail"
GUARDRAIL_VIOLATION_NODE_NAME = "guardrail_violation"
MAIN_NODE_NAME = "main"
MAX_CHAT_MEMORY = 20
# ---------------------------------------------------------------------------
# Caches
# ---------------------------------------------------------------------------

conversation_message_cache: TTLCache = TTLCache(
    maxsize=MAX_CACHE_SIZE, ttl=CHAT_CACHE_TTL_SECONDS
)

# ---------------------------------------------------------------------------
# DB engines
# ---------------------------------------------------------------------------

_primary_engine = None
_ai_readonly_engine = None


def get_primary_db_connection_string() -> str:
    db = settings.DATABASES["default"]
    return f"postgresql://{db.get('USER')}:{db.get('PASSWORD')}@{db.get('HOST', 'localhost')}:{db.get('PORT', '5432')}/{db.get('NAME')}"


def get_ai_readonly_db_connection_string() -> str:
    db = settings.DATABASES["default"]
    user = quote_plus(str(os.getenv("AI_DB_USER", db.get("USER") or "")))
    password = quote_plus(str(os.getenv("AI_DB_PASSWORD", db.get("PASSWORD") or "")))
    host = db.get("HOST", "localhost")
    port = db.get("PORT", "5432")
    name = db.get("NAME")
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


def get_ai_readonly_engine():
    global _ai_readonly_engine
    if _ai_readonly_engine is None:
        _ai_readonly_engine = create_engine(
            get_ai_readonly_db_connection_string(), pool_pre_ping=True
        )
    return _ai_readonly_engine


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------


class ServerSentEventRenderer(BaseRenderer):
    media_type = "text/event-stream"
    format = "sse"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if data is None:
            return ""
        if isinstance(data, str):
            return data
        return json.dumps(data, ensure_ascii=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def create_thread_id() -> str:
    return str(uuid.uuid4())


def build_initial_graph_state(
    previous_messages: list[BaseMessage], user_message: str
) -> "GraphState":
    return {
        "messages": [*previous_messages, HumanMessage(content=user_message)],
        "guardrail_result": None,
    }


def format_sse(event: str, data: object) -> str:
    """Emit a single SSE event matching the LangGraph Platform protocol."""
    if event == "end":
        return "event: end\ndata: null\n\n"
    serialized = json.dumps(data, ensure_ascii=True, default=str)
    return f"event: {event}\ndata: {serialized}\n\n"


def get_message_history(session_id: str) -> SQLChatMessageHistory:
    return SQLChatMessageHistory(
        connection=get_primary_db_connection_string(),
        session_id=session_id,
        table_name="chat_history",
    )


def get_cached_messages(session_id: str) -> list[BaseMessage]:
    if not isinstance(session_id, str):
        session_id = str(session_id)
    cached = conversation_message_cache.get(session_id)
    if cached is not None:
        return cached
    msgs = list(get_message_history(session_id).messages)
    conversation_message_cache[session_id] = msgs
    return msgs


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@tool("query_postgres", description=QUERY_POSTGRES_TOOL_DESCRIPTION)
@traceable(name="query_postgres", run_type="tool")
def query_postgres(query: str, max_rows: int = 200) -> str:
    if not query or not query.strip():
        return "Query is required."

    max_rows = max(1, min(int(max_rows), 1000))

    try:
        with get_ai_readonly_engine().connect() as conn:
            all_rows = conn.execute(text(query)).mappings().fetchall()

        total_rows = len(all_rows)
        serialized = [dict(row) for row in all_rows[:max_rows]]
        truncated = total_rows > max_rows

        response = {
            "total_rows": total_rows,
            "returned_rows": len(serialized),
            "truncated": truncated,
            "rows": serialized,
        }
        if truncated:
            response["hint"] = (
                f"Query returned {total_rows} rows but only {max_rows} are shown. "
                f"Use GROUP BY / aggregation in SQL, or call with max_rows={min(total_rows, 1000)}."
            )
        return json.dumps(response, default=str)

    except Exception as e:
        return f"Database query failed: {e}"


@tool("generate_seaborn_plot", description=GENERATE_SEABORN_PLOT_TOOL_DESCRIPTION)
@traceable(name="generate_seaborn_plot", run_type="tool")
def generate_seaborn_plot(
    data_json: str,
    chart_type: Literal[
        "bar",
        "line",
        "scatter",
        "pie",
        "histogram",
    ],
    x_col: str,
    y_col: Optional[str] = None,
    title: str = "",
    hue_col: Optional[str] = None,
    highlight_mode: Optional[
        Literal[
            "max",
            "min",
            "above_threshold",
            "top_n",
        ]
    ] = None,
    highlight_threshold: Optional[float] = None,
    top_n: Optional[int] = None,
) -> dict:
    import json
    import os
    import uuid

    import matplotlib

    matplotlib.use("Agg")

    import matplotlib.pyplot as plt
    import pandas as pd
    import seaborn as sns

    from django.conf import settings

    media_root = getattr(
        settings,
        "MEDIA_ROOT",
        os.path.join(settings.BASE_DIR, "media"),
    )

    plots_dir = os.path.join(media_root, "ai_plots")
    os.makedirs(plots_dir, exist_ok=True)

    plot_filename = f"plot_{uuid.uuid4().hex[:8]}.png"
    plot_path = os.path.join(plots_dir, plot_filename)

    try:
        data = json.loads(data_json)
        df = pd.DataFrame(data)

        if df.empty:
            return {"error": "No data available for plotting."}

        required_cols = [x_col]

        if chart_type not in ["histogram"]:
            if chart_type != "pie" and not y_col:
                return {"error": f"{chart_type} chart requires y_col."}

            if y_col:
                required_cols.append(y_col)

        if hue_col:
            required_cols.append(hue_col)

        missing_cols = [col for col in required_cols if col not in df.columns]

        if missing_cols:
            return {"error": f"Missing columns: {', '.join(missing_cols)}"}

        plt.figure(figsize=(10, 6))
        ax = plt.gca()

        highlight_supported = chart_type in [
            "bar",
            "line",
            "scatter",
        ]

        colors = None

        if highlight_supported and highlight_mode and y_col:
            colors = ["lightgray"] * len(df)

            if highlight_mode == "max":
                idx = df[y_col].idxmax()
                colors[idx] = "#4C72B0"

            elif highlight_mode == "min":
                idx = df[y_col].idxmin()
                colors[idx] = "#C44E52"

            elif (
                highlight_mode == "above_threshold" and highlight_threshold is not None
            ):
                for i, val in enumerate(df[y_col]):
                    if val > highlight_threshold:
                        colors[i] = "#4C72B0"

            elif highlight_mode == "top_n" and top_n is not None:
                top_indices = df[y_col].nlargest(top_n).index

                for idx in top_indices:
                    colors[idx] = "#4C72B0"

        # BAR
        if chart_type == "bar":

            if colors:
                ax.bar(
                    df[x_col],
                    df[y_col],
                    color=colors,
                )
            else:
                sns.barplot(
                    data=df,
                    x=x_col,
                    y=y_col,
                    hue=hue_col,
                    ax=ax,
                )

        # LINE
        elif chart_type == "line":

            sns.lineplot(
                data=df,
                x=x_col,
                y=y_col,
                hue=hue_col,
                ax=ax,
            )

            if colors:
                for i in range(len(df)):
                    ax.scatter(
                        df[x_col].iloc[i],
                        df[y_col].iloc[i],
                        color=colors[i],
                        s=80,
                        zorder=5,
                    )

        # SCATTER
        elif chart_type == "scatter":

            if colors:
                ax.scatter(
                    df[x_col],
                    df[y_col],
                    c=colors,
                    s=80,
                )
            else:
                sns.scatterplot(
                    data=df,
                    x=x_col,
                    y=y_col,
                    hue=hue_col,
                    ax=ax,
                )

        # HISTOGRAM
        elif chart_type == "histogram":

            sns.histplot(
                data=df,
                x=x_col,
                hue=hue_col,
                kde=False,
                ax=ax,
            )

        # PIE
        elif chart_type == "pie":

            if len(df) > 10:
                return {"error": "Pie chart supports maximum 10 categories."}

            plt.pie(
                df[y_col],
                labels=df[x_col],
                autopct="%1.1f%%",
            )

        else:
            return {"error": f"Unsupported chart type: {chart_type}"}

        plt.title(title or chart_type.capitalize())

        if chart_type != "pie":
            plt.xticks(rotation=45, ha="right")

        plt.tight_layout()

        plt.savefig(plot_path)
        plt.close("all")

        media_url = getattr(
            settings,
            "MEDIA_URL",
            "/media/",
        )

        server_base = os.getenv(
            "SERVER_PATH",
            "http://localhost:8000",
        )

        full_url = (
            f"{server_base.rstrip('/')}"
            f"{media_url.rstrip('/')}"
            f"/ai_plots/{plot_filename}"
        )

        return {"image_url": full_url}

    except Exception as e:
        plt.close("all")

        return {"error": str(e)}


@tool("get_schema", description=GET_SCHEMA_TOOL_DESCRIPTION)
@traceable(name="get_schema", run_type="tool")
def get_schema(table_name: str) -> str:
    if not table_name:
        return "table_name is required."
    key = str(table_name).strip()
    schema = SCHEMA_CATALOG.get(key)
    if not schema:
        return json.dumps(
            {
                "error": f"Unknown table '{key}'.",
                "available_tables": sorted(SCHEMA_CATALOG.keys()),
            },
            ensure_ascii=True,
        )
    return json.dumps({"table": key, **schema}, ensure_ascii=True)


TOOL_NAMES = [query_postgres.name, generate_seaborn_plot.name, get_schema.name]

# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------

llm = ChatOpenRouter(
    model="openrouter/auto",
    temperature=0.0,
    streaming=True,
    plugins=[{"id": "auto-router", "allowed_models": ["openai/*"]}],
    # reasoning={"effort": "minimal"},
)

# ---------------------------------------------------------------------------
# Structured output schema for guardrail
# ---------------------------------------------------------------------------


class GuardrailPlan(BaseModel):
    allow: bool
    reason: str


# ---------------------------------------------------------------------------
# Graph state
# ---------------------------------------------------------------------------


class GraphState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # Holds the typed guardrail decision; never serialised into messages.
    guardrail_result: Optional[GuardrailPlan]


# ---------------------------------------------------------------------------
# Graph (built lazily to respect Django settings init order)
# ---------------------------------------------------------------------------

_compiled_graph = None


def get_compiled_graph():
    global _compiled_graph
    if _compiled_graph is not None:
        return _compiled_graph

    # Guardrail LLM returns a GuardrailPlan object directly — no JSON round-trip.
    guardrail_llm = llm.with_structured_output(GuardrailPlan, method="function_calling")

    @traceable(name="Guardrail Agent", run_type="chain")
    def _guardrail_node(state: GraphState) -> Command:
        plan: GuardrailPlan = guardrail_llm.invoke(
            [SystemMessage(content=GUARDRAIL_AGENT_SYSTEM_PROMPT), *state["messages"]]
        )
        # Use Command to update state and route in one step.
        next_node = MAIN_NODE_NAME if plan.allow else GUARDRAIL_VIOLATION_NODE_NAME
        return Command(
            update={"guardrail_result": plan},
            goto=next_node,
        )

    def _guardrail_violation_node(state: GraphState) -> Command:
        """Emit a fixed sorry message when the guardrail blocks the request."""
        sorry = AIMessage(
            content=(
                "I'm sorry, I can only process requests related to church matters. "
                "Please ask me something about church attendance, members, or guests."
            )
        )
        return Command(
            update={"messages": state["messages"] + [sorry]},
            goto=END,
        )

    @traceable(name="Main Agent", run_type="chain")
    def _make_main_agent():
        return create_agent(
            model=llm,
            tools=[query_postgres, generate_seaborn_plot, get_schema],
            system_prompt=MAIN_AGENT_SYSTEM_PROMPT,
            name="Main Agent",
        )

    main_agent = _make_main_agent()

    graph = StateGraph(GraphState)
    graph.add_node(GUARDRAIL_NODE_NAME, _guardrail_node)
    graph.add_node(GUARDRAIL_VIOLATION_NODE_NAME, _guardrail_violation_node)
    graph.add_node(MAIN_NODE_NAME, main_agent)
    graph.set_entry_point(GUARDRAIL_NODE_NAME)
    # Routing is handled by Command inside _guardrail_node — no conditional edges needed.
    graph.add_edge(GUARDRAIL_VIOLATION_NODE_NAME, END)
    graph.add_edge(MAIN_NODE_NAME, END)

    _compiled_graph = graph.compile()
    return _compiled_graph


# ---------------------------------------------------------------------------
# History helpers
# ---------------------------------------------------------------------------


def _add_to_history_sync(session_id: str, message: BaseMessage):
    session_id = str(session_id)
    history = SQLChatMessageHistory(
        connection=get_primary_db_connection_string(),
        session_id=session_id,
        table_name="chat_history",
    )
    history.add_message(message)

    cached = conversation_message_cache.get(session_id)

    if cached is None:
        # Seed the in-memory cache from the persistent history (includes the new message)
        try:
            msgs = list(history.messages)
            conversation_message_cache[session_id] = msgs
        except Exception:
            print(f"Failed to seed cache for session {session_id}")
    else:
        temp_cached = list(cached)
        temp_cached.append(message)
        conversation_message_cache[session_id] = temp_cached


async def add_to_history(session_id: str, message: BaseMessage):
    await asyncio.to_thread(_add_to_history_sync, session_id, message)


# ---------------------------------------------------------------------------
# View
# ---------------------------------------------------------------------------


@csrf_exempt
async def chat(request, thread_id=None):
    if request.method == "GET":
        if not thread_id:
            return JsonResponse({"error": "thread_id required"}, status=400)
        messages = get_cached_messages(str(thread_id))
        return JsonResponse({"messages": messages_to_dict(messages)}, status=200)

    elif request.method == "POST":
        body = json.loads(request.body or "{}")
        user_message = body.get("message")

        if not user_message:

            async def error_stream():
                yield format_sse("error", {"message": "No message"})
                yield format_sse("end", None)

            return StreamingHttpResponse(
                error_stream(), content_type="text/event-stream"
            )

        previous_messages = get_cached_messages(thread_id) if thread_id else []
        # Limit the number of previous messages to avoid exceeding context window
        previous_messages = previous_messages[-MAX_CHAT_MEMORY:]
        initial_state = build_initial_graph_state(previous_messages, user_message)
        graph = get_compiled_graph()

        async def event_stream():
            nonlocal thread_id
            guardrail_denied = False

            if not thread_id:
                thread_id = create_thread_id()
                yield format_sse("metadata", {"thread_id": str(thread_id)})

            await add_to_history(thread_id, HumanMessage(content=user_message))

            try:
                async for chunk in graph.astream(
                    initial_state,
                    config=RunnableConfig(configurable={"thread_id": thread_id}),
                    stream_mode=["messages", "values"],
                    subgraphs=True,
                    version=["v2"],
                ):
                    namespace, stream_type, data = chunk
                    # print(namespace, stream_type, data, flush=True)
                    if stream_type == "values" and isinstance(data, dict):
                        # Check the typed guardrail result directly — no JSON parsing.
                        plan: Optional[GuardrailPlan] = data.get("guardrail_result")
                        if plan is not None and not plan.allow:
                            guardrail_denied = True

                        if "messages" in data:
                            new_messages = [
                                m
                                for m in data["messages"]
                                if m not in initial_state["messages"]
                            ]
                            yield format_sse(
                                "messages",
                                {"messages": messages_to_dict(data["messages"])},
                            )
                            for msg in new_messages:
                                await add_to_history(thread_id, msg)
                                initial_state["messages"].append(msg)

                    if (
                        isinstance(namespace, tuple)
                        and isinstance(data, tuple)
                        and namespace
                        and data
                        and stream_type == "messages"
                    ):
                        message = data[0]
                        if (
                            isinstance(message, AIMessageChunk)
                            and MAIN_NODE_NAME in namespace[0]
                        ):
                            token = message.content or ""
                            message_id = message.id or ""
                            if token:
                                yield format_sse(
                                    "message_chunk",
                                    {"content": token, "id": message_id},
                                )

                if not guardrail_denied:
                    yield format_sse("end", {"status": "done"})
                else:
                    yield format_sse("end", {"status": "denied"})

            except Exception as e:
                traceback.print_exc()
                yield format_sse("error", {"message": str(e)})
                yield format_sse("end", None)

        response = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
