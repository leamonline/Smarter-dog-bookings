import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('storage_archive', Path(__file__).with_name('storage_archive.py'))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)

class StorageArchiveTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'storage.tar.gz'
        self.content = b'private synthetic file\x00\xff'
        self.items = [{'id': 'file-1', 'name': 'file.bin', 'updated_at': '2026-10-27', 'metadata': {'size': len(self.content)}}]

    def transport(self, ref, key, path, body=None, **kwargs):
        if path == 'bucket': return [{'id': 'private', 'name': 'private', 'public': False}]
        if path.startswith('object/list/'):
            return self.items[body['offset']:body['offset'] + body['limit']]
        if path.startswith('object/authenticated/'): return self.content
        raise AssertionError('Unexpected network operation')

    def create(self):
        with patch.object(archive, 'storage_request', self.transport):
            return archive.backup('syntheticsource', 'fake-key', self.path)

    def test_archive_contains_exact_file_bytes_and_encrypted_manifest_inputs(self):
        manifest = self.create()
        verified = archive.validate_archive(self.path)
        self.assertEqual(manifest, verified)
        with tarfile.open(self.path) as tar:
            self.assertEqual(tar.extractfile(manifest['objects'][0]['blob']).read(), self.content)

    def test_download_size_mismatch_fails(self):
        self.items[0]['metadata']['size'] += 1
        with self.assertRaisesRegex(RuntimeError, 'size mismatch'): self.create()

    def test_missing_download_fails(self):
        def transport(*args, **kwargs):
            if args[2].startswith('object/authenticated/'): raise RuntimeError('download failed')
            return self.transport(*args, **kwargs)
        with patch.object(archive, 'storage_request', transport):
            with self.assertRaisesRegex(RuntimeError, 'download failed'): archive.backup('synthetic', 'key', self.path)

    def test_inventory_paginates_and_recurses(self):
        def transport(ref, key, path, body=None, **kwargs):
            if path == 'bucket': return [{'id': 'private'}]
            if body['prefix'] == '':
                data = [{'id': None, 'name': 'folder'}] + [{'id': str(i), 'name': str(i)} for i in range(101)]
            else: data = [{'id': 'nested', 'name': 'nested.bin'}]
            return data[body['offset']:body['offset']+body['limit']]
        with patch.object(archive, 'storage_request', transport):
            _, objects = archive.inventory('synthetic', 'key')
        self.assertEqual(len(objects), 102)
        self.assertIn('folder/nested.bin', [o['path'] for o in objects])

    def test_source_mutation_fails_instead_of_accepting_partial_snapshot(self):
        calls = 0
        def transport(*args, **kwargs):
            nonlocal calls
            result = self.transport(*args, **kwargs)
            if args[2].startswith('object/list/'):
                calls += 1
                if calls == 2: return []
            return result
        with patch.object(archive, 'storage_request', transport):
            with self.assertRaisesRegex(RuntimeError, 'changed during backup'): archive.backup('synthetic', 'key', self.path)

    def test_corruption_is_rejected_before_restore_network_access(self):
        manifest = self.create()
        manifest['objects'][0]['sha256'] = '0' * 64
        with tarfile.open(self.path, 'w:gz') as tar:
            for name, content in [('storage-manifest.json', json.dumps(manifest).encode()), ('blobs/0', self.content)]:
                info = tarfile.TarInfo(name); info.size = len(content); tar.addfile(info, io.BytesIO(content))
        with patch.object(archive, 'storage_request', side_effect=AssertionError('Network must not be called')):
            with self.assertRaisesRegex(RuntimeError, 'integrity mismatch'): archive.restore(self.path, 'scratch', 'key', 'scratch')

    def test_persistent_targets_cannot_be_restored(self):
        for target in archive.PROTECTED_REFS:
            with self.assertRaisesRegex(RuntimeError, 'target rejected'): archive.restore(self.path, target, 'key', target)

    def test_target_mismatch_cannot_be_restored(self):
        with self.assertRaisesRegex(RuntimeError, 'target rejected'): archive.restore(self.path, 'unexpected', 'key', 'scratch')

class CommandTests(unittest.TestCase):
    def test_existing_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'existing.age'
            output.write_bytes(b'precious existing backup')
            args = ['storage_archive.py', 'backup', '--project-ref', 'a' * 20, '--expected-project-ref', 'a' * 20, '--output', str(output)]
            with patch('sys.argv', args), patch.dict(archive.os.environ, {'BACKUP_AGE_PUBLIC_KEY': 'age1synthetic'}), patch.object(archive, 'project_key', side_effect=AssertionError('Existing output must fail before credentials')):
                with self.assertRaises(SystemExit): archive.main()
            self.assertEqual(output.read_bytes(), b'precious existing backup')

    def command_with_encryptor(self, output, encryptor):
        args = ['storage_archive.py', 'backup', '--project-ref', 'a' * 20, '--expected-project-ref', 'a' * 20, '--output', str(output)]
        def empty_backup(ref, key, path):
            manifest = {'version': 1, 'source_ref': ref, 'buckets': [], 'objects': []}
            with tarfile.open(path, 'w:gz') as tar:
                content = json.dumps(manifest).encode()
                info = tarfile.TarInfo('storage-manifest.json'); info.size = len(content)
                tar.addfile(info, io.BytesIO(content))
            return manifest
        with patch('sys.argv', args), patch.dict(archive.os.environ, {'BACKUP_AGE_PUBLIC_KEY': 'age1synthetic'}), patch.object(archive, 'project_key', return_value='fake-key'), patch.object(archive, 'backup', empty_backup), patch.object(archive.subprocess, 'run', encryptor), patch('sys.stdout', io.StringIO()):
            archive.main()

    def test_ciphertext_is_published_only_after_success(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'new.age'
            temporary = []
            def encrypt(args, **kwargs):
                candidate = Path(args[args.index('--output') + 1])
                temporary.append(candidate)
                self.assertFalse(output.exists())
                candidate.write_bytes(b'complete ciphertext')
                return type('Result', (), {'returncode': 0})()
            self.command_with_encryptor(output, encrypt)
            self.assertEqual(output.read_bytes(), b'complete ciphertext')
            self.assertFalse(temporary[0].exists())

    def test_racing_destination_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'raced.age'
            def encrypt(args, **kwargs):
                Path(args[args.index('--output') + 1]).write_bytes(b'new ciphertext')
                output.write_bytes(b'other completed backup')
                return type('Result', (), {'returncode': 0})()
            with self.assertRaisesRegex(RuntimeError, 'refusing to overwrite'):
                self.command_with_encryptor(output, encrypt)
            self.assertEqual(output.read_bytes(), b'other completed backup')

    def test_failed_encryption_never_publishes_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'failed.age'
            def encrypt(args, **kwargs):
                Path(args[args.index('--output') + 1]).write_bytes(b'partial ciphertext')
                return type('Result', (), {'returncode': 1})()
            with self.assertRaisesRegex(RuntimeError, 'encryption failed'):
                self.command_with_encryptor(output, encrypt)
            self.assertFalse(output.exists())

if __name__ == '__main__': unittest.main()
