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
    dormant = db.execute("select season_json from realities where id='Dormant-unfinished-fixture'").fetchone()
    assert dormant and len(json.loads(dormant[0])['teams']) == 60, 'Inactive unfinished season missing'
    assert json.loads(dormant[0])['status'] == 'in-progress'
    assert db.execute("select count(*) from reality_history where reality_id='Dormant-unfinished-fixture'").fetchone()[0] == 0
print('Migration and active/inactive unfinished franchises verified')

if '--require-format8' in sys.argv:
    with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as db:
        assert db.execute("select value from schema_meta where key='persist_version'").fetchone()[0] == '8'
        root = json.loads(db.execute("select state_json from global_state where store_key='draftsim-store'").fetchone()[0])
        assert 'season' in root['_draftsimFragments']
        season = json.loads(db.execute("select value_json from global_fragments where store_key='draftsim-store' and fragment_key='season'").fetchone()[0])
        assert len(season['teams']) == 60
    print('Partitioned storage format verified')
if '--require-migration-backup' in sys.argv:
    found = False
    for candidate in path.parent.rglob('backup-*.db'):
        with sqlite3.connect(candidate.as_uri() + '?mode=ro', uri=True) as backup:
            version = backup.execute("select value from schema_meta where key='persist_version'").fetchone()
            name = backup.execute("select value from schema_meta where key='backup_name'").fetchone()
            if version == ('7',) and name == ('Before storage format 8',):
                assert backup.execute('pragma integrity_check').fetchone()[0] == 'ok'
                row = backup.execute("select season_json from realities where id='Install-smoke-fixture'").fetchone()
                assert row and len(json.loads(row[0])['teams']) == 60
                found = True
    assert found, 'Recoverable format 7 migration backup missing'
    print('Pre-migration backup verified')
