# Generated to fix string defaults on BooleanFields ('True'/'False' -> True/False).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('info', '0016_auto_20210820_1553'),
    ]

    operations = [
        migrations.AlterField(
            model_name='attendance',
            name='status',
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name='marksclass',
            name='status',
            field=models.BooleanField(default=False),
        ),
    ]
