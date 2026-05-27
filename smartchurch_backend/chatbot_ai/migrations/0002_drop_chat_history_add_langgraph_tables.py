from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("chatbot_ai", "0001_initial"),
    ]

    operations = [
        migrations.DeleteModel(
            name="ChatHistory",
        ),
        migrations.RunSQL(
            sql="""
                CREATE TABLE IF NOT EXISTS checkpoint_migrations (
                    v INTEGER PRIMARY KEY
                );

                CREATE TABLE IF NOT EXISTS checkpoints (
                    thread_id TEXT NOT NULL,
                    checkpoint_ns TEXT NOT NULL DEFAULT '',
                    checkpoint_id TEXT NOT NULL,
                    parent_checkpoint_id TEXT,
                    type TEXT,
                    checkpoint JSONB NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}',
                    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
                );

                CREATE TABLE IF NOT EXISTS checkpoint_blobs (
                    thread_id TEXT NOT NULL,
                    checkpoint_ns TEXT NOT NULL DEFAULT '',
                    channel TEXT NOT NULL,
                    version TEXT NOT NULL,
                    type TEXT NOT NULL,
                    blob BYTEA,
                    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
                );

                CREATE TABLE IF NOT EXISTS checkpoint_writes (
                    thread_id TEXT NOT NULL,
                    checkpoint_ns TEXT NOT NULL DEFAULT '',
                    checkpoint_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    idx INTEGER NOT NULL,
                    channel TEXT NOT NULL,
                    type TEXT,
                    blob BYTEA NOT NULL,
                    task_path TEXT DEFAULT '',
                    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
                );
            """,
            reverse_sql="""
                DROP TABLE IF EXISTS checkpoint_writes;
                DROP TABLE IF EXISTS checkpoint_blobs;
                DROP TABLE IF EXISTS checkpoints;
                DROP TABLE IF EXISTS checkpoint_migrations;
            """,
        ),
    ]
