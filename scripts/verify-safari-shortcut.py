#!/usr/bin/env python3
"""Read back signed shortcut payloads and compare actions with the local package.
Apple Shortcuts performs signature trust verification when importing.
Requires the PyPI lzfse decoder; no network calls.
"""
import hashlib
import json
import plistlib
import struct
from pathlib import Path
import lzfse

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / '.local' / 'shortcut-packages'
OUT = ROOT / 'src' / 'shortcut' / 'install'


def extract(data):
    if len(data) > 256 * 1024 or data[:4] != b'AEA1':
        raise ValueError('Not a bounded signed shortcut archive')
    auth_size = struct.unpack_from('<I', data, 8)[0]
    auth = plistlib.loads(data[12:12+auth_size])
    if not auth.get('SigningCertificateChain'):
        raise ValueError('Missing signing certificate chain')
    at = data.find(b'bvx2', 12 + auth_size)
    if at < 0 or not data.endswith(b'bvx$'):
        raise ValueError('Unexpected signed archive compression')
    archive = lzfse.decompress(data[at:])
    if len(archive) > 256 * 1024:
        raise ValueError('Decoded archive too large')
    offset = 0
    files = {}
    while offset < len(archive):
        if archive[offset:offset+4] != b'AA01':
            raise ValueError('Unexpected Apple Archive entry')
        length = struct.unpack_from('<H', archive, offset+4)[0]
        header = archive[offset:offset+length]
        pat = header.index(b'PATP') + 4
        size = struct.unpack_from('<H', header, pat)[0]
        name = header[pat+2:pat+2+size].decode()
        kind = header[header.index(b'TYP1')+4:header.index(b'TYP1')+5]
        data_size = 0
        if kind == b'F':
            dat = header.index(b'DAT') + 3
            widths = {ord('A'): 2, ord('B'): 4, ord('C'): 8}
            width = widths.get(header[dat])
            if width is None:
                raise ValueError('Unexpected archive file size encoding')
            data_size = int.from_bytes(header[dat+1:dat+1+width], 'little')
            files[name] = archive[offset+length:offset+length+data_size]
            if len(files[name]) != data_size:
                raise ValueError('Truncated archive file')
        elif kind != b'D':
            raise ValueError('Unexpected archive item type')
        offset += length + data_size
    if set(files) != {'Shortcut.wflow'}:
        raise ValueError('Unexpected files in signed shortcut')
    return plistlib.loads(files['Shortcut.wflow'])


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for variant in ['default', 'apple-maps']:
        unsigned = plistlib.loads((WORK / f'safari-{variant}.unsigned.shortcut').read_bytes())
        data = (WORK / f'safari-{variant}.signed.shortcut').read_bytes()
        payload = extract(data)
        # Signing legitimately normalizes these non-action metadata fields.
        permitted = {'WFWorkflowName', 'WFWorkflowClientVersion', 'WFWorkflowHasOutputFallback'}
        left = {k:v for k,v in unsigned.items() if k not in permitted}
        right = {k:v for k,v in payload.items() if k not in permitted}
        if left != right:
            raise ValueError(f'{variant}: signed workflow differs from the reviewed local source')
        script = payload['WFWorkflowActions'][1]['WFWorkflowActionParameters']['WFJavaScript']
        source = (ROOT / 'src' / 'generated' / f'safari-{variant}.js').read_text()
        if script != source:
            raise ValueError(f'{variant}: embedded JavaScript changed')
        (OUT / f'safari-{variant}.shortcut').write_bytes(data)
        manifest.append({'variant':variant,'file':f'safari-{variant}.shortcut','actions':len(payload['WFWorkflowActions']),'scriptSha256':hashlib.sha256(source.encode()).hexdigest(),'signedSha256':hashlib.sha256(data).hexdigest(),'payloadCompared':True,'signer':'RoutineHub HubSign','deviceImportVerified':False})
    (OUT / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(manifest,ensure_ascii=False,indent=2))
