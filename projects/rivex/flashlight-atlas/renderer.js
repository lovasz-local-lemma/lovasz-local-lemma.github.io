/** Shared scene, independent photon batches and a persistent linear radiance mean. */
import {createFlowSimulation} from './flow.js';
export const FLASHLIGHT_VERTEX_COUNT = 30810;
export const FLASHLIGHT_UNIFORM_BYTES = 208;

export async function createFlashlightRenderer(canvas, options = {}) {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable in this browser.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter was available.');
  const device = await adapter.requestDevice();
  try {
    const context = canvas.getContext('webgpu');
    if (!context) { device.destroy(); throw new Error('The canvas could not create a WebGPU context.'); }
    const shaderSource = options.shaderSource ?? await fetch(new URL('./scene.wgsl', import.meta.url)).then(response => {
      if (!response.ok) throw new Error(`Scene shader could not load (${response.status}).`);
      return response.text();
    });
    const shader = device.createShaderModule({ label: 'Flashlight atlas · shared scene', code: shaderSource });
    const compilation = await shader.getCompilationInfo();
    const errors = compilation.messages.filter(message => message.type === 'error');
    if (errors.length) {
      device.destroy();
      throw new Error(errors.map(message => `WGSL ${message.lineNum}:${message.linePos}: ${message.message}`).join('\n'));
    }
    const width = Math.max(320, Math.min(1440, Math.round(options.width ?? 1040)));
    const height = Math.max(200, Math.min(1000, Math.round(options.height ?? 640)));
    canvas.width = width; canvas.height = height;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    const uniform = device.createBuffer({ label: 'Flashlight controls', size: FLASHLIGHT_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const texture = (label, textureFormat, extraUsage = 0) => device.createTexture({
      label, size: [width, height], format: textureFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | extraUsage,
    });
    const raster = texture('Hardware raster baseline', 'rgba16float', GPUTextureUsage.TEXTURE_BINDING);
    const photons = texture('Refracted photon receiver', 'rgba16float', GPUTextureUsage.TEXTURE_BINDING);
    const depth = texture('Triangle depth', 'depth32float');
    const beams = texture('Refracted volume beams', 'rgba16float', GPUTextureUsage.TEXTURE_BINDING);
    const history = [0,1].map(i => ({photon:texture('Photon mean '+i,'rgba32float',GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC),beam:texture('Beam mean '+i,'rgba32float',GPUTextureUsage.TEXTURE_BINDING)}));
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const flow = await createFlowSimulation(device, {shaderSource:options.flowShaderSource});
    const vertexFragment = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    const flowBindings = [
      {binding:7,visibility:vertexFragment,texture:{sampleType:'float',viewDimension:'3d'}},
      {binding:8,visibility:vertexFragment,sampler:{type:'filtering'}},
    ];
    const flowResources = [{binding:7,resource:flow.view},{binding:8,resource:sampler}];
    const simpleLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: vertexFragment, buffer: { type: 'uniform' } },...flowBindings] });
    const compositeLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: vertexFragment, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      ...flowBindings,
    ] });
    const meanLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},...[3,4,5,6].map(binding=>({binding,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'unfilterable-float'}}))]});
    const meanPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[meanLayout]});
    const simplePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [simpleLayout] });
    const compositePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [compositeLayout] });
    const additive = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const [rasterPipeline, photonPipeline, beamPipeline, compositePipeline, meanPipeline] = await Promise.all([
      device.createRenderPipelineAsync({
        label: 'Actual triangles and depth', layout: simplePipelineLayout,
        vertex: { module: shader, entryPoint: 'rasterVertex' },
        fragment: { module: shader, entryPoint: 'rasterFragment', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
      }),
      device.createRenderPipelineAsync({
        label: 'Emitted rays → finite photon kernels', layout: simplePipelineLayout,
        vertex: { module: shader, entryPoint: 'photonVertex' },
        fragment: { module: shader, entryPoint: 'photonFragment', targets: [{ format: 'rgba16float', blend: { color: additive, alpha: additive } }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less-equal' },
      }),
      device.createRenderPipelineAsync({
        label: 'Finite photon beam reconstruction', layout: simplePipelineLayout,
        vertex: { module: shader, entryPoint: 'beamVertex' },
        fragment: { module: shader, entryPoint: 'beamFragment', targets: [{ format: 'rgba16float', blend: { color: additive, alpha: additive } }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less-equal' },
      }),
      device.createRenderPipelineAsync({
        label: 'Ray-traced flashlight and participating haze', layout: compositePipelineLayout,
        vertex: { module: shader, entryPoint: 'vertexMain' },
        fragment: { module: shader, entryPoint: 'fragmentMain', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      }),
      device.createRenderPipelineAsync({label:'Independent batches → linear running mean',layout:meanPipelineLayout,vertex:{module:shader,entryPoint:'vertexMain'},fragment:{module:shader,entryPoint:'meanFragment',targets:[{format:'rgba32float'},{format:'rgba32float'}]},primitive:{topology:'triangle-list'}}),
    ]);
    const simpleGroup = device.createBindGroup({ layout: simpleLayout, entries: [{ binding: 0, resource: { buffer: uniform } },...flowResources] });
    const compositeGroups = history.map(record=>device.createBindGroup({ layout: compositeLayout, entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: raster.createView() },
      { binding: 2, resource: sampler },
      { binding: 3, resource: record.photon.createView() },
      { binding: 4, resource: record.beam.createView() },
      ...flowResources,
    ] }));
    const meanGroups=history.map(record=>device.createBindGroup({layout:meanLayout,entries:[{binding:0,resource:{buffer:uniform}},{binding:3,resource:photons.createView()},{binding:4,resource:beams.createView()},{binding:5,resource:record.photon.createView()},{binding:6,resource:record.beam.createView()}]}));
    let disposed = false, previousState='',previousScene='',previousGate=0,previousTemporal=false,batches=0,historyIndex=0,emitted=0,previousFlowReset=0;
    const metrics = { width, height, triangles: FLASHLIGHT_VERTEX_COUNT / 3, photonCount: 8192, mode: 2, frames: 0, passes: 5, beamCount: 1536,batches:0,emitted:0,phase:'preview',generation:0 };
    const values = new Float32Array(FLASHLIGHT_UNIFORM_BYTES / 4);
    const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
    const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
    const render = (state = {}) => {
      if (disposed) return;
      const mode = clamp(finite(state.mode, 2), 0, 3);
      const requestedPhotons=Math.round(clamp(finite(state.photons,4096),512,65536));
      const photonCount = state.preview?512:state.flowEnabled&&!state.flowPaused?Math.min(2048,requestedPhotons):requestedPhotons;
      const beamCount = Math.min(photonCount, 1536);
      const encoder = device.createCommandEncoder({ label: 'Flashlight frame' });
      if((state.flowReset??0)!==previousFlowReset){previousFlowReset=state.flowReset??0;flow.reset();}
      const flowEnabled=!!state.flowEnabled&&mode>.5;
      const flowChanged=flow.update(encoder,{...state,dt:state.flowDt??0,flowEnabled,width,height},flowEnabled&&!state.flowPaused);
      const flowStats=flow.stats();
      const signature=JSON.stringify({...state,flowDt:undefined,flowClock:undefined,sampleSeed:undefined});
      const sceneSignature=JSON.stringify({...state,flowDt:undefined,flowClock:undefined,gateCenter:undefined,sampleSeed:undefined});
      const gate=finite(state.gateCenter,8),gateWidth=clamp(finite(state.gateWidth,1),.08,8);
      const temporalPreview=!!state.preview&&!!state.gateOn&&state.temporalHistory!==false&&mode>1.5;
      // Only a nearby optical-gate move can reuse history. Geometry, aim,
      // materials and animated density remain part of sceneSignature.
      const reuseTemporal=!flowChanged&&temporalPreview&&previousTemporal&&sceneSignature===previousScene&&Math.abs(gate-previousGate)<=Math.max(.08,gateWidth*.55);
      const reset=flowChanged||(!reuseTemporal&&(signature!==previousState||state.accumulate===false||state.preview));
      if(reset){batches=0;emitted=0;metrics.generation++;}
      previousState=signature;previousScene=sceneSignature;previousGate=gate;previousTemporal=temporalPreview;
      const sequence=state.sampleSeed??batches;
      const weight=1/(temporalPreview?Math.min(6,batches+1):batches+1);
      values.set([
        width, height, finite(state.time, 0), clamp(finite(state.exposure, 1), 0.2, 3),
        clamp(finite(state.aimX, 0.56), 0, 1), clamp(finite(state.aimY, 0.41), 0, 1), clamp(finite(state.radius, 0.28), 0.07, 0.65), mode,
        clamp(finite(state.density, 0.12), 0, 0.6), state.gateOn ? 1 : 0, clamp(finite(state.gateCenter, 8), 0, 30), clamp(finite(state.gateWidth, 1), 0.08, 8),
        clamp(finite(state.ior, 1.5), 1.05, 2), photonCount, beamCount, sequence,
        weight, state.preview?1:0, 1, 0,
        clamp(finite(state.materialPair, 0), 0, 9), clamp(finite(state.wire, 0.75), 0, 1), clamp(finite(state.mediumMode, 1), 0, 6), state.followTransport === false ? 0 : 1,
        clamp(finite(state.lightX,-2.7),-4.5,4.8),clamp(finite(state.lightY,6.4),.35,7.5),clamp(finite(state.lightZ,1.4),-3.4,6.8),0,
        clamp(finite(state.sphereX,-.85),-3.2,2.4),clamp(finite(state.sphereY,2.35),.5,4.2),clamp(finite(state.sphereZ,.25),-2.6,2.5),clamp(finite(state.sphereRadius,.86),.35,1.3),
        clamp(finite(state.bump,0),0,1),clamp(finite(state.kernel,.065),.025,.16),clamp(finite(state.feather,.35),.1,.75),0,
        clamp(finite(state.metalX,1.58),-3.2,3.8),clamp(finite(state.metalY,1.03),.45,4.2),clamp(finite(state.metalZ,-.48),-2.6,2.5),clamp(finite(state.metalRadius,.93),.35,1.3),
        clamp(finite(state.mediumScale,2.4),.7,5),clamp(finite(state.mediumContrast,.9),0,1),flowEnabled?1:0,clamp(finite(state.flowView,0),0,1),
        clamp(finite(state.brightness,1),0,5),clamp(finite(state.torchYaw,0),-50,50)*Math.PI/180,clamp(finite(state.torchPitch,0),-50,50)*Math.PI/180,clamp(finite(state.dispersion,0),0,.08),
        Math.round(clamp(finite(state.sourceShape,0),0,2)),clamp(finite(state.sourceRadius,.18),0,.5),0,0,
      ]);
      device.queue.writeBuffer(uniform, 0, values);
      if(reset){const rasterPass = encoder.beginRenderPass({
        colorAttachments: [{ view: raster.createView(), clearValue: { r: 0.012, g: 0.023, b: 0.031, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      rasterPass.setPipeline(rasterPipeline); rasterPass.setBindGroup(0, simpleGroup); rasterPass.draw(FLASHLIGHT_VERTEX_COUNT); rasterPass.end();}
      const photonPass = encoder.beginRenderPass({ colorAttachments: [{ view: photons.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }], depthStencilAttachment: { view: depth.createView(), depthReadOnly: true } });
      if (mode > 1.5) { photonPass.setPipeline(photonPipeline); photonPass.setBindGroup(0, simpleGroup); photonPass.draw(6 * photonCount); }
      photonPass.end();
      const beamPass = encoder.beginRenderPass({ colorAttachments: [{ view: beams.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }], depthStencilAttachment: { view: depth.createView(), depthReadOnly: true } });
      if (mode > 1.5 && (state.mediumMode !== 0 || flowEnabled) && (state.density ?? .12) > 0) { beamPass.setPipeline(beamPipeline); beamPass.setBindGroup(0, simpleGroup); beamPass.draw(6 * beamCount); }
      beamPass.end();
      const next=1-historyIndex;
      const meanPass=encoder.beginRenderPass({colorAttachments:[history[next].photon,history[next].beam].map(t=>({view:t.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}))});
      meanPass.setPipeline(meanPipeline);meanPass.setBindGroup(0,meanGroups[historyIndex]);meanPass.draw(3);meanPass.end();historyIndex=next;
      const compositePass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
      compositePass.setPipeline(compositePipeline); compositePass.setBindGroup(0, compositeGroups[historyIndex]); compositePass.draw(3); compositePass.end();
      device.queue.submit([encoder.finish()]);
      metrics.mode = mode; metrics.photonCount = photonCount; metrics.beamCount = beamCount; metrics.frames += 1;batches++;emitted+=photonCount;Object.assign(metrics,{batches,emitted,phase:temporalPreview?'temporal preview':state.preview?'preview':state.accumulate===false?'single batch':'refining',historyWeight:weight,historyBatches:temporalPreview?Math.min(6,batches):batches,kernelScale:state.preview?.45:1});
      canvas.dataset.renderer = 'webgpu'; canvas.dataset.frames = String(metrics.frames);
      metrics.flow={...flowStats,enabled:flowEnabled,changed:flowChanged};
    };
    device.addEventListener('uncapturederror', event => options.onError?.(event.error));
    device.lost.then(info => { if (!disposed) options.onError?.(new Error(info.message || 'WebGPU device was lost.')); });
    const dispose = () => {
      if (disposed) return;
      disposed = true; flow.destroy();raster.destroy(); photons.destroy(); beams.destroy(); depth.destroy(); uniform.destroy();for(const record of history){record.photon.destroy();record.beam.destroy();} context.unconfigure(); device.destroy();
    };
    const readMean=async()=>{const bytesPerRow=Math.ceil(width*16/256)*256;const buffer=device.createBuffer({size:bytesPerRow*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture:history[historyIndex].photon},{buffer,bytesPerRow},[width,height]);device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);const raw=new Float32Array(buffer.getMappedRange()),result=new Float32Array(width*height*4);for(let y=0;y<height;y++)result.set(raw.subarray(y*bytesPerRow/4,y*bytesPerRow/4+width*4),y*width*4);buffer.unmap();buffer.destroy();return result;};
    return { render, dispose, shaderSource, metrics,readMean };
  } catch (error) {
    // A shader or pipeline can fail after textures and buffers were allocated.
    // Releasing the device keeps repeated Reset attempts from retaining them.
    device.destroy();
    throw error;
  }
}
