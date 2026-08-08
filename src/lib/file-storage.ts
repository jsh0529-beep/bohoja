import {mkdir,readFile,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256} from '@/lib/database';

export const MAX_UPLOAD_BYTES=10*1024*1024;
export const MAX_PDF_PAGES=20;
type FileKind={extension:string;mimeType:string;kind:string};

const root=path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR??path.join(process.cwd(),'data','uploads'));
const safeName=(name:string)=>name.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,'').replace(/[\\/]/g,'_').slice(0,120)||'document';

function detect(buffer:Buffer):FileKind|null{
  if(buffer.subarray(0,5).toString()==='%PDF-')return {extension:'pdf',mimeType:'application/pdf',kind:'document'};
  if(buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return {extension:'png',mimeType:'image/png',kind:'image'};
  if(buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return {extension:'jpg',mimeType:'image/jpeg',kind:'image'};
  const brand=buffer.subarray(4,12).toString('ascii');
  if(brand.startsWith('ftyp')&&/(heic|heix|hevc|hevx|mif1|msf1)/.test(brand))return {extension:'heic',mimeType:'image/heic',kind:'image'};
  return null;
}

function inspectPdf(buffer:Buffer){
  const content=buffer.toString('latin1');
  if(/\/(JavaScript|JS|OpenAction|Launch|EmbeddedFile)\b/i.test(content))throw new Error('실행 코드나 첨부 파일이 포함된 PDF는 업로드할 수 없습니다.');
  const pages=content.match(/\/Type\s*\/Page\b/g)?.length??1;
  if(pages>MAX_PDF_PAGES)throw new Error(`PDF는 최대 ${MAX_PDF_PAGES}페이지만 업로드할 수 있습니다.`);
  return Math.max(1,pages);
}

export async function storeUpload(caseId:string,file:File){
  if(file.size===0)throw new Error('빈 파일은 업로드할 수 없습니다.');
  if(file.size>MAX_UPLOAD_BYTES)throw new Error('파일은 최대 10MB까지 업로드할 수 있습니다.');
  const buffer=Buffer.from(await file.arrayBuffer());
  const detected=detect(buffer);if(!detected)throw new Error('JPG, PNG, HEIC, PDF 파일만 업로드할 수 있습니다.');
  const pageCount=detected.extension==='pdf'?inspectPdf(buffer):1;
  const storageKey=`${caseId}/${randomUUID()}.${detected.extension}`;
  const target=path.resolve(root,storageKey);
  if(!target.startsWith(root+path.sep))throw new Error('안전하지 않은 저장 경로입니다.');
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(/* turbopackIgnore: true */ target,buffer,{flag:'wx'});
  return {storageKey,originalName:safeName(file.name),mimeType:detected.mimeType,byteSize:buffer.length,sha256:sha256(buffer),pageCount,kind:detected.kind};
}

export async function readUpload(storageKey:string){const target=path.resolve(root,storageKey);if(!target.startsWith(root+path.sep))throw new Error('안전하지 않은 저장 경로입니다.');return readFile(/* turbopackIgnore: true */ target);}
export async function removeUpload(storageKey:string){const target=path.resolve(root,storageKey);if(!target.startsWith(root+path.sep))throw new Error('안전하지 않은 저장 경로입니다.');await unlink(/* turbopackIgnore: true */ target).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});}
