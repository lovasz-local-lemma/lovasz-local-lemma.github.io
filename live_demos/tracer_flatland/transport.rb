# Corrected browser edition. The historical Raylib desktop files remain unchanged.
# True 2D angular measure: diffuse f = rho/2, p(theta) = cos(theta)/2.
require 'json'

module FlatlandTransport
  VERSION = '1.1.0'
  EPS = 1.0e-7
  METHODS = %w[pt mis lt].freeze
  module_function
  def add(a,b); [a[0]+b[0],a[1]+b[1]]; end
  def sub(a,b); [a[0]-b[0],a[1]-b[1]]; end
  def scale(a,s); a.map { |v| v*s }; end
  def dot(a,b); a[0]*b[0]+a[1]*b[1]; end
  def cross(a,b); a[0]*b[1]-a[1]*b[0]; end
  def length(a); Math.sqrt(dot(a,a)); end
  def unit(a); scale(a,1.0/length(a)); end
  def rgb(a,b); a.zip(b).map { |x,y| x*y }; end
  def rgb_add(a,b); a.zip(b).map { |x,y| x+y }; end
  def luminance(a); a[0]*0.2126+a[1]*0.7152+a[2]*0.0722; end
  def power_weight(a,b); a=a.to_f;b=b.to_f;a<=0 ? 0.0 : a*a/(a*a+b*b); end
  def angular_pdf(normal,direction); [dot(normal,direction),0.0].max*0.5; end
  def light_pdf(distance,cosine,total_length); cosine>EPS ? distance/(cosine*total_length) : 0.0; end
  def cosine_direction(normal,u)
    sine=2.0*u-1.0
    cosine=Math.sqrt([0.0,1.0-sine*sine].max)
    [normal[0]*cosine-normal[1]*sine,normal[1]*cosine+normal[0]*sine]
  end

  # Fully specified stream for native Ruby / CRuby WebAssembly reproducibility.
  class RNG
    def initialize(seed); @state=seed.to_i & 0xffffffff; end
    def rand
      @state=(1664525*@state+1013904223)&0xffffffff
      (@state+0.5)/4294967296.0
    end
  end

  class Scene
    include FlatlandTransport
    attr_reader :objects,:lights,:camera,:fov,:total_length,:id,:options
    def initialize(options={})
      @options=options
      @id=%w[courtyard small_light baffle rgb direct].include?(options['scene']) ? options['scene'] : 'courtyard'
      @camera=[0.0,0.55]
      @fov=Math::PI*0.86
      @objects=[]; @lights=[]
      @rho=(options['albedo']||0.72).to_f.clamp(0.0,0.95)
      @light_width=(options['lightWidth']||(@id=='small_light' ? 0.28 : 1.4)).to_f.clamp(0.12,3.8)
      make_scene
      @total_length=@lights.sum { |o| o[:length] }
    end
    def segment(a,b,color,normal:nil,emission:nil,name:'wall')
      e=sub(b,a)
      o={type:'segment',a:a,b:b,normal:normal||unit([-e[1],e[0]]),color:color,length:length(e),name:name}
      o[:emission]=emission if emission
      @objects<<o; @lights<<o if emission
      o
    end
    def circle(center,radius,color,name)
      @objects<<{type:'circle',center:center,radius:radius,color:color,name:name}
    end
    def make_scene
      if @id=='direct'
        segment([-1.5,4.0],[1.5,4.0],[0,0,0],normal:[0,-1],emission:[3,3,3],name:'Calibration emitter')
        return
      end
      segment([-4.4,0],[-4.4,6.1],scale([0.85,0.34,0.25],@rho),name:'Terracotta wall')
      segment([4.4,6.1],[4.4,0],scale([0.30,0.74,0.67],@rho),name:'Jade wall')
      segment([-4.4,6.1],[4.4,6.1],scale([0.86,0.86,0.91],@rho),name:'Ceiling')
      segment([4.4,0],[-4.4,0],scale([0.69,0.70,0.79],@rho),name:'Floor')
      if @id=='rgb'
        [[-2.8,[4.5,0.45,0.25]],[0,[0.5,4.0,1.4]],[2.8,[0.55,1.0,5.5]]].each do |x,c|
          segment([x-@light_width/3,5.85],[x+@light_width/3,5.85],[0,0,0],normal:[0,-1],emission:c,name:'Colored emitter')
        end
      else
        x=@id=='baffle' ? 1.8 : 0.5
        segment([x-@light_width/2,5.85],[x+@light_width/2,5.85],[0,0,0],normal:[0,-1],emission:[5.0,4.4,3.2],name:'Line emitter')
      end
      if @id=='baffle'
        segment([-0.9,3.9],[3.8,3.9],scale([0.82,0.80,0.90],@rho),name:'Occluding shelf')
        circle([-2.5,2.8],0.82,scale([0.65,0.78,0.84],@rho),'Diffuse vessel')
        circle([1.4,1.9],0.70,scale([0.83,0.70,0.48],@rho),'Diffuse vessel')
      else
        circle([-1.6,2.6],0.95,scale([0.92,0.76,0.52],@rho),'Ochre vessel')
        circle([1.65,3.5],1.0,scale([0.63,0.76,0.87],@rho),'Slate vessel')
        circle([0.3,1.65],0.38,scale([0.81,0.49,0.69],@rho),'Small mauve vessel')
      end
    end
    def intersect(origin,direction,limit=Float::INFINITY)
      nearest=nil; best=limit
      @objects.each do |o|
        if o[:type]=='segment'
          e=sub(o[:b],o[:a]); den=cross(direction,e)
          next if den.abs<EPS
          diff=sub(o[:a],origin)
          t=cross(diff,e)/den; u=cross(diff,direction)/den
          next unless t>EPS && t<best && u>=0 && u<=1
          p=add(origin,scale(direction,t)); n=o[:normal]
        else
          oc=sub(origin,o[:center]); b=dot(oc,direction)
          disc=b*b-dot(oc,oc)+o[:radius]*o[:radius]
          next if disc<0
          root=Math.sqrt(disc); t=-b-root; t=-b+root if t<=EPS
          next unless t>EPS && t<best
          p=add(origin,scale(direction,t)); n=unit(sub(p,o[:center]))
        end
        facing=dot(n,direction)<0 ? n : scale(n,-1)
        nearest={point:p,normal:facing,outward:n,object:o,distance:t}; best=t
      end
      nearest
    end
    def visible(a,b)
      d=sub(b,a); r=length(d)
      return false if r<EPS*10
      direction=scale(d,1.0/r)
      intersect(add(a,scale(direction,EPS*4)),direction,r-EPS*8).nil?
    end
    def sample_light(rng)
      select=rng.rand*@total_length
      light=@lights.last
      @lights.each { |o| if select<o[:length];light=o;break;else;select-=o[:length];end }
      [light,add(light[:a],scale(sub(light[:b],light[:a]),rng.rand))]
    end
    def camera_direction(u)
      angle=Math::PI/2+@fov/2-u*@fov
      [Math.cos(angle),Math.sin(angle)]
    end
    def camera_pixel(p,pixels)
      d=sub(p,@camera); a=Math.atan2(d[1],d[0]); u=(Math::PI/2+@fov/2-a)/@fov
      u>=0 && u<1 ? (u*pixels).floor : nil
    end
    def description
      {id:@id,camera:@camera,fov:@fov,objects:@objects,bounds:[-4.8,-0.25,4.8,6.55],totalLightLength:@total_length}
    end
  end

  # Surface photon density in true 2D: the reconstruction support is a LENGTH,
  # not a 3D disk area. Object and side identity prevent cross-wall leakage.
  # Finite bandwidth is intentionally biased. This is PM, not VCM or BDPT.
  class SurfacePhotonMap
    include FlatlandTransport
    attr_reader :launched, :stored, :queries, :positive, :radius, :budget, :emitted_flux
    def initialize(scene, options={})
      @scene=scene
      @radius=(options['photonRadius']||0.22).to_f
      raise ArgumentError,'Photon radius must be finite and positive' unless @radius.finite? && @radius>0
      @radius=@radius.clamp(0.01,2.0)
      @budget=(options['photonBudget']||4096).to_i.clamp(256,32768)
      @bounces=(options['bounces']||4).to_i.clamp(0,8)
      @pixels=(options['pixels']||64).to_i.clamp(8,128)
      @quadrature=(options['photonCameraSamples']||8).to_i.clamp(1,64)
      seed=(options['seed']||41).to_i
      @rng=RNG.new(seed+3*104729);@preview_rng=RNG.new(seed+4*104729)
      @launched=0;@stored=0;@queries=0;@positive=0;@emitted_flux=[0.0,0.0,0.0]
      @object_ids=@scene.objects.each_with_index.to_h
      @groups=Hash.new { |h,k| h[k]=[] };@index=nil;@preview=[];@last_events=[]
      @camera_hits=Array.new(@pixels) do |pixel|
        Array.new(@quadrature) do |j|
          direction=@scene.camera_direction((pixel+(j+0.5)/@quadrature)/@pixels)
          @queries+=1
          hit=@scene.intersect(@scene.camera,direction)
          [hit,direction]
        end
      end
    end
    def complete?;@launched>=@budget;end
    def surface_length(object)
      object[:type]=='circle' ? 2*Math::PI*object[:radius] : object[:length]
    end
    def coordinate(object,point)
      if object[:type]=='circle'
        (Math.atan2(point[1]-object[:center][1],point[0]-object[:center][0])%(2*Math::PI))*object[:radius]
      else
        dot(sub(point,object[:a]),unit(sub(object[:b],object[:a]))).clamp(0.0,object[:length])
      end
    end
    def key(hit)
      [@object_ids.fetch(hit[:object]),dot(hit[:normal],hit[:outward])>=0 ? 1 : -1]
    end
    def advance(record=false)
      return @last_events if complete?
      events=[];light,p=@scene.sample_light(@rng)
      flux=scale(light[:emission],2.0*@scene.total_length)
      @emitted_flux=rgb_add(@emitted_flux,flux)
      direction=cosine_direction(light[:normal],@rng.rand)
      events<<{kind:'photon-launch',a:p,b:p,throughput:flux.dup,normal:light[:normal],direction:direction,pdf:angular_pdf(light[:normal],direction),message:'Emit flux: 2 Le × total emitter length. Misses remain in the launch denominator.'} if record
      origin=add(p,scale(direction,EPS*4));deposited=false
      1.upto(@bounces) do |depth|
        @queries+=1;hit=@scene.intersect(origin,direction)
        unless hit
          events<<{kind:'escape',a:origin,b:add(origin,scale(direction,8)),throughput:flux.dup,message:'The photon escaped; its launch still counts.'} if record
          break
        end
        q=hit[:point];object=hit[:object]
        events<<{kind:'photon-hit',a:origin,b:q,throughput:flux.dup,normal:hit[:normal],depth:depth,material:object[:name],message:'A surface intersection along the emitted photon path.'} if record
        break if object[:emission]
        # Store arriving flux BEFORE the receiving material scatters it.
        @groups[key(hit)]<<[coordinate(object,q),flux.dup,q.dup,depth]
        @stored+=1;deposited=true;@index=nil
        mark={point:q.dup,flux:flux.dup,depth:depth}
        if @preview.length<600
          @preview<<mark
        else
          slot=(@preview_rng.rand*@stored).floor
          @preview[slot]=mark if slot<600
        end
        events<<{kind:'photon-store',a:q,b:q,throughput:flux.dup,normal:hit[:normal],depth:depth,message:'Store incident flux on this object and this side. The gather applies the receiving reflectance once.'} if record
        flux=rgb(flux,object[:color])
        break if flux.all? { |c| c==0 }
        direction=cosine_direction(hit[:normal],@rng.rand)
        origin=add(q,scale(direction,EPS*4))
      end
      @film_cache=nil
      @launched+=1;@positive+=1 if deposited
      @last_events=events if record
      events
    end
    def build_index
      return if @index
      @index=@groups.to_h do |k,entries|
        sorted=entries.sort_by(&:first);prefix=[[0.0,0.0,0.0]]
        sorted.each { |e| prefix<<rgb_add(prefix.last,e[1]) }
        [k,[sorted,prefix]]
      end
    end
    def support(object,point)
      s=coordinate(object,point);size=surface_length(object)
      if object[:type]=='circle'
        return [[[0.0,size]],size] if 2*@radius>=size
        low=s-@radius;high=s+@radius
        intervals=if low<0 then [[0.0,high],[low+size,size]]
                  elsif high>size then [[low,size],[0.0,high-size]]
                  else [[low,high]] end
        [intervals,2*@radius]
      else
        low=[s-@radius,0.0].max;high=[s+@radius,size].min
        [[[low,high]],high-low]
      end
    end
    def surface_point(object,s)
      if object[:type]=='circle'
        a=s/object[:radius];add(object[:center],scale([Math.cos(a),Math.sin(a)],object[:radius]))
      else
        add(object[:a],scale(sub(object[:b],object[:a]),s/object[:length]))
      end
    end
    def gather(hit,inspect=false)
      build_index
      intervals,width=support(hit[:object],hit[:point]);flux=[0.0,0.0,0.0];count=0;points=[]
      entries,prefix=@index.fetch(key(hit),[[],[[0.0,0.0,0.0]]])
      intervals.each do |low,high|
        first=entries.bsearch_index { |e| e[0]>=low }||entries.length
        last=entries.bsearch_index { |e| e[0]>high }||entries.length
        flux=rgb_add(flux,prefix[last].zip(prefix[first]).map { |a,b| a-b });count+=last-first
        points.concat(entries[first...[last,first+80].min].map { |e| e[2] }) if inspect
      end
      radiance=@launched>0 && width>0 ? scale(rgb(flux,hit[:object][:color]),0.5/(@launched*width)) : [0.0,0.0,0.0]
      result={radiance:radiance,photons:count,supportLength:width,incidentFlux:flux}
      if inspect
        result[:gatherPoints]=points.take(80)
        result[:supportLines]=intervals.map { |lo,hi| (0..24).map { |i| surface_point(hit[:object],lo+(hi-lo)*i/24) } }
      end
      result
    end
    def image
      return @film_cache if @film_cache
      @film_cache=@camera_hits.map do |bin|
        total=bin.reduce([0.0,0.0,0.0]) do |sum,(hit,direction)|
          value=if !hit then [0.0,0.0,0.0]
                elsif hit[:object][:emission]
                  dot(hit[:object][:normal],scale(direction,-1))>0 ? hit[:object][:emission] : [0.0,0.0,0.0]
                else gather(hit)[:radiance] end
          rgb_add(sum,value)
        end
        scale(total,1.0/@quadrature)
      end
    end
    def inspection
      candidates=@camera_hits.flatten(1).map(&:first).compact.reject { |h| h[:object][:emission] }
      hit=candidates.max_by { |h| luminance(gather(h)[:radiance]) }
      return @last_events unless hit
      g=gather(hit,true)
      @last_events+[{kind:'gather',a:hit[:point],b:hit[:point],throughput:g[:incidentFlux],contribution:g[:radiance],normal:hit[:normal],radius:@radius,photons:g[:photons],supportLength:g[:supportLength],gatherPoints:g[:gatherPoints],supportLines:g[:supportLines],message:"Gather #{g[:photons]} photons on #{g[:supportLength].round(3)} units of this surface. Divide by all #{@launched} launches and support length, then apply ρ/2. Finite-radius smoothing is biased."}]
    end
    def snapshot
      film=image
      {count:@launched,rays:@queries,image:film,mean:film.sum { |c| luminance(c) }/@pixels,standardError:nil,positive:@positive,nonzeroFraction:@launched>0 ? @positive.to_f/@launched : 0.0,stored:@stored,radius:@radius,budget:@budget,complete:complete?,cameraSamples:@quadrature,biased:true,preview:@preview}
    end
  end

  class Estimator
    include FlatlandTransport
    attr_reader :scene,:pixels,:max_bounces,:counts,:sums,:squares,:positive,:rays,:last_trace,:photon_map
    def initialize(options={})
      @scene=Scene.new(options)
      @pixels=(options['pixels']||64).to_i.clamp(8,128)
      @max_bounces=(options['bounces']||4).to_i.clamp(0,8)
      @seed=(options['seed']||41).to_i
      @rngs=METHODS.each_with_index.to_h { |m,i| [m,RNG.new(@seed+i*104729)] }
      @counts=METHODS.to_h { |m| [m,0] }
      @positive=METHODS.to_h { |m| [m,0] }
      @rays=METHODS.to_h { |m| [m,0] }
      @sums=METHODS.to_h { |m| [m,Array.new(@pixels) { [0.0,0.0,0.0] }] }
      @squares=METHODS.to_h { |m| [m,0.0] }
      @image_sums=METHODS.to_h { |m| [m,0.0] }
      @last_trace=nil
      @photon_map=SurfacePhotonMap.new(@scene,options) if options['photonMap']
    end
    def event(trace,kind,a,b,beta,more={})
      trace<<{kind:kind,a:a,b:b,throughput:beta.dup}.merge(more) if trace
    end
    def ray_hit(method,origin,dir)
      @rays[method]+=1
      @scene.intersect(origin,dir)
    end
    def visibility(method,a,b)
      @rays[method]+=1
      @scene.visible(a,b)
    end
    def path_sample(method,rng,trace=nil)
      u=rng.rand; pixel=(u*@pixels).floor; direction=@scene.camera_direction(u)
      origin=@scene.camera; beta=[1.0,1.0,1.0]; value=[0.0,0.0,0.0]
      previous=nil; previous_pdf=0.0
      0.upto(@max_bounces) do |depth|
        hit=ray_hit(method,origin,direction)
        unless hit
          event(trace,'escape',origin,add(origin,scale(direction,8)),beta,{depth:depth,message:'No emitter reached; this continuation contributes zero.'}); break
        end
        p=hit[:point]; n=hit[:normal]; o=hit[:object]
        event(trace,depth==0 ? 'camera' : 'bounce',origin,p,beta,{depth:depth,normal:n,material:o[:name],pdf:previous_pdf})
        if o[:emission]
          cosine=dot(o[:normal],scale(direction,-1))
          if cosine>0
            competing=previous ? light_pdf(length(sub(p,previous)),cosine,@scene.total_length) : 0.0
            weight=method=='mis' && previous ? power_weight(previous_pdf,competing) : 1.0
            c=scale(rgb(beta,o[:emission]),weight); value=rgb_add(value,c)
            event(trace,'emission',p,p,beta,{contribution:c,pdf:previous_pdf,otherPdf:competing,weight:weight,message:'An emitter hit contributes radiance; MIS weights the BSDF-sampled path.'})
          else
            event(trace,'backface',p,p,beta,{message:'The back of this one-sided emitter is dark.'})
          end
          break
        end
        break if depth>=@max_bounces
        if method=='mis'
          light,q=@scene.sample_light(rng)
          displacement=sub(q,p); distance=length(displacement); wi=scale(displacement,1.0/distance)
          cos_light=dot(light[:normal],scale(wi,-1)); cos_here=[dot(n,wi),0].max
          pdf_l=light_pdf(distance,cos_light,@scene.total_length); pdf_b=cos_here*0.5
          visible=cos_here>0 && cos_light>0 && visibility(method,p,q)
          weight=power_weight(pdf_l,pdf_b)
          c=visible ? scale(rgb(rgb(beta,o[:color]),light[:emission]),0.5*cos_here*weight/pdf_l) : [0.0,0.0,0.0]
          value=rgb_add(value,c)
          event(trace,visible ? 'connect' : 'blocked',p,q,beta,{contribution:c,pdf:pdf_l,otherPdf:pdf_b,weight:weight,normal:n,message:visible ? 'Sample a point on a light; convert length density to angular density.' : 'Occlusion or a back-facing connection gives zero; it still counts as a sample.'})
        end
        direction=cosine_direction(n,rng.rand)
        previous=p; previous_pdf=angular_pdf(n,direction)
        beta=rgb(beta,o[:color])
        event(trace,'sample',p,p,beta,{normal:n,direction:direction,pdf:previous_pdf,depth:depth,message:'Cosine sampling cancels f cos / p; throughput is multiplied by reflectance.'})
        origin=add(p,scale(direction,EPS*4))
      end
      {pixel=>value}
    end
    def light_sample(rng,trace=nil)
      light,p=@scene.sample_light(rng)
      value={}
      # A position sample supplies the direct camera term independently of emitted direction.
      connect_camera(value,'lt',p,light[:normal],scale(light[:emission],@scene.total_length),trace,'direct',nil)
      beta=scale(light[:emission],2.0*@scene.total_length)
      direction=cosine_direction(light[:normal],rng.rand)
      origin=add(p,scale(direction,EPS*4))
      event(trace,'launch',p,p,beta,{normal:light[:normal],direction:direction,pdf:angular_pdf(light[:normal],direction),message:'Position PDF 1/length, direction PDF cos/2: emitted flux weight = 2 Le × total length.'})
      1.upto(@max_bounces) do |depth|
        hit=ray_hit('lt',origin,direction)
        unless hit
          event(trace,'escape',origin,add(origin,scale(direction,8)),beta,{depth:depth,message:'The emitted path escaped. Its zero contribution remains in the denominator.'});break
        end
        q=hit[:point]; o=hit[:object]; n=hit[:normal]
        event(trace,'light-bounce',origin,q,beta,{depth:depth,normal:n,material:o[:name]})
        break if o[:emission]
        connect_camera(value,'lt',q,n,scale(rgb(beta,o[:color]),0.5),trace,'camera-connect',o)
        beta=rgb(beta,o[:color]);direction=cosine_direction(n,rng.rand)
        event(trace,'sample',q,q,beta,{normal:n,direction:direction,pdf:angular_pdf(n,direction),depth:depth,message:'The next diffuse direction is sampled from cos/2; flux throughput is multiplied by reflectance.'})
        origin=add(q,scale(direction,EPS*4))
      end
      value
    end
    def connect_camera(values,method,p,normal,coefficient,trace,kind,object)
      displacement=sub(@scene.camera,p); distance=length(displacement); direction=scale(displacement,1.0/distance)
      cosine=dot(normal,direction); pixel=@scene.camera_pixel(p,@pixels)
      visible=cosine>0 && !pixel.nil? && visibility(method,p,@scene.camera)
      c=visible ? scale(coefficient,cosine/distance/(@scene.fov/@pixels)) : [0.0,0.0,0.0]
      values[pixel]=rgb_add(values.fetch(pixel,[0.0,0.0,0.0]),c) if visible
      event(trace,visible ? kind : 'blocked',p,@scene.camera,coefficient,{contribution:c,pixel:pixel,geometry:cosine>0 ? cosine/distance : 0.0,normal:normal,message:visible ? 'Splat the camera connection into its angular bin: cos / (distance × bin width).' : 'The camera connection is blocked, back-facing, or outside the field of view.'})
    end
    def sample(method,record=false)
      if method=='pm' && @photon_map
        @photon_map.advance(record)
        @last_trace={method:'pm',events:@photon_map.inspection,number:@photon_map.launched,imageContribution:nil,seed:@seed} if record
        return {}
      end
      raise ArgumentError,'Unknown estimator' unless METHODS.include?(method)
      trace=record ? [] : nil
      raw=method=='lt' ? light_sample(@rngs[method],trace) : path_sample(method,@rngs[method],trace)
      values={}
      raw.each { |pixel,c| values[pixel]=method=='lt' ? c : scale(c,@pixels) }
      total=0.0
      values.each do |pixel,c|
        @sums[method][pixel]=rgb_add(@sums[method][pixel],c)
        total+=luminance(c)/@pixels
      end
      @counts[method]+=1;@positive[method]+=1 if total>0
      @image_sums[method]+=total;@squares[method]+=total*total
      @last_trace={method:method,events:trace,number:@counts[method],imageContribution:total,seed:@seed} if record
      values
    end
    def batch(count=256,selected='mis')
      count=count.to_i.clamp(1,2048)
      count.times do |i|
        METHODS.each { |m| sample(m,i==count-1 && m==selected) }
        sample('pm',i==count-1 && selected=='pm') if @photon_map
      end
      snapshot
    end
    def snapshot
      estimates=METHODS.to_h do |m|
        n=@counts[m];den=[n,1].max.to_f;mean=@image_sums[m]/den
        variance=n>1 ? [(@squares[m]-n*mean*mean)/(n-1),0.0].max : nil
        [m,{count:n,rays:@rays[m],image:@sums[m].map { |c| scale(c,1.0/den) },mean:mean,standardError:variance ? Math.sqrt(variance/n) : nil,positive:@positive[m],nonzeroFraction:@positive[m]/den}]
      end
      estimates['pm']=@photon_map.snapshot if @photon_map
      {version:VERSION,scene:@scene.description,methods:estimates,trace:@last_trace,bounces:@max_bounces,pixels:@pixels,seed:@seed}
    end
  end

  @engine=nil
  def dispatch(request)
    case request['action']
    when 'reset'
      @engine=Estimator.new(request.fetch('options',{})); @engine.snapshot
    when 'batch'
      raise 'Create a scene first' unless @engine
      @engine.batch(request.fetch('count',256),request.fetch('selected','mis'))
    when 'trace'
      raise 'Create a scene first' unless @engine
      @engine.sample(request.fetch('selected','mis'),true);@engine.snapshot
    else
      raise ArgumentError,'Unknown action'
    end
  end
  def dispatch_json(text); JSON.generate(dispatch(JSON.parse(text))); end
end
