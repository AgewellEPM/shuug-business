import assert from 'node:assert/strict';
import {cloudFormation,bootstrapCloudFormation} from './template.mjs';
export function validateTemplate(template=cloudFormation()){
  assert.equal(template.AWSTemplateFormatVersion,'2010-09-09');
  const r=template.Resources,text=JSON.stringify(template);
  const permitted=new Set(['AWS::S3::Bucket','AWS::S3::BucketPolicy','AWS::KMS::Key','AWS::IAM::Role','AWS::IAM::Policy','AWS::Logs::LogGroup','AWS::Lambda::Function','AWS::Lambda::Version','AWS::Lambda::Alias']);
  for(const value of Object.values(r))assert(permitted.has(value.Type));
  assert.deepEqual(template.Rules.DifferentCustodyAccount.Assertions[0].Assert,{'Fn::Not':[{'Fn::Equals':[{Ref:'DataHostAccountId'},{Ref:'AWS::AccountId'}]}]});
  for(const name of ['KeyBucket','JobBucket']){
    const b=r[name];assert.equal(b.DeletionPolicy,'Retain');assert.equal(b.Properties.VersioningConfiguration.Status,'Enabled');
    assert(Object.values(b.Properties.PublicAccessBlockConfiguration).every(value=>value===true));
    assert.equal(b.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.SSEAlgorithm,'aws:kms');
    const statements=r[`${name}Policy`].Properties.PolicyDocument.Statement;
    assert(statements.some(s=>s.Effect==='Deny'&&s.Condition?.StringEquals?.['aws:PrincipalAccount']?.Ref==='DataHostAccountId'));
    assert(statements.some(s=>s.Effect==='Deny'&&s.Condition?.Bool?.['aws:SecureTransport']==='false'));
  }
  assert(r.CustodyKey.Properties.KeyPolicy.Statement.some(s=>s.Effect==='Deny'&&s.Condition?.StringEquals?.['aws:PrincipalAccount']?.Ref==='DataHostAccountId'));
  assert.equal(r.CustodyKey.Properties.EnableKeyRotation,true);assert.equal(r.CustodyKey.DeletionPolicy,'Retain');
  assert.equal(r.Worker.Properties.Runtime,'nodejs24.x');assert.equal(r.Worker.Properties.ReservedConcurrentExecutions,1);
  // The 10-MiB case evidence fixture exceeds the old 512-MiB allocation.
  // This prepared headroom is not a substitute for actual AWS qualification.
  assert(r.Worker.Properties.MemorySize>=2048);
  assert.equal(r.Worker.Properties.Environment.Variables.REVIEWED_S3_SDK_VERSION.Ref,'ReviewedS3SdkVersion');
  assert.equal(r.Worker.Properties.Environment.Variables.CONFIGURATION_REVISION.Ref,'ConfigurationRevision');
  assert.equal(template.Parameters.ReviewedS3SdkVersion.Default,'REVIEW_REQUIRED');
  const trust=r.OperatorRole.Properties.AssumeRolePolicyDocument.Statement[0];
  assert.equal(trust.Condition.Bool['aws:MultiFactorAuthPresent'],'true');assert.deepEqual(trust.Condition.StringEquals['aws:PrincipalAccount'],{Ref:'AWS::AccountId'});
  assert.equal(trust.Principal.AWS.Ref,'TrustedOperatorPrincipalArn');
  assert(new RegExp(`^(?:${template.Parameters.TrustedOperatorPrincipalArn.AllowedPattern})$`).test('arn:aws:iam::111111111111:user/synthetic-operator'));
  assert(!new RegExp(`^(?:${template.Parameters.TrustedOperatorPrincipalArn.AllowedPattern})$`).test('arn:aws:iam::111111111111:role/synthetic-federated-role'));
  assert(!text.includes('AWS::Lambda::Url'));assert(!text.includes('AWS::ApiGateway'));assert(!text.includes('PrivateKey'));assert(!text.includes('Passphrase'));
  assert.deepEqual(Object.keys(template.Outputs).sort(),['ApprovedFunctionArn','CustodyKmsKeyArn','JobBucket','OperatorRoleArn','WorkspaceId'].sort());
  assert.equal(r.WorkerVersion.Properties.CodeSha256.Ref,'ArtifactSha256');
  const bootstrap=bootstrapCloudFormation();assert.equal(bootstrap.Resources.ArtifactBucket.Properties.VersioningConfiguration.Status,'Enabled');
  return {ok:true,resources:Object.keys(r).length,sourcePolicyChecksPassed:true,awsServiceValidationPerformed:false};
}
if(import.meta.url===new URL(process.argv[1]??'',`file://${process.cwd()}/`).href)console.log(JSON.stringify(validateTemplate(),null,2));
