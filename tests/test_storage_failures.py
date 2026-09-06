import fcntl
import os
import subprocess
import sys
import tempfile

import pytest

from hermes_desktop_excalidraw import scene_store as store


def test_old_but_live_lock_is_not_stolen(tmp_path, monkeypatch):
    monkeypatch.setattr(store, 'LOCK_TIMEOUT_SECONDS', 0.05)
    with store._write_lock(tmp_path):
        os.utime(tmp_path / store.LOCK_FILENAME, (1, 1))
        with pytest.raises(store.SceneError) as error:
            store.replace_scene(tmp_path, store.empty_scene(), store.read_scene(tmp_path)['revision'])
        assert error.value.code == 'lock_timeout'
    assert not (tmp_path / store.DRAWING_FILENAME).exists()


def test_process_exit_releases_lock_without_deleting_inode(tmp_path):
    lock = tmp_path / store.LOCK_FILENAME
    subprocess.run([sys.executable, '-c',
        'import fcntl,os,sys; fd=os.open(sys.argv[1],os.O_CREAT|os.O_WRONLY,0o600); fcntl.flock(fd,fcntl.LOCK_EX); os._exit(0)',
        str(lock)], check=True)
    inode = lock.stat().st_ino
    result = store.replace_scene(tmp_path, store.empty_scene(), store.read_scene(tmp_path)['revision'])
    assert result['success']
    assert lock.stat().st_ino == inode


def test_fifo_read_does_not_wait_for_a_writer(tmp_path):
    os.mkfifo(tmp_path / store.DRAWING_FILENAME)
    with pytest.raises(store.SceneError, match='regular file'):
        store.read_scene(tmp_path)


def test_temporary_file_failure_is_redacted_and_preserves_document(tmp_path, monkeypatch):
    revision = store.read_scene(tmp_path)['revision']
    store.replace_scene(tmp_path, store.empty_scene(), revision)
    before = (tmp_path / store.DRAWING_FILENAME).read_bytes()

    def fail(**kwargs):
        raise PermissionError('private path must not escape')

    monkeypatch.setattr(tempfile, 'mkstemp', fail)
    with pytest.raises(store.SceneError) as error:
        store.replace_scene(tmp_path, store.empty_scene(), revision)
    assert error.value.code == 'write_failed'
    assert 'private path' not in str(error.value)
    assert (tmp_path / store.DRAWING_FILENAME).read_bytes() == before


def test_malformed_nested_and_nonfinite_scenes_do_not_replace_document(tmp_path):
    initial = store.read_scene(tmp_path)
    scene = store.empty_scene()
    scene['elements'] = [float('nan')]
    with pytest.raises(store.SceneError):
        store.replace_scene(tmp_path, scene, initial['revision'])
    scene['elements'] = []
    scene['elements'].append(scene['elements'])
    with pytest.raises(store.SceneError, match='nested too deeply'):
        store.replace_scene(tmp_path, scene, initial['revision'])
    assert not (tmp_path / store.DRAWING_FILENAME).exists()
