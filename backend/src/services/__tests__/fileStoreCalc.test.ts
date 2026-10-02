import { describe, it, expect } from 'vitest';
import {
  bytesOfDataUri, dataUriOf, endpointInput, objectKey, prefixInput, regionOf, storageFailure, storageInput, storageProblem,
} from '../fileStoreCalc';

const settings = (over: any = {}) => ({
  provider: 'S3', endpoint: '', region: 'ap-south-1', bucket: 'aveon-hr-files', accessKeyId: 'AKIAEXAMPLE', secretEnc: 'v1:x:y:z',
  prefix: '', forcePathStyle: false, ...over,
});

describe('storage settings as typed', () => {
  it('takes an https endpoint, and plain http only on the same machine', () => {
    expect(endpointInput('https://abc123.r2.cloudflarestorage.com/')).toEqual({ endpoint: 'https://abc123.r2.cloudflarestorage.com' });
    expect(endpointInput(' https://s3.us-west-004.backblazeb2.com ')).toEqual({ endpoint: 'https://s3.us-west-004.backblazeb2.com' });
    expect(endpointInput('')).toEqual({ endpoint: '' });
    expect(endpointInput('http://127.0.0.1:9000')).toEqual({ endpoint: 'http://127.0.0.1:9000' });
    expect(endpointInput('http://localhost:9000/')).toEqual({ endpoint: 'http://localhost:9000' });
    expect(endpointInput('http://storage.example.com')).toMatch(/https/);
    expect(endpointInput('http://10.0.0.5:9000')).toMatch(/https/);
    expect(endpointInput('ftp://files.example.com')).toMatch(/https/);
    expect(endpointInput('files.example.com')).toMatch(/web address/);
  });

  it('refuses an endpoint carrying a key or a query', () => {
    expect(endpointInput('https://key:secret@s3.example.com')).toMatch(/access key out/);
    expect(endpointInput('https://s3.example.com/?x=1')).toMatch(/nothing after/);
  });

  it('tidies the folder and keeps it inside the bucket', () => {
    expect(prefixInput(' /hr//documents/ ')).toEqual({ prefix: 'hr/documents' });
    expect(prefixInput('hr\\documents')).toEqual({ prefix: 'hr/documents' });
    expect(prefixInput('')).toEqual({ prefix: '' });
    expect(prefixInput('../other')).toMatch(/may hold/);
    expect(prefixInput('hr/../../x')).toMatch(/may hold/);
    expect(prefixInput('hr docs')).toMatch(/may hold/);
    expect(prefixInput('x'.repeat(101))).toMatch(/100/);
  });

  it('checks the bucket, region and key, and returns only what was sent', () => {
    expect(storageInput({ bucket: 'aveon-hr-files', region: 'AP-South-1', accessKeyId: ' AKIAEXAMPLE ' }))
      .toEqual({ bucket: 'aveon-hr-files', region: 'ap-south-1', accessKeyId: 'AKIAEXAMPLE' });
    expect(storageInput({ provider: 'S3', forcePathStyle: 1 })).toEqual({ provider: 'S3', forcePathStyle: true });
    expect(storageInput({ bucket: 'My Bucket' })).toMatch(/bucket name/);
    expect(storageInput({ bucket: 'ab' })).toMatch(/bucket name/);
    expect(storageInput({ region: 'ap south' })).toMatch(/region/);
    expect(storageInput({ accessKeyId: 'AKIA EXAMPLE' })).toMatch(/no spaces/);
    expect(storageInput({ provider: 'DISK' })).toMatch(/where files are kept/);
    expect(storageInput({})).toEqual({});
  });

  it('never returns the secret key', () => {
    expect(storageInput({ bucket: 'aveon-hr-files', secretAccessKey: 'shh', secretEnc: 'x' })).toEqual({ bucket: 'aveon-hr-files' });
  });
});

describe('whether object storage can be used', () => {
  it('names what is missing', () => {
    expect(storageProblem(settings(), true)).toBeNull();
    expect(storageProblem(settings({ bucket: '' }), true)).toMatch(/bucket/);
    expect(storageProblem(settings({ region: '' }), true)).toMatch(/region/);
    expect(storageProblem(settings({ accessKeyId: '' }), true)).toMatch(/access key ID/);
    expect(storageProblem(settings({ secretEnc: '' }), true)).toMatch(/secret access key is not set/);
    expect(storageProblem(settings(), false)).toMatch(/no longer be read/);
  });

  it('does not ask for a region when the service has its own endpoint', () => {
    const r2 = settings({ endpoint: 'https://abc123.r2.cloudflarestorage.com', region: '' });
    expect(storageProblem(r2, true)).toBeNull();
    expect(regionOf(r2)).toBe('auto');
    expect(regionOf(settings())).toBe('ap-south-1');
  });
});

describe('a file in the bucket', () => {
  it('goes under the company and the person, named by ids only', () => {
    expect(objectKey('', 'org1', 'person9', 'file7', 'application/pdf')).toBe('employee-documents/org1/person9/file7.pdf');
    expect(objectKey('hr/docs', 'org1', 'person9', 'file7', 'image/jpeg')).toBe('hr/docs/employee-documents/org1/person9/file7.jpg');
    expect(objectKey('', 'org1', 'person9', 'file7', 'text/html')).toBe('employee-documents/org1/person9/file7.bin');
  });

  it('cannot be steered outside its folder by an id', () => {
    expect(objectKey('', '../../etc', 'a/b', 'x y.pdf', 'image/png')).toBe('employee-documents/etc/ab/xypdf.png');
  });

  it('comes back as the same bytes it went in as', () => {
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0x10]);
    const uri = dataUriOf('application/pdf', bytes);
    expect(uri.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(bytesOfDataUri(uri)).toEqual({ mimeType: 'application/pdf', bytes });
  });
});

describe('a failure from the storage service', () => {
  it('is put in words that say what to check', () => {
    expect(storageFailure({ name: 'NoSuchBucket', message: 'The specified bucket does not exist' })).toMatch(/bucket does not exist/);
    expect(storageFailure({ name: 'InvalidAccessKeyId' })).toMatch(/not accepted/);
    expect(storageFailure({ name: 'SignatureDoesNotMatch' })).toMatch(/not accepted/);
    expect(storageFailure({ name: 'AccessDenied' })).toMatch(/not allowed/);
    expect(storageFailure({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:9000' })).toMatch(/check the endpoint/);
    expect(storageFailure({ name: 'TimeoutError', message: 'socket timed out' })).toMatch(/did not answer/);
    expect(storageFailure({ name: 'PermanentRedirect' })).toMatch(/another region/);
    expect(storageFailure({ message: 'Something else' })).toBe('Something else');
    expect(storageFailure(null)).toMatch(/refused/);
  });
});
