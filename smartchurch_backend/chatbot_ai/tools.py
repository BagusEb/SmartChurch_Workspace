import json
import os
from typing import Annotated, Literal, Optional
from urllib.parse import quote_plus

import matplotlib

matplotlib.use("Agg")

from django.conf import settings
from langchain_core.messages import ToolMessage
from langchain_core.tools import tool, InjectedToolCallId
from langsmith import traceable
from langgraph.prebuilt import InjectedState
from langgraph.types import Command
from sqlalchemy import create_engine, text

from .prompts import (
    GENERATE_SEABORN_PLOT_TOOL_DESCRIPTION,
    GET_SCHEMA_TOOL_DESCRIPTION,
    QUERY_POSTGRES_TOOL_DESCRIPTION,
    SCHEMA_CATALOG,
)

# ---------------------------------------------------------------------------
# DB engine
# ---------------------------------------------------------------------------

_ai_readonly_engine = None


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
    x_label: Optional[str] = None,
    y_label: Optional[str] = None,
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
    import uuid

    import matplotlib.pyplot as plt
    import pandas as pd
    import seaborn as sns

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
            if chart_type == "pie" and not y_col:
                return {"error": "pie chart requires y_col."}
            if chart_type != "pie" and not y_col:
                return {"error": f"{chart_type} chart requires y_col."}

            if y_col:
                required_cols.append(y_col)

        if hue_col:
            required_cols.append(hue_col)

        missing_cols = [col for col in required_cols if col not in df.columns]

        if missing_cols:
            return {"error": f"Missing columns: {', '.join(missing_cols)}"}

        n_points = len(df)
        fig_width = max(10, min(18, 8 + n_points * 0.35))
        fig, ax = plt.subplots(figsize=(fig_width, 6))

        highlight_supported = chart_type in ["bar", "line", "scatter"]

        colors = None

        if highlight_supported and highlight_mode and y_col:
            df = df.reset_index(drop=True)
            colors = ["lightgray"] * len(df)

            if highlight_mode == "max":
                colors[df[y_col].idxmax()] = "#4C72B0"

            elif highlight_mode == "min":
                colors[df[y_col].idxmin()] = "#C44E52"

            elif (
                highlight_mode == "above_threshold" and highlight_threshold is not None
            ):
                for i, val in enumerate(df[y_col]):
                    if val > highlight_threshold:
                        colors[i] = "#4C72B0"
                if all(c == "lightgray" for c in colors):
                    colors = None

            elif highlight_mode == "top_n" and top_n is not None:
                for pos in df[y_col].nlargest(top_n).index.tolist():
                    colors[pos] = "#4C72B0"

        if chart_type == "bar":
            if colors and not hue_col:
                ax.bar(df[x_col], df[y_col], color=colors)
            elif colors and hue_col:
                import matplotlib.patches as mpatches

                palette = sns.color_palette()
                unique_hues = df[hue_col].unique()
                hue_color_map = {
                    h: palette[i % len(palette)] for i, h in enumerate(unique_hues)
                }
                highlight_indices = {
                    i for i, c in enumerate(colors) if c != "lightgray"
                }
                for i in range(len(df)):
                    alpha = 1.0 if i in highlight_indices else 0.45
                    ax.bar(
                        df[x_col].iloc[i],
                        df[y_col].iloc[i],
                        color=hue_color_map[df[hue_col].iloc[i]],
                        alpha=alpha,
                    )
                patches = [
                    mpatches.Patch(color=hue_color_map[h], label=h) for h in unique_hues
                ]
                ax.legend(handles=patches, title=hue_col)
            elif hue_col:
                sns.barplot(data=df, x=x_col, y=y_col, hue=hue_col, ax=ax)
            else:
                y_vals = pd.to_numeric(df[y_col], errors="coerce")
                valid_mask = y_vals.notna()
                if not valid_mask.any():
                    plt.close(fig)
                    return {"error": f"No numeric values found in '{y_col}'."}
                x_vals = df.loc[valid_mask, x_col].astype(str)
                ax.bar(x_vals, y_vals[valid_mask], color="#4C72B0")

        elif chart_type == "line":
            x_is_categorical = not pd.api.types.is_numeric_dtype(df[x_col])

            if x_is_categorical:
                x_pos = list(range(len(df)))
                if hue_col:
                    palette = sns.color_palette()
                    unique_hues = df[hue_col].unique()
                    hue_color_map = {
                        h: palette[i % len(palette)] for i, h in enumerate(unique_hues)
                    }
                    for group in unique_hues:
                        mask = df[hue_col] == group
                        idxs = df.index[mask].tolist()
                        pos = [df.index.get_loc(i) for i in idxs]
                        ax.plot(
                            pos,
                            df.loc[idxs, y_col].values,
                            marker="o",
                            label=group,
                            color=hue_color_map[group],
                            linewidth=2,
                        )
                    if colors:
                        highlight_indices = {
                            i for i, c in enumerate(colors) if c != "lightgray"
                        }
                        for i in range(len(df)):
                            ax.scatter(
                                x_pos[i],
                                df[y_col].iloc[i],
                                color=colors[i],
                                s=80,
                                zorder=5,
                                alpha=1.0 if i in highlight_indices else 0.4,
                            )
                    ax.legend(title=hue_col)
                else:
                    ax.plot(
                        x_pos,
                        df[y_col].values,
                        marker="o",
                        linewidth=2,
                        color="#4C72B0",
                    )
                    if colors:
                        for i, c in enumerate(colors):
                            ax.scatter(
                                x_pos[i], df[y_col].iloc[i], color=c, s=80, zorder=5
                            )
                labels_all = df[x_col].tolist()
                n_labels = len(labels_all)
                if n_labels > 10:
                    step = max(1, n_labels // 10)
                    ax.set_xticks(x_pos[::step])
                    ax.set_xticklabels(labels_all[::step])
                else:
                    ax.set_xticks(x_pos)
                    ax.set_xticklabels(labels_all)
            else:
                sns.lineplot(data=df, x=x_col, y=y_col, hue=hue_col, ax=ax)
                if colors:
                    for i in range(len(df)):
                        ax.scatter(
                            df[x_col].iloc[i],
                            df[y_col].iloc[i],
                            color=colors[i],
                            s=80,
                            zorder=5,
                        )

        elif chart_type == "scatter":
            if colors and not hue_col:
                ax.scatter(df[x_col], df[y_col], c=colors, s=80)
            else:
                sns.scatterplot(data=df, x=x_col, y=y_col, hue=hue_col, ax=ax)

        elif chart_type == "histogram":
            sns.histplot(data=df, x=x_col, hue=hue_col, kde=False, ax=ax)

        elif chart_type == "pie":
            if len(df) > 10:
                plt.close(fig)
                return {"error": "Pie chart supports maximum 10 categories."}
            fig.set_size_inches(6, 6)
            ax.pie(df[y_col], labels=df[x_col], autopct="%1.1f%%")
            ax.set_aspect("equal")

        else:
            plt.close(fig)
            return {"error": f"Unsupported chart type: {chart_type}"}

        ax.set_title(title or chart_type.capitalize())

        if chart_type != "pie":
            ax.tick_params(axis="x", labelrotation=45)
            for label in ax.get_xticklabels():
                label.set_ha("right")
            if x_label:
                ax.set_xlabel(x_label)
            if y_label:
                ax.set_ylabel(y_label)

        fig.tight_layout()
        fig.savefig(plot_path, bbox_inches="tight", pad_inches=0.2)
        plt.close(fig)

        media_url = getattr(settings, "MEDIA_URL", "/media/")
        server_base = os.getenv("SERVER_PATH", "http://localhost:8000")
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


@tool("update_canvas")
@traceable(name="update_canvas", run_type="tool")
def update_canvas(
    content: str,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Tambahkan konten baru ke canvas laporan dalam format markdown.
    Teruskan HANYA konten baru — jangan sertakan konten canvas yang sudah ada.
    Selalu awali konten dengan heading ## [Judul Section].
    Gunakan setelah membuat visualisasi, tabel data penting, atau insight final."""
    current = (state.get("canvas") or "").rstrip()
    separator = "\n\n" if current else ""
    new_canvas = current + separator + content
    return Command(
        update={
            "canvas": new_canvas,
            "messages": [ToolMessage("Canvas updated.", tool_call_id=tool_call_id)],
        }
    )


@tool("clear_canvas")
@traceable(name="clear_canvas", run_type="tool")
def clear_canvas(
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Hapus semua isi canvas. Gunakan saat pengguna meminta laporan baru atau
    beralih ke topik yang tidak berhubungan dengan konten canvas sebelumnya."""
    return Command(
        update={
            "canvas": "",
            "messages": [ToolMessage("Canvas cleared.", tool_call_id=tool_call_id)],
        }
    )


TOOL_NAMES = [
    query_postgres.name,
    generate_seaborn_plot.name,
    get_schema.name,
    update_canvas.name,
    clear_canvas.name,
]
