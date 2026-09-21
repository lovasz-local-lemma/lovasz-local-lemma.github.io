// The official Canvas adapter calls these virtual methods while drawing an
// evaluated artboard. Record alongside it; never infer geometry from pixels.
const identity = [1, 0, 0, 1, 0, 0];
const point = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];

function transformed(commands, matrix) {
  return commands.map(([verb, ...coords]) => {
    const result = [verb];
    for (let i = 0; i < coords.length; i += 2) result.push(...point(matrix, coords[i], coords[i+1]));
    return result;
  });
}

function path2D(commands) {
  const path = new Path2D();
  for (const [verb, ...p] of commands) {
    if (verb === 'M') path.moveTo(...p);
    else if (verb === 'L') path.lineTo(...p);
    else if (verb === 'C') path.bezierCurveTo(...p);
    else path.closePath();
  }
  return path;
}

function cubic(a, b, c, d, output, depth = 0) {
  const dx = d[0]-a[0], dy = d[1]-a[1];
  const error = Math.max(Math.abs((b[0]-a[0])*dy-(b[1]-a[1])*dx), Math.abs((c[0]-a[0])*dy-(c[1]-a[1])*dx));
  // Also bound the control polygon: collinear cubics can double back.
  const chord = Math.hypot(dx,dy), polygon = Math.hypot(b[0]-a[0],b[1]-a[1])+Math.hypot(c[0]-b[0],c[1]-b[1])+Math.hypot(d[0]-c[0],d[1]-c[1]);
  if (depth >= 10 || (error <= .4*Math.max(chord,1) && polygon-chord < .5)) { output.push(d); return; }
  const mid = (p,q) => [(p[0]+q[0])*.5,(p[1]+q[1])*.5];
  const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),m=mid(abc,bcd);
  cubic(a,ab,abc,m,output,depth+1); cubic(m,bcd,cd,d,output,depth+1);
}

function flatten(commands) {
  const contours=[]; let points=null, current=[0,0];
  for (const [verb,...p] of commands) {
    if (verb==='M') { points=[[p[0],p[1]]]; contours.push({points,closed:false}); current=points[0]; }
    else if (points && verb==='L') { current=p; points.push(current); }
    else if (points && verb==='C') { const end=p.slice(4); cubic(current,p.slice(0,2),p.slice(2,4),end,points); current=end; }
    else if (points && verb==='Z') { points.push(points[0]); current=points[0]; contours.at(-1).closed=true; }
  }
  return contours.filter(c=>c.points.length>1);
}

