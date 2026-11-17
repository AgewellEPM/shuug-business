import {readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {createHash} from 'node:crypto';

// Reviewed @hpke/common1.11.0 Node<=18 fallbacks. Browsers use WebCrypto;
// neither this exception nor the import map supplies Node crypto to the portal.
const reviewedNodeFallbacks={
  'vendor/@hpke/common/esm/src/algorithm.js':'5993e61af2ed16a810b8ef80c16a1081e4fc973076e9cf60a6204ecd8a73ecd1',
  'vendor/@hpke/common/esm/src/utils/misc.js':'83d7ca506e5ca66010e85974a8c66031553be6ce6405d911fd3a4da8a9fd20cc',
};

/** Verify the deployed artifact's ESM imports, including literal lazy imports. */
export async function verifyPortalModules(root,files) {
  const available=new Set(files),html=await readFile(path.join(root,'index.html'),'utf8');
  const match=html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if(!match)throw new Error('The private portal has no independent import map.');
  const imports=JSON.parse(match[1]).imports;
  let checked=0,nodeFallbackImports=0;const dynamic=[];
  function resolve(specifier,from,lazy=false,digest='') {
    if(lazy&&specifier==='crypto'&&reviewedNodeFallbacks[from]===digest){nodeFallbackImports++;return;}
    let target;
    if(specifier.startsWith('./')||specifier.startsWith('../'))target=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
    else if(Object.hasOwn(imports,specifier))target=path.posix.normalize(imports[specifier]);
    else throw new Error(`The portal artifact has an unapproved module import in ${from}: ${specifier}`);
    if(!available.has(target))throw new Error(`The portal artifact is missing ${target}, imported by ${from}.`);
    checked++;
  }
  for(const file of files.filter(name=>/\.(mjs|js)$/.test(name))) {
    const code=await readFile(path.join(root,file),'utf8');
    const digest=createHash('sha256').update(code).digest('hex');
    const syntax=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,false,ts.ScriptKind.JS);
    if(syntax.parseDiagnostics.length)throw new Error(`The portal artifact contains invalid JavaScript: ${file}`);
    function visit(node) {
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))resolve(node.moduleSpecifier.text,file);
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword) {
        const argument=node.arguments[0];
        if(argument&&ts.isStringLiteralLike(argument))resolve(argument.text,file,true,digest);
        else dynamic.push(file);
      }
      ts.forEachChild(node,visit);
    }
    visit(syntax);
  }
  if(dynamic.length)throw new Error(`Review nonliteral browser imports before publishing: ${[...new Set(dynamic)].join(', ')}`);
  return {staticAndLiteralImports:checked,reviewedNodeOnlyFallbacks:nodeFallbackImports,unresolvedImports:0};
}
