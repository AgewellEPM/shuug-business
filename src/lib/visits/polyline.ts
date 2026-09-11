export function decodePolyline(encoded:string):{lat:number;lng:number}[]{
  const points:{lat:number;lng:number}[]=[];let i=0,lat=0,lng=0;
  function next(){let shift=0,result=0,b=0;do{if(i>=encoded.length||shift>30)throw new Error("Invalid route shape");b=encoded.charCodeAt(i++)-63;if(b<0||b>63)throw new Error("Invalid route shape");result|=(b&31)<<shift;shift+=5;}while(b>=32);return result&1?~(result>>1):result>>1;}
  while(i<encoded.length){lat+=next();lng+=next();points.push({lat:lat/1e5,lng:lng/1e5});if(points.length>100000)throw new Error("Route shape too large");}return points;
}
