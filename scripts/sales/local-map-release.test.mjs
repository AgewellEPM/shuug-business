import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMapConfig} from './prepare-local-map-release.mjs';
test('the map permits precisely one private tile image origin while protecting existing public CSP, routes and headers',()=>{
  const original={version:3,routes:[{src:'/.*',headers:{'Content-Security-Policy':"default-src 'self'; img-src 'self' data:;",'X-Frame-Options':'DENY'},continue:true},{src:'/sales',dest:'/sales.html'}]};
  const privateRoute={src:'/sales(?:\\.html)?',headers:{'Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org;"},continue:true};
  const candidate={...original,routes:[original.routes[0],privateRoute,original.routes[1]]};
  assert.deepEqual(validateMapConfig(JSON.stringify(original),JSON.stringify(candidate)),privateRoute);
  for(const route of [{...privateRoute,src:'/.*'}, {...privateRoute,headers:{'Content-Security-Policy':"default-src *; img-src *;"}}])assert.throws(()=>validateMapConfig(JSON.stringify(original),JSON.stringify({...candidate,routes:[original.routes[0],route,original.routes[1]]})));
  assert.throws(()=>validateMapConfig(JSON.stringify(original),JSON.stringify({...candidate,routes:[{...original.routes[0],headers:{'Content-Security-Policy':'*'}},privateRoute,original.routes[1]]})),/public CSP/);
});
