import asyncio
import json
import os
import traceback
import uuid
from typing import Annotated, Optional
from django.conf import (
    settings,
)  # noqa: F401 — used by get_primary_db_connection_string
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from langchain_core.messages import messages_to_dict
from typing_extensions import TypedDict

from asgiref.sync import sync_to_async
from cachetools import TTLCache
from langchain.agents import create_agent
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
)
from langchain_core.runnables import RunnableConfig
from langchain_openrouter import ChatOpenRouter
from langsmith import traceable
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from pydantic import BaseModel
from rest_framework.renderers import BaseRenderer

from .decorators import jwt_required
from prompts import (
    GUARDRAIL_AGENT_SYSTEM_PROMPT,
    MAIN_AGENT_SYSTEM_PROMPT,
    build_create_title_prompt,
)
from .tools import (
    generate_seaborn_plot,
    get_schema,
    query_postgres,
    update_canvas,
    clear_canvas,
    TOOL_NAMES,
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

# ---------------------------------------------------------------------------
# Caches
# ---------------------------------------------------------------------------

conversation_state_cache: TTLCache = TTLCache(
    maxsize=MAX_CACHE_SIZE, ttl=CHAT_CACHE_TTL_SECONDS
)

# ---------------------------------------------------------------------------
# DB connection
# ---------------------------------------------------------------------------


def get_primary_db_connection_string() -> str:
    db = settings.DATABASES["default"]
    return f"postgresql://{db.get('USER')}:{db.get('PASSWORD')}@{db.get('HOST', 'localhost')}:{db.get('PORT', '5432')}/{db.get('NAME')}"


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


def build_initial_graph_state(user_message: str) -> "GraphState":
    return {
        "messages": [HumanMessage(content=user_message)],
        "guardrail_result": None,
    }


def format_sse(event: str, data: object) -> str:
    serialized = json.dumps(data, ensure_ascii=True, default=str)
    return f"event: {event}\ndata: {serialized}\n\n"


def get_user_id_from_request(request) -> Optional[int]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        from rest_framework_simplejwt.tokens import AccessToken

        token = AccessToken(auth.split(" ")[1])
        return token["user_id"]
    except Exception:
        return None


# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------

llm = ChatOpenRouter(
    model="~moonshotai/kimi-latest",
    temperature=0.0,
    streaming=True,
)
llm_not_thinking = ChatOpenRouter(
    model="~google/gemini-flash-latest",
    temperature=0.0,
    streaming=False,
    reasoning={"effort": "none"},
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
    guardrail_result: Optional[GuardrailPlan]
    canvas: Optional[str]


# ---------------------------------------------------------------------------
# Graph (built lazily, shared with checkpointer)
# ---------------------------------------------------------------------------

_pool: Optional[AsyncConnectionPool] = None
_checkpointer: Optional[AsyncPostgresSaver] = None
_compiled_graph = None
_graph_lock = asyncio.Lock()


def _build_graph():
    guardrail_llm = llm_not_thinking.with_structured_output(
        GuardrailPlan, method="function_calling"
    )

    @traceable(name="Guardrail Agent", run_type="chain")
    async def _guardrail_node(state: GraphState) -> Command:
        plan: GuardrailPlan = await guardrail_llm.ainvoke(
            [SystemMessage(content=GUARDRAIL_AGENT_SYSTEM_PROMPT), *state["messages"]]
        )
        next_node = MAIN_NODE_NAME if plan.allow else GUARDRAIL_VIOLATION_NODE_NAME
        return Command(
            update={"guardrail_result": plan},
            goto=next_node,
        )

    def _guardrail_violation_node(state: GraphState) -> Command:
        sorry = AIMessage(
            content=(
                "Maaf, saya hanya dapat memproses permintaan yang terkait dengan urusan gereja. "
                "Silakan tanyakan sesuatu tentang kehadiran gereja, anggota, atau tamu."
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
            tools=[
                query_postgres,
                generate_seaborn_plot,
                get_schema,
                update_canvas,
                clear_canvas,
            ],
            system_prompt=MAIN_AGENT_SYSTEM_PROMPT,
            state_schema=GraphState,
            name="Main Agent",
        )

    main_agent = _make_main_agent()

    graph = StateGraph(GraphState)
    graph.add_node(GUARDRAIL_NODE_NAME, _guardrail_node)
    graph.add_node(GUARDRAIL_VIOLATION_NODE_NAME, _guardrail_violation_node)
    graph.add_node(MAIN_NODE_NAME, main_agent)
    graph.set_entry_point(GUARDRAIL_NODE_NAME)
    graph.add_edge(GUARDRAIL_VIOLATION_NODE_NAME, END)
    graph.add_edge(MAIN_NODE_NAME, END)
    return graph


async def get_graph_with_checkpointer():
    global _pool, _checkpointer, _compiled_graph
    if _compiled_graph is not None:
        return _compiled_graph
    async with _graph_lock:
        if _compiled_graph is not None:
            return _compiled_graph
        _pool = AsyncConnectionPool(
            conninfo=get_primary_db_connection_string(),
            open=False,
            kwargs={"autocommit": True, "prepare_threshold": 0},
        )
        await _pool.open()
        _checkpointer = AsyncPostgresSaver(_pool)
        await _checkpointer.setup()
        _compiled_graph = _build_graph().compile(checkpointer=_checkpointer)
        return _compiled_graph


# ---------------------------------------------------------------------------
# Async cache + DB helpers
# ---------------------------------------------------------------------------


async def get_cached_state(session_id: str) -> dict:
    session_id = str(session_id)
    cached = conversation_state_cache.get(session_id)
    if cached is not None:
        return cached
    graph = await get_graph_with_checkpointer()
    config = RunnableConfig(configurable={"thread_id": session_id})
    state = await graph.aget_state(config)
    vals = state.values if state and state.values else {}
    result = {
        "messages": vals.get("messages", []),
        "canvas": vals.get("canvas") or "",
    }
    conversation_state_cache[session_id] = result
    return result


async def get_cached_messages(session_id: str) -> list[BaseMessage]:
    return (await get_cached_state(session_id))["messages"]


@sync_to_async
def _create_ai_conversation_sync(thread_id: str, user_id: int):
    from django.utils import timezone
    from attendance.models import AIConversation
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
        AIConversation.objects.create(
            user=user,
            langfuse_threadid=str(thread_id),
            last_activity_at=timezone.now(),
        )
    except Exception:
        pass


@sync_to_async
def _update_last_activity_sync(thread_id: str):
    from django.utils import timezone
    from attendance.models import AIConversation

    try:
        conv = AIConversation.objects.get(langfuse_threadid=str(thread_id))
        conv.last_activity_at = timezone.now()
        conv.save(update_fields=["last_activity_at"])
    except AIConversation.DoesNotExist:
        pass
    except Exception:
        pass


@sync_to_async
def _get_conversation_has_title_sync(thread_id: str) -> bool:
    from attendance.models import AIConversation

    try:
        conv = AIConversation.objects.get(langfuse_threadid=str(thread_id))
        return bool(conv.conversation_title)
    except AIConversation.DoesNotExist:
        return True  # no record → skip title generation
    except Exception:
        return True


@sync_to_async
def _save_conversation_title_sync(thread_id: str, title: str):
    from django.utils import timezone
    from attendance.models import AIConversation

    try:
        conv = AIConversation.objects.get(langfuse_threadid=str(thread_id))
        conv.conversation_title = title
        conv.last_activity_at = timezone.now()
        conv.save(update_fields=["conversation_title", "last_activity_at"])
    except Exception:
        pass


async def generate_conversation_title(user_message: str) -> str:
    title_llm = ChatOpenRouter(
        model="~openai/gpt-mini-latest",
        temperature=0.0,
        reasoning={"effort": "none"},
        streaming=False,
    )
    prompt = build_create_title_prompt(user_message)
    try:
        resp = await title_llm.ainvoke([HumanMessage(content=prompt)])
        return resp.content.strip()[:200]
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# View
# ---------------------------------------------------------------------------


@csrf_exempt
@jwt_required
async def chat(request, thread_id=None):
    if request.method == "GET":
        if not thread_id:
            return JsonResponse({"error": "thread_id required"}, status=400)
        state = await get_cached_state(str(thread_id))
        return JsonResponse(
            {
                "messages": messages_to_dict(state["messages"]),
                "canvas": state["canvas"],
            },
            status=200,
        )

    elif request.method == "POST":
        body = json.loads(request.body or "{}")
        user_message = body.get("message")

        if not user_message:

            async def error_stream():
                yield format_sse("error", {"message": "No message"})
                yield format_sse("end", None)

            _err_resp = StreamingHttpResponse(
                error_stream(), content_type="text/event-stream"
            )
            _err_resp.is_async = True
            return _err_resp

        graph = await get_graph_with_checkpointer()
        initial_state = build_initial_graph_state(user_message)

        async def event_stream():
            nonlocal thread_id

            if not thread_id:
                thread_id = create_thread_id()
                yield format_sse("metadata", {"thread_id": str(thread_id)})
                user_id = get_user_id_from_request(request)
                if user_id:
                    await _create_ai_conversation_sync(str(thread_id), user_id)
                title_needed = True
            else:
                await _update_last_activity_sync(str(thread_id))
                has_title = await _get_conversation_has_title_sync(str(thread_id))
                title_needed = not has_title

            # Freeze thread_id before entering tasks (avoids closure mutation)
            tid = str(thread_id)
            q: asyncio.Queue = asyncio.Queue()
            _DONE = object()

            end_payload = {"status": "done"}

            async def graph_worker():
                guardrail_denied = False
                last_messages: list = []
                last_canvas: str = ""
                try:
                    config = RunnableConfig(configurable={"thread_id": tid})
                    async for chunk in graph.astream(
                        initial_state,
                        config=config,
                        stream_mode=["messages", "values"],
                        subgraphs=True,
                    ):
                        namespace, stream_type, data = chunk

                        if stream_type == "values" and isinstance(data, dict):
                            plan: Optional[GuardrailPlan] = data.get("guardrail_result")
                            if plan is not None and not plan.allow:
                                guardrail_denied = True
                            if "messages" in data:
                                last_messages = data["messages"]
                                canvas_val = data.get("canvas")
                                if canvas_val is not None:
                                    last_canvas = canvas_val
                                await q.put(
                                    format_sse(
                                        "values",
                                        {
                                            "messages": messages_to_dict(
                                                data["messages"]
                                            ),
                                            "canvas": canvas_val or "",
                                        },
                                    )
                                )

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
                                    await q.put(
                                        format_sse(
                                            "message_chunk",
                                            {"content": token, "id": message_id},
                                        )
                                    )

                    if last_messages:
                        conversation_state_cache[tid] = {
                            "messages": last_messages,
                            "canvas": last_canvas,
                        }

                    end_payload["status"] = "denied" if guardrail_denied else "done"

                except Exception as e:
                    traceback.print_exc()
                    await q.put(format_sse("error", {"message": str(e)}))
                    end_payload["status"] = "error"
                finally:
                    await q.put(_DONE)

            async def title_worker():
                try:
                    title = await generate_conversation_title(user_message)
                    if title:
                        await _save_conversation_title_sync(tid, title)
                        await q.put(format_sse("conversation_title", {"title": title}))
                except Exception:
                    pass
                finally:
                    await q.put(_DONE)

            pending = 1 + (1 if title_needed else 0)
            asyncio.create_task(graph_worker())
            if title_needed:
                asyncio.create_task(title_worker())

            while pending > 0:
                item = await q.get()
                if item is _DONE:
                    pending -= 1
                else:
                    yield item

            yield format_sse("end", end_payload)

        response = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream"
        )
        response.is_async = True
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
