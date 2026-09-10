import json
import sqlite3
import sys
from pathlib import Path
path = Path(sys.argv[1]).resolve()
if not path.is_file():
    raise SystemExit('Migrated database missing')
with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as db:
    assert db.execute('pragma integrity_check').fetchone()[0] == 'ok'
    row = db.execute('select name, year, season_json from realities where id = ?', ('Install-smoke-fixture',)).fetchone()
    assert row and row[0] == 'Install-smoke-fixture' and row[1] == 1, 'Fixture not preserved'
    season = json.loads(row[2])
    assert len(season['teams']) == 60, 'Team data changed during migration or reopen'
print('Migration and preserved franchise verified')