export function installCapture(runtime) {
  let active=null, nextPath=1;
  const factory=runtime.renderFactory, originalPath=factory.makeRenderPath, originalPaint=factory.makeRenderPaint;
  const wrap=(object,key,callback)=>{const original=object[key];object[key]=function(...args){callback.call(this,...args);return original.apply(this,args);};};
  factory.makeRenderPath=function(){
    const path=originalPath.call(factory); path.recordedCommands=[]; path.recordedId=nextPath++; path.recordedRule='nonzero';
    wrap(path,'rewind',function(){this.recordedCommands=[];});
    for(const [method,verb]of [['moveTo','M'],['lineTo','L'],['cubicTo','C'],['close','Z']])wrap(path,method,function(...p){this.recordedCommands.push([verb,...p]);});
    wrap(path,'addPath',function(source,...matrix){this.recordedCommands.push(...transformed(source.recordedCommands||[],matrix));});
    wrap(path,'fillRule',function(rule){this.recordedRule=rule===runtime.FillRule.evenOdd?'evenodd':'nonzero';});
    return path;
  };
  factory.makeRenderPaint=function(){
    const paint=originalPaint.call(factory);paint.recordedAlpha=1;paint.recordedColour=0xffffffff;paint.recordedStyle='fill';paint.recordedGradient=false;
    wrap(paint,'color',function(value){this.recordedColour=value>>>0;this.recordedAlpha=(value>>>24)/255;this.recordedGradient=false;});
    wrap(paint,'style',function(value){this.recordedStyle=value===runtime.RenderPaintStyle.stroke?'stroke':'fill';});
    for(const key of ['linearGradient','radialGradient'])wrap(paint,key,function(){this.recordedGradient=true;this.recordedAlpha=0;});
    wrap(paint,'addStop',function(value){this.recordedAlpha=Math.max(this.recordedAlpha,(value>>>24)/255);});
    return paint;
  };
  const proto=runtime.CanvasRenderer.prototype, originals={};
  function intercept(key,fn){const original=proto[key];originals[key]=original;proto[key]=function(...args){if(active)fn.call(this,...args);return original.apply(this,args);};}
  const matrixOf=renderer=>{const m=[...identity];renderer._getMatrix(m);return m;};
  intercept('save',function(){active.stack.push({alpha:active.alpha,clips:active.clips.slice()});});
  intercept('restore',function(){const state=active.stack.pop();if(state){active.alpha=state.alpha;active.clips=state.clips;}});
  intercept('modulateOpacity',function(value){active.alpha*=value;});
  intercept('_clipPath',function(path){const commands=transformed(path.recordedCommands||[],matrixOf(this));active.clips.push({commands,rule:path.recordedRule||'nonzero',path:path2D(commands)});});
  intercept('_drawPath',function(path,paint){
    const id=active.draws.length;
    if(id>=800){active.truncated=true;return;}
    const commands=transformed(path.recordedCommands||[],matrixOf(this));
    active.draws.push({id,pathId:path.recordedId,commands,alpha:Math.max(0,active.alpha)*paint.recordedAlpha,colour:paint.recordedColour,style:paint.recordedStyle,gradient:paint.recordedGradient,clips:active.clips.slice(),contours:flatten(commands)});
  });
  intercept('_drawRiveImage',function(){active.images++;});
  intercept('_drawImageMesh',function(){active.meshes++;});
  const hitContext=document.createElement('canvas').getContext('2d');
  function clipped(draw, contour) {
    if(!draw.clips.length)return [{...contour,id:draw.id,alpha:draw.alpha}];
    const inside=p=>draw.clips.every(c=>hitContext.isPointInPath(c.path,p[0],p[1],c.rule));
    const result=[];let run=null;
    // Clip the centerline, not the glow footprint. Subpixel boundary refinement
    // keeps the beam geometry continuous while the phosphor may bloom outside.
    const boundary=(a,b,ia)=>{for(let j=0;j<9;j++){const m=[(a[0]+b[0])*.5,(a[1]+b[1])*.5];if(inside(m)===ia)a=m;else b=m;}return[(a[0]+b[0])*.5,(a[1]+b[1])*.5];};
    for(let i=1;i<contour.points.length;i++){
      const a=contour.points[i-1],b=contour.points[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2));let prev=a,was=inside(a);
      for(let j=1;j<=steps;j++){
        const p=[a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps],is=inside(p);
        if(was){if(!run){run={id:draw.id,alpha:draw.alpha,points:[prev],closed:false};result.push(run);}run.points.push(is?p:boundary(prev,p,true));}
        else if(is){run={id:draw.id,alpha:draw.alpha,points:[boundary(prev,p,false),p],closed:false};result.push(run);}
        if(!is)run=null;prev=p;was=is;
      }
    }
    return result.filter(c=>c.points.length>1);
  }
  return {
    begin(){active={draws:[],stack:[],clips:[],alpha:1,images:0,meshes:0,truncated:false};},
    end({clip=true}={}){
      const frame=active;active=null;if(!frame)throw Error('No active vector capture');
      let count=0,pointLimit=false;frame.contours=[];
      for(const draw of frame.draws){if(draw.alpha<.01)continue;for(const contour of draw.contours){const parts=clip?clipped(draw,contour):[{...contour,id:draw.id,alpha:draw.alpha}];for(const part of parts){count+=part.points.length;if(count>120000){frame.truncated=pointLimit=true;break;}frame.contours.push(part);}if(pointLimit)break;}if(pointLimit)break;}
      frame.points=count;frame.cubics=frame.draws.reduce((n,d)=>n+d.commands.filter(c=>c[0]==='C').length,0);return frame;
    },
    dispose(){factory.makeRenderPath=originalPath;factory.makeRenderPaint=originalPaint;for(const[key,value]of Object.entries(originals))proto[key]=value;active=null;},
  };
}
