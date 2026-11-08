// Uses the AWS-managed SDK v3 supplied with the selected Lambda Node24 runtime.
// No credentials are accepted from jobs, outputs, configuration files or callers.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fail=()=>{throw new Error('AWS custody provider failed.');};
export function runtimeInfo(){return {node:process.version,s3:require('@aws-sdk/client-s3/package.json').version,kms:require('@aws-sdk/client-kms/package.json').version};}
async function bounded(body,maximum){
  const chunks=[];let length=0;
  for await(const value of body){const bytes=Buffer.from(value);length+=bytes.length;if(length>maximum){body.destroy?.();fail();}chunks.push(bytes);}
  return Buffer.concat(chunks);
}
export async function createAwsProvider(env){
  const [{S3Client,GetObjectCommand,PutObjectCommand},{KMSClient,EncryptCommand,DecryptCommand}]=await Promise.all([import('@aws-sdk/client-s3'),import('@aws-sdk/client-kms')]);
  const versions=runtimeInfo();
  // Provider SDK versions must be attested after deployment before key jobs work.
  if(env.REVIEWED_S3_SDK_VERSION!==versions.s3||env.REVIEWED_KMS_SDK_VERSION!==versions.kms)fail();
  if(!env.KEY_BUCKET||!env.JOB_BUCKET||!env.CUSTODY_KMS_KEY_ARN)fail();
  const s3=new S3Client({region:env.AWS_REGION}),kms=new KMSClient({region:env.AWS_REGION});
  const get=async(Bucket,Key,VersionId,max)=>{
    try{const response=await s3.send(new GetObjectCommand({Bucket,Key,...(VersionId?{VersionId}:{})}));if(response.ContentLength>max)fail();return {bytes:await bounded(response.Body,max),versionId:response.VersionId};}
    catch(error){if(error?.name==='NoSuchKey')return null;throw new Error('AWS custody read failed.');}
  };
  const put=async(Bucket,Key,value)=>{
    const response=await s3.send(new PutObjectCommand({Bucket,Key,Body:JSON.stringify(value),ContentType:'application/json',ServerSideEncryption:'aws:kms',SSEKMSKeyId:env.CUSTODY_KMS_KEY_ARN,IfNoneMatch:'*'}));
    if(!response.VersionId)fail();return response.VersionId;
  };
  return {
    async readJob(id,version){const value=await get(env.JOB_BUCKET,`jobs/${id}/request.json`,version,30*1024*1024);if(!value)fail();return value.bytes;},
    async readResult(id){const value=await get(env.JOB_BUCKET,`results/${id}.json`,undefined,1024*1024);return value?{...JSON.parse(value.bytes.toString('utf8')),versionId:value.versionId}:null;},
    writeResult:(id,value)=>put(env.JOB_BUCKET,`results/${id}.json`,value),
    async readCustody(){const value=await get(env.KEY_BUCKET,'custody/firm.json',undefined,16384);return value?JSON.parse(value.bytes.toString('utf8')):null;},
    writeCustody:value=>put(env.KEY_BUCKET,'custody/firm.json',value),
    async encryptBundle(bytes,EncryptionContext){const result=await kms.send(new EncryptCommand({KeyId:env.CUSTODY_KMS_KEY_ARN,Plaintext:bytes,EncryptionContext}));if(!result.CiphertextBlob)fail();return result.CiphertextBlob;},
    async decryptBundle(CiphertextBlob,EncryptionContext){const result=await kms.send(new DecryptCommand({KeyId:env.CUSTODY_KMS_KEY_ARN,CiphertextBlob,EncryptionContext}));if(!result.Plaintext)fail();return result.Plaintext;},
  };
}
