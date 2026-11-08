// Deploy only in the separately trusted key-custody AWS account.
const ref=name=>({Ref:name}),sub=value=>({'Fn::Sub':value}),get=(name,attribute)=>({'Fn::GetAtt':[name,attribute]});
const statement=(Effect,Action,Resource,Condition)=>({Effect,Action,Resource,...(Condition?{Condition}:{})});
const retained=(Type,Properties,extra={})=>({Type,DeletionPolicy:'Retain',UpdateReplacePolicy:'Retain',Properties,...extra});
const assume=Principal=>({Version:'2012-10-17',Statement:[{Effect:'Allow',Principal,Action:'sts:AssumeRole'}]});
const policy=Statement=>({Version:'2012-10-17',Statement});
const denyData=Action=>({Effect:'Deny',Principal:'*',Action,Resource:'*',Condition:{StringEquals:{'aws:PrincipalAccount':ref('DataHostAccountId')}}});
function bucket(){return retained('AWS::S3::Bucket',{VersioningConfiguration:{Status:'Enabled'},PublicAccessBlockConfiguration:{BlockPublicAcls:true,BlockPublicPolicy:true,IgnorePublicAcls:true,RestrictPublicBuckets:true},OwnershipControls:{Rules:[{ObjectOwnership:'BucketOwnerEnforced'}]},BucketEncryption:{ServerSideEncryptionConfiguration:[{BucketKeyEnabled:true,ServerSideEncryptionByDefault:{SSEAlgorithm:'aws:kms',KMSMasterKeyID:get('CustodyKey','Arn')}}]}});}
function bucketPolicy(name){
  const resources=[get(name,'Arn'),sub(`\${${name}.Arn}/*`)];
  return {Type:'AWS::S3::BucketPolicy',Properties:{Bucket:ref(name),PolicyDocument:policy([
    {...denyData('s3:*'),Resource:resources},
    {Effect:'Deny',Principal:'*',Action:'s3:*',Resource:resources,Condition:{Bool:{'aws:SecureTransport':'false'}}},
    {Effect:'Deny',Principal:'*',Action:'s3:PutObject',Resource:resources[1],Condition:{StringNotEquals:{'s3:x-amz-server-side-encryption':'aws:kms'}}},
    {Effect:'Deny',Principal:'*',Action:'s3:PutObject',Resource:resources[1],Condition:{StringNotEquals:{'s3:x-amz-server-side-encryption-aws-kms-key-id':get('CustodyKey','Arn')}}},
  ])}};
}
export function cloudFormation(){
  const parameters={
    ServiceName:{Type:'String',Default:'shuug-key-custody',AllowedPattern:'[a-z][a-z0-9-]{5,36}'},
    WorkspaceId:{Type:'String',AllowedPattern:'[A-Za-z0-9][A-Za-z0-9._:-]{0,127}',Description:'Opaque workspace routing ID; never a taxpayer identifier.'},
    DataHostAccountId:{Type:'String',AllowedPattern:'[0-9]{12}',Description:'AWS account holding the data/API host credentials; must differ from this account.'},
    TrustedOperatorPrincipalArn:{Type:'String',AllowedPattern:'arn:aws:iam::[0-9]{12}:user/[A-Za-z0-9+=,.@_/-]+',Description:'Existing IAM user in THIS key account with MFA. Federated/role sessions need a separate reviewed trust design.'},
    ArtifactBucket:{Type:'String',AllowedPattern:'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]'},
    ArtifactKey:{Type:'String',AllowedPattern:'[A-Za-z0-9._/-]+'},
    ArtifactObjectVersion:{Type:'String',MinLength:1,MaxLength:1024},
    ArtifactSha256:{Type:'String',AllowedPattern:'[A-Za-z0-9+/]{43}='},
    ReviewedS3SdkVersion:{Type:'String',Default:'REVIEW_REQUIRED',AllowedPattern:'REVIEW_REQUIRED|[0-9]+[.][0-9]+[.][0-9]+'},
    ReviewedKmsSdkVersion:{Type:'String',Default:'REVIEW_REQUIRED',AllowedPattern:'REVIEW_REQUIRED|[0-9]+[.][0-9]+[.][0-9]+'},
    ConfigurationRevision:{Type:'String',Default:'1',AllowedPattern:'[0-9]{1,10}',Description:'Increment for reviewed runtime/environment changes so an immutable version is republished.'},
  };
  const s3Via=sub('s3.${AWS::Region}.${AWS::URLSuffix}');
  const keyArn=get('CustodyKey','Arn');
  const s3Context={StringEquals:{'kms:ViaService':s3Via},ArnEquals:{'kms:EncryptionContext:aws:s3:arn':[get('KeyBucket','Arn'),get('JobBucket','Arn')]}};
  const resources={
    CustodyKey:retained('AWS::KMS::Key',{Description:'Shuug isolated custody: data-host account explicitly denied.',EnableKeyRotation:true,PendingWindowInDays:30,KeySpec:'SYMMETRIC_DEFAULT',KeyUsage:'ENCRYPT_DECRYPT',KeyPolicy:policy([
      {Sid:'KeyAccountAdministration',Effect:'Allow',Principal:{AWS:sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:root')},Action:'kms:*',Resource:'*'},
      denyData('kms:*'),
    ])}),
    KeyBucket:bucket(),JobBucket:bucket(),KeyBucketPolicy:bucketPolicy('KeyBucket'),JobBucketPolicy:bucketPolicy('JobBucket'),
    WorkerRole:{Type:'AWS::IAM::Role',Properties:{AssumeRolePolicyDocument:assume({Service:'lambda.amazonaws.com'}),Description:'Custody worker only; no data-host trust, IAM administration or network listener.'}},
    LogGroup:{Type:'AWS::Logs::LogGroup',Properties:{LogGroupName:sub('/aws/lambda/${ServiceName}'),RetentionInDays:30}},
    WorkerPolicy:{Type:'AWS::IAM::Policy',Properties:{PolicyName:'IsolatedCustodyWorker',Roles:[ref('WorkerRole')],PolicyDocument:policy([
      statement('Allow',['logs:CreateLogStream','logs:PutLogEvents'],get('LogGroup','Arn')),
      statement('Allow',['s3:ListBucket'],[get('KeyBucket','Arn'),get('JobBucket','Arn')]),
      statement('Allow',['s3:GetObject','s3:PutObject'],sub('${KeyBucket.Arn}/custody/firm.json')),
      statement('Allow',['s3:GetObjectVersion'],sub('${JobBucket.Arn}/jobs/*')),
      statement('Allow',['s3:GetObject','s3:PutObject'],sub('${JobBucket.Arn}/results/*')),
      statement('Allow',['kms:Encrypt','kms:Decrypt'],keyArn,{StringEquals:{'kms:EncryptionContext:workspaceId':ref('WorkspaceId'),'kms:EncryptionContext:service':'shuug-key-custody-v1'}}),
      statement('Allow',['kms:GenerateDataKey','kms:Decrypt'],keyArn,s3Context),
    ])}},
    Worker:{Type:'AWS::Lambda::Function',DependsOn:['WorkerPolicy','KeyBucketPolicy','JobBucketPolicy','LogGroup'],Properties:{FunctionName:ref('ServiceName'),Runtime:'nodejs24.x',Architectures:['arm64'],Handler:'cloud/aws/worker.handler',Role:get('WorkerRole','Arn'),MemorySize:512,Timeout:60,ReservedConcurrentExecutions:1,RuntimeManagementConfig:{UpdateRuntimeOn:'FunctionUpdate'},Code:{S3Bucket:ref('ArtifactBucket'),S3Key:ref('ArtifactKey'),S3ObjectVersion:ref('ArtifactObjectVersion')},Environment:{Variables:{WORKSPACE_ID:ref('WorkspaceId'),KEY_ACCOUNT_ID:ref('AWS::AccountId'),DATA_HOST_ACCOUNT_ID:ref('DataHostAccountId'),KEY_BUCKET:ref('KeyBucket'),JOB_BUCKET:ref('JobBucket'),CUSTODY_KMS_KEY_ARN:keyArn,REVIEWED_S3_SDK_VERSION:ref('ReviewedS3SdkVersion'),REVIEWED_KMS_SDK_VERSION:ref('ReviewedKmsSdkVersion'),CONFIGURATION_REVISION:ref('ConfigurationRevision')}}}},
    WorkerVersion:retained('AWS::Lambda::Version',{FunctionName:ref('Worker'),CodeSha256:ref('ArtifactSha256'),Description:sub('SHA256 ${ArtifactSha256}; S3 SDK ${ReviewedS3SdkVersion}; KMS SDK ${ReviewedKmsSdkVersion}; config ${ConfigurationRevision}')}),
    WorkerAlias:{Type:'AWS::Lambda::Alias',Properties:{Name:'approved',FunctionName:ref('Worker'),FunctionVersion:get('WorkerVersion','Version')}},
    OperatorRole:{Type:'AWS::IAM::Role',Properties:{Description:'Human approval only; same-key-account principal plus MFA required.',AssumeRolePolicyDocument:policy([{Effect:'Allow',Principal:{AWS:ref('TrustedOperatorPrincipalArn')},Action:'sts:AssumeRole',Condition:{Bool:{'aws:MultiFactorAuthPresent':'true'},StringEquals:{'aws:PrincipalAccount':ref('AWS::AccountId')}}}])}},
    OperatorPolicy:{Type:'AWS::IAM::Policy',Properties:{PolicyName:'ApproveSelectedCustodyJobs',Roles:[ref('OperatorRole')],PolicyDocument:policy([
      statement('Allow',['lambda:InvokeFunction'],ref('WorkerAlias')),
      statement('Allow',['s3:PutObject','s3:GetObjectVersion'],sub('${JobBucket.Arn}/jobs/*')),
      statement('Allow',['s3:GetObject','s3:GetObjectVersion'],sub('${JobBucket.Arn}/results/*')),
      statement('Allow',['kms:GenerateDataKey','kms:Decrypt'],keyArn,{StringEquals:{'kms:ViaService':s3Via},ArnEquals:{'kms:EncryptionContext:aws:s3:arn':get('JobBucket','Arn')}}),
      statement('Deny',['kms:Decrypt'],keyArn,{StringNotEqualsIfExists:{'kms:ViaService':s3Via}}),
      statement('Deny',['s3:*'],[get('KeyBucket','Arn'),sub('${KeyBucket.Arn}/*')]),
    ])}},
  };
  return {AWSTemplateFormatVersion:'2010-09-09',Description:'Private isolated Shuug staff key custody. No public recovery endpoint or real keys are created until an approved initialize job.',Parameters:parameters,Rules:{DifferentCustodyAccount:{Assertions:[{Assert:{'Fn::Not':[{'Fn::Equals':[ref('DataHostAccountId'),ref('AWS::AccountId')]}]},AssertDescription:'The key service must use a different AWS account from the data host.'}]},CommercialPartition:{Assertions:[{Assert:{'Fn::Equals':[ref('AWS::Partition'),'aws']},AssertDescription:'This reviewed package targets commercial AWS regions; review other partitions separately.'}]}},Resources:resources,Outputs:{OperatorRoleArn:{Value:get('OperatorRole','Arn')},ApprovedFunctionArn:{Value:ref('WorkerAlias')},JobBucket:{Value:ref('JobBucket')},CustodyKmsKeyArn:{Value:keyArn},WorkspaceId:{Value:ref('WorkspaceId')}}};
}
export function bootstrapCloudFormation(){
  return {AWSTemplateFormatVersion:'2010-09-09',Description:'Private versioned source-artifact staging only. No firm keys or live application deployment.',Resources:{ArtifactBucket:retained('AWS::S3::Bucket',{VersioningConfiguration:{Status:'Enabled'},PublicAccessBlockConfiguration:{BlockPublicAcls:true,BlockPublicPolicy:true,IgnorePublicAcls:true,RestrictPublicBuckets:true},OwnershipControls:{Rules:[{ObjectOwnership:'BucketOwnerEnforced'}]},BucketEncryption:{ServerSideEncryptionConfiguration:[{ServerSideEncryptionByDefault:{SSEAlgorithm:'AES256'}}]}})},Outputs:{ArtifactBucket:{Value:ref('ArtifactBucket')}}};
}
