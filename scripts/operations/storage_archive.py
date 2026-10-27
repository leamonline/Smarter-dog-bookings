"""Encrypted Supabase Storage archives. Credentials come only from environment variables."""
import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import urllib.request
import urllib.error
from urllib.parse import quote

PROTECTED_REFS = {'nlzhllhkigmsvrzduefz', 'btjnxvgkpdbfrrqxvkfj'}

def storage_request(ref,key,path,body=None,method=None,raw=False,content_type='application/json',extra=None):
 headers={'Authorization':'Bearer '+key,'apikey':key,'Content-Type':content_type}
 if extra:headers.update(extra)
 if body is not None and not isinstance(body,bytes):body=json.dumps(body).encode()
 req=urllib.request.Request('https://'+ref+'.supabase.co/storage/v1/'+path,data=body,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=120) as response:
   value=response.read()
   return value if raw else json.loads(value) if value else None
 except urllib.error.HTTPError as e:
  raise RuntimeError('Storage operation failed, HTTP '+str(e.code)+'; no path or credential logged') from None

def inventory(ref,key):
 buckets=storage_request(ref,key,'bucket')
 objects=[]
 for bucket in buckets:
  pending=['']
  while pending:
   prefix=pending.pop();offset=0
   while True:
    page=storage_request(ref,key,'object/list/'+quote(bucket['id'],safe=''),{'prefix':prefix,'limit':100,'offset':offset,'sortBy':{'column':'name','order':'asc'}})
    if not isinstance(page,list):raise RuntimeError('Unexpected object inventory response')
    for item in page:
     path=prefix+item['name']
     if item.get('id') is None:pending.append(path+'/')
     else:objects.append({'bucket':bucket['id'],'path':path,'id':item['id'],'updated_at':item.get('updated_at'),'metadata':item.get('metadata')})
    if len(page)<100:break
    offset+=len(page)
 return buckets,sorted(objects,key=lambda o:(o['bucket'],o['path']))

