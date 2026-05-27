from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ChatHistory",
            fields=[
                (
                    "id",
                    models.AutoField(
                        primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("session_id", models.TextField(blank=True, null=True)),
                ("message", models.TextField(blank=True, null=True)),
            ],
            options={
                "db_table": "chat_history",
            },
        ),
    ]