def backup(ref,key,output):
 buckets,objects=inventory(ref,key)
 blobs=[]
 with tarfile.open(output,'w:gz') as tar:
  for index,obj in enumerate(objects):
   content=storage_request(ref,key,'object/authenticated/'+quote(obj['bucket'],safe='')+'/'+quote(obj['path'],safe='/'),raw=True)
   expected=(obj.get('metadata') or {}).get('size')
   if expected is not None and len(content)!=int(expected):raise RuntimeError('Object download size mismatch')
   entry=dict(obj,blob='blobs/'+str(index),bytes=len(content),sha256=hashlib.sha256(content).hexdigest())
   blob=tarfile.TarInfo(entry['blob']);blob.size=len(content);blob.mode=0o600
   tar.addfile(blob,io.BytesIO(content));blobs.append(entry)
  after_buckets,after_objects=inventory(ref,key)
  if objects!=after_objects or buckets!=after_buckets:raise RuntimeError('Storage changed during backup; snapshot refused')
  manifest={'version':1,'source_ref':ref,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buckets':buckets,'objects':blobs}
  content=json.dumps(manifest).encode();info=tarfile.TarInfo('storage-manifest.json');info.size=len(content);info.mode=0o600;tar.addfile(info,io.BytesIO(content))
 return manifest

def validate_archive(path):
 with tarfile.open(path,'r:gz') as tar:
  members=tar.getmembers()
  if len([m for m in members if m.name=='storage-manifest.json'])!=1 or not all(m.isfile() for m in members):raise RuntimeError('Invalid Storage archive structure')
  manifest=json.load(tar.extractfile('storage-manifest.json'))
  if manifest.get('version')!=1:raise RuntimeError('Unknown Storage archive version')
  expected={'storage-manifest.json'}|{o['blob'] for o in manifest['objects']}
  if len(expected)!=len(members) or {m.name for m in members}!=expected:raise RuntimeError('Storage archive contains missing or unexpected objects')
  seen=set()
  for obj in manifest['objects']:
   if not re.fullmatch(r'blobs/[0-9]+',obj['blob']):raise RuntimeError('Unsafe blob member name')
   identity=(obj['bucket'],obj['path'])
   if identity in seen:raise RuntimeError('Duplicate Storage object in manifest')
   seen.add(identity)
   content=tar.extractfile(obj['blob']).read()
   if len(content)!=obj['bytes'] or hashlib.sha256(content).hexdigest()!=obj['sha256']:raise RuntimeError('Storage object integrity mismatch')
 return manifest

def restore(path,ref,key,expected_ref):
 if ref!=expected_ref or ref in PROTECTED_REFS:raise RuntimeError('Restore target rejected')
 manifest=validate_archive(path)
 existing={b['id'] for b in storage_request(ref,key,'bucket')}
 for bucket in manifest['buckets']:
  config={'id':bucket['id'],'name':bucket['name'],'public':False}
  for field in ['file_size_limit','allowed_mime_types']:
   if bucket.get(field) is not None:config[field]=bucket[field]
  if bucket['id'] not in existing:storage_request(ref,key,'bucket',config)
  else:storage_request(ref,key,'bucket/'+quote(bucket['id'],safe=''),{'public':False},method='PUT')
 matched=0;total=0
 with tarfile.open(path,'r:gz') as tar:
  for obj in manifest['objects']:
   content=tar.extractfile(obj['blob']).read()
   route='object/'+quote(obj['bucket'],safe='')+'/'+quote(obj['path'],safe='/')
   metadata=obj.get('metadata') or {}
   storage_request(ref,key,route,content,method='POST',content_type=metadata.get('mimetype','application/octet-stream'),extra={'x-upsert':'true'})
   restored=storage_request(ref,key,'object/authenticated/'+quote(obj['bucket'],safe='')+'/'+quote(obj['path'],safe='/'),raw=True)
   if len(restored)!=obj['bytes'] or hashlib.sha256(restored).hexdigest()!=obj['sha256']:raise RuntimeError('Restored object verification failed')
   matched+=1;total+=len(restored)
 return {'buckets':len(manifest['buckets']),'verified_objects':matched,'verified_bytes':total,'target_buckets_private':True}


def project_key(ref):
 token=os.environ.get('SUPABASE_ACCESS_TOKEN')
 if not token: raise RuntimeError('SUPABASE_ACCESS_TOKEN is required')
 req=urllib.request.Request('https://api.supabase.com/v1/projects/'+ref+'/api-keys',headers={'Authorization':'Bearer '+token})
 try:
  with urllib.request.urlopen(req,timeout=60) as response: keys=json.load(response)
 except urllib.error.HTTPError as error:
  raise RuntimeError('Could not obtain source API credential, HTTP '+str(error.code)) from None
 key=next((item.get('api_key') for item in keys if item.get('name')=='service_role'),None)
 if not key: raise RuntimeError('Project service-role credential unavailable')
 return key


def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('action',choices=['backup','restore'])
 parser.add_argument('--project-ref',required=True)
 parser.add_argument('--expected-project-ref',required=True)
 parser.add_argument('--output',type=Path)
 parser.add_argument('--input',type=Path)
 parser.add_argument('--identity',type=Path)
 args=parser.parse_args()
 if not re.fullmatch(r'[a-z]{20}',args.project_ref) or args.project_ref!=args.expected_project_ref:
  parser.error('Explicit project target does not match expected project')
 if args.action=='restore' and args.project_ref in PROTECTED_REFS:
  parser.error('Persistent restore target rejected')
 if args.action=='backup' and (args.output is None or not os.environ.get('BACKUP_AGE_PUBLIC_KEY')):
  parser.error('Backup requires --output and BACKUP_AGE_PUBLIC_KEY')
 if args.action=='backup' and args.output.exists():
  parser.error('Backup destination already exists; refusing to overwrite')
 if args.action=='restore' and (args.input is None or args.identity is None):
  parser.error('Restore requires --input and --identity')
 os.umask(0o077)
 with tempfile.TemporaryDirectory(prefix='storage-recovery-') as directory:
  plaintext=Path(directory)/'storage.tar.gz'
  if args.action=='backup':
   key=project_key(args.project_ref)
   manifest=backup(args.project_ref,key,plaintext)
   validate_archive(plaintext)
   # Publish only a complete ciphertext, atomically and without replacing a
   # prior backup even if another process creates the destination meanwhile.
   with tempfile.TemporaryDirectory(prefix='.storage-encrypted-',dir=args.output.parent) as encrypted_dir:
    encrypted=Path(encrypted_dir)/'archive.age'
    process=subprocess.run(['age','--encrypt','--recipient',os.environ['BACKUP_AGE_PUBLIC_KEY'],'--output',str(encrypted),str(plaintext)],capture_output=True)
    if process.returncode: raise RuntimeError('Archive encryption failed; diagnostic withheld')
    encrypted.chmod(0o600)
    try: os.link(encrypted,args.output)
    except FileExistsError: raise RuntimeError('Backup destination already exists; refusing to overwrite') from None
   print(json.dumps({'buckets':len(manifest['buckets']),'objects':len(manifest['objects']),'bytes':sum(o['bytes'] for o in manifest['objects']),'encrypted_sha256':hashlib.sha256(args.output.read_bytes()).hexdigest()}))
  else:
   process=subprocess.run(['age','--decrypt','--identity',str(args.identity),'--output',str(plaintext),str(args.input)],capture_output=True)
   if process.returncode: raise RuntimeError('Archive decryption failed; diagnostic withheld')
   validate_archive(plaintext)
   key=project_key(args.project_ref)
   print(json.dumps(restore(plaintext,args.project_ref,key,args.expected_project_ref)))

if __name__=='__main__':
 try:main()
 except Exception as error:
  # Never emit HTTP bodies, object names, credentials or SQL rows.
  if isinstance(error,RuntimeError): print(str(error),file=__import__('sys').stderr)
  else: print('Storage recovery operation failed; no private diagnostic emitted',file=__import__('sys').stderr)
  raise SystemExit(1)
