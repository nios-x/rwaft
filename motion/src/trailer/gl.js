/**
 * The trailer's WebGL layers. Every program is a full-screen pass whose output
 * depends only on its uniforms, and every uniform is computed from film time,
 * so a frame is still a pure function of t (and identical across workers).
 *
 *   wash      the dark studio of the cold open: black, an overhead spotlight, a floor sheen
 *   smoke     particle smoke: soft puffs (from smoke.js) eroded by noise into wisps,
 *             lit by the slope toward the light; premultiplied alpha
 *   mark      the rwaft mark as a real 3D object: a raymarched rounded tile with
 *             a chrome bevel, raised enamel log lines and a violet glass endpoint
 *   chrome    glossy black lettering from a text height map, extruded, with
 *             studio light sliding across faces and bevels
 *   arcs      glossy black chrome rings, each catching an iridescent streak
 *             (a port of "Chrome Arcs" by Louis Studios, driven by film time)
 *   gradient  soft colour pooling in the corners of black (a grain-gradient look)
 *   grain     film grain, blended over the frame with CSS `overlay`
 */

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`

const HEAD = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
`

/* Ashima Arts / Stefan Gustavson 3D simplex noise (MIT). */
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
	const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
	vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
	vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
	vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
	i=mod289(i);
	vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
	float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
	vec4 j=p-49.*floor(p*ns.z*ns.z);
	vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
	vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
	vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
	vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
	vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
	vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
	vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
	p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
	vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
	return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
vec3 toSRGB(vec3 c){ return pow(max(c,0.), vec3(1./2.2)); }
`

/* ── Programs ─────────────────────────────────────────────────────────── */

const WASH = `${HEAD}${NOISE}
uniform float u_exposure;
uniform vec2 u_spot;     // the overhead light's centre (uv)
void main(){
	vec2 asp = vec2(u_res.x/u_res.y, 1.);
	vec2 p = (v_uv - .5) * asp;
	float n = fbm(vec3(p*1.3, u_time*.06))*.5 + .5;
	vec2 s = (v_uv - u_spot)*asp*vec2(.85,1.25);
	float cone = exp(-dot(s, s)*2.6);
	float pool = exp(-pow((v_uv.y - .2)/.11, 2.)) * exp(-pow(p.x/.62, 2.));
	vec3 col = vec3(.0007,.0007,.0009) + vec3(.0062,.0064,.0072)*cone*(.75 + .5*n) + vec3(.0045)*pool;
	o = vec4(toSRGB(col*u_exposure), 1.);
}`

const SMOKE = `${HEAD}${NOISE}
uniform vec4 u_puffs[40];  // xy: centre (uv x·aspect, y up), z: radius, w: opacity
uniform vec2 u_light;      // light position (uv)
uniform vec3 u_lit;
uniform vec3 u_shade;
uniform float u_alpha;
uniform float u_seed;
uniform float u_glow;      // how strongly smoke near the light blooms
uniform float u_opaque;    // 1: write an opaque background (black under the smoke)
uniform float u_density;
uniform float u_erode;     // how much noise eats into the puffs
uniform float u_detail;    // noise frequency
uniform vec2 u_flow;       // drift of the noise (the smoke's churn)
uniform vec4 u_back;       // opaque only: a soft backlight behind everything (xy uv, z radius, w intensity)
float blobs(vec2 q){
	float s=0.;
	for(int i=0;i<40;i++){
		vec4 P=u_puffs[i];
		if (P.w<=0.) continue;
		vec2 d=q-P.xy;
		s+=P.w*exp(-dot(d,d)/(P.z*P.z));
	}
	return s;
}
float erosion(vec2 q, float t){
	vec3 r=vec3(q*u_detail - u_flow*t*u_detail, t*.16 + u_seed);
	vec2 w=vec2(snoise(r*.4), snoise(r*.4 + vec3(4.1,2.3,1.7)))*.28;
	return fbm(r + vec3(w, 0.))*.5 + .5;
}
float dens(vec2 q, float t){
	return blobs(q)*(1. - u_erode + u_erode*1.7*erosion(q, t));
}
void main(){
	vec2 asp=vec2(u_res.x/u_res.y, 1.);
	vec2 q=v_uv*asp;
	float t=u_time;
	// overlapping puffs pile up far past 1: compress, so thick smoke is soft inside
	float d=1. - exp(-dens(q, t)*.9);
	float a0=clamp(smoothstep(.12,.62,d)*u_density, 0., 1.);
	vec2 bq=(v_uv-u_back.xy)*asp;
	vec3 back=vec3(u_back.w*exp(-dot(bq,bq)/max(u_back.z*u_back.z, 1e-4)));
	if (a0<.003){ o=u_opaque>.5 ? vec4(toSRGB(back),1.) : vec4(0.); return; }
	// lit where the smoke thins toward the light: bright tops, shaded bellies
	vec2 L=u_light*asp - q;
	vec2 Ld=normalize(L+1e-4);
	float dl=1. - exp(-dens(q + Ld*.04, t)*.9);
	float lit=clamp(.55 + (d - dl)*5., 0., 1.);
	float core=smoothstep(.75, .99, d);
	float near=exp(-length(L)*1.2);
	vec3 col=mix(u_shade, u_lit, lit*(1. - .4*core));
	col*=.42 + u_glow*near*.6;
	col+=u_lit*a0*(1.-a0)*near*u_glow*.3;
	float a=a0*u_alpha;
	if (u_opaque>.5) o=vec4(toSRGB(col*a + back*(1.-a)), 1.);
	else o=vec4(toSRGB(col)*a, a);
}`

const MARK = `${HEAD}${NOISE}
uniform mat3 u_rot;
uniform vec3 u_pos;
uniform float u_size;
uniform float u_fov;
uniform float u_camZ;
uniform float u_exposure;
uniform float u_dot;
uniform float u_rim;
uniform float u_white;
uniform float u_envSpin;

float sdRoundRect(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
float sdCap(vec2 p, vec2 a, vec2 b, float r){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h)-r; }
float lines2(vec2 p){
	float r=.078;
	float d=sdCap(p, vec2(-.548,.326), vec2(-.074,.326), r);
	d=min(d, sdCap(p, vec2(-.548,0.), vec2(.111,0.), r));
	return min(d, sdCap(p, vec2(-.548,-.326), vec2(-.148,-.326), r));
}
const float HZ=.16;
float sdBody(vec3 p){
	float e=.055;
	float d2=sdRoundRect(p.xy, vec2(1.), .59);
	vec2 w=vec2(d2+e, abs(p.z)-HZ+e);
	return min(max(w.x,w.y),0.)+length(max(w,0.))-e;
}
float sdInlay(vec3 p){
	float top=HZ+.028, zc=top*.5, hz=top*.5, e=.014;
	vec2 w=vec2(lines2(p.xy)+e, abs(p.z-zc)-hz+e);
	return min(max(w.x,w.y),0.)+length(max(w,0.))-e;
}
vec2 map(vec3 pw){
	vec3 p=transpose(u_rot)*(pw-u_pos)/u_size;
	float a=sdBody(p), b=sdInlay(p);
	return a<b ? vec2(a*u_size,0.) : vec2(b*u_size,1.);
}
vec3 nrm(vec3 p){
	const vec2 k=vec2(1,-1); float e=.0008*u_size;
	return normalize(k.xyy*map(p+k.xyy*e).x+k.yyx*map(p+k.yyx*e).x+k.yxy*map(p+k.yxy*e).x+k.xxx*map(p+k.xxx*e).x);
}
vec3 env(vec3 d){
	float c0=cos(u_envSpin), s0=sin(u_envSpin);
	d.xz=mat2(c0,-s0,s0,c0)*d.xz;
	float up=d.y;
	vec3 c=vec3(.004,.004,.005);
	// one tight overhead softbox: the black face shows it as a gradient, not a grey wash
	c+=vec3(1.)*3.*smoothstep(.9,.985,up)*smoothstep(.45,.12,abs(d.x));
	c+=vec3(.9,.9,.92)*1.6*smoothstep(.06,.0,abs(abs(d.x)-.74))*smoothstep(-.35,.25,up);
	c+=vec3(.82,.83,.86)*u_rim*smoothstep(.55,.95,-d.z)*smoothstep(.45,-.05,abs(up-.08));
	c+=vec3(.1,.1,.11)*.4*smoothstep(-.05,-.65,up);
	c+=vec3(1.)*.45*exp(-pow((up-.02)/.03,2.));
	return c;
}
vec3 shade(vec3 p, vec3 rd, float id){
	vec3 n=nrm(p); vec3 v=-rd; vec3 r=reflect(rd,n);
	vec3 po=transpose(u_rot)*(p-u_pos)/u_size;
	vec3 no=transpose(u_rot)*n;
	float ndv=max(dot(n,v),0.);
	float fres=pow(1.-ndv,5.);
	vec3 key=normalize(vec3(-.45,.85,.55));
	float dif=max(dot(n,key),0.);
	vec3 refl=env(r);
	if (id>.5) {
		vec3 enamel=mix(vec3(.94,.94,.96), vec3(.02), u_white);
		return enamel*(.18+.82*dif)*.9 + refl*mix(.05,1.,fres)*.55;
	}
	float top=smoothstep(.9,.98,no.z);
	float metal=1.-top;
	vec3 body=mix(vec3(.012,.012,.016), vec3(.9,.9,.92), u_white);
	vec3 col=body*(.2+.8*dif)*.7 + refl*mix(.045,1.,fres);
	vec3 chrome=refl*vec3(.88,.88,.9)*(.55+.45*dif) + vec3(.02);
	col=mix(col, chrome, metal);
	float dd=length(po.xy-vec2(.422,0.))-.193;
	float isDot=top*(1.-smoothstep(-.006,.006,dd));
	float halo=top*exp(-max(dd,0.)*18.)*(1.-isDot);
	vec3 violet=vec3(.545,.447,1.);
	float core=1.-smoothstep(0.,.193,length(po.xy-vec2(.422,0.)));
	vec3 glass=violet*u_dot*(.9+1.6*core*core) + refl*.25*fres + vec3(1.)*pow(core,8.)*u_dot*.6;
	col=mix(col, glass, isDot);
	col+=violet*halo*u_dot*.35;
	return col;
}
void main(){
	float asp=u_res.x/u_res.y;
	vec2 s=(v_uv-.5)*vec2(asp,1.)*2.*u_fov;
	vec3 ro=vec3(0.,0.,u_camZ);
	vec3 rd=normalize(vec3(s,-1.));
	// bounding sphere
	vec3 oc=ro-u_pos; float bR=1.75*u_size;
	float bb=dot(oc,rd), cc=dot(oc,oc)-bR*bR, disc=bb*bb-cc;
	if (disc<0.) { o=vec4(0.); return; }
	float t=max(-bb-sqrt(disc),0.), tEnd=-bb+sqrt(disc);
	float minD=1e9, tMin=t, idMin=0.; bool hit=false; float id=0.;
	for (int i=0;i<110;i++){
		vec2 m=map(ro+rd*t);
		if (m.x<minD){ minD=m.x; tMin=t; idMin=m.y; }
		if (m.x<.00025*t){ hit=true; id=m.y; break; }
		t+=m.x*.9;
		if (t>tEnd) break;
	}
	float pix=t*2.*u_fov/u_res.y;
	float cov=hit ? 1. : 1.-smoothstep(0., pix*1.25, minD);
	if (cov<=0.) { o=vec4(0.); return; }
	vec3 p=ro+rd*(hit ? t : tMin);
	vec3 col=shade(p, rd, hit ? id : idMin);
	col=aces(col*u_exposure);
	o=vec4(toSRGB(col)*cov, cov);
}`

const CHROME = `${HEAD}${NOISE}
uniform sampler2D u_mask;
uniform sampler2D u_h1;
uniform sampler2D u_h2;
uniform vec2 u_texel;
uniform vec4 u_rect;
uniform float u_sweep;
uniform vec2 u_ext;
uniform float u_alpha;
uniform float u_relief;
// a black studio: one wide overhead softbox and a thin horizon strip, nothing else
vec3 envB(vec3 r){
	vec3 c=vec3(.002);
	c+=vec3(1.)*1.6*smoothstep(.25,.55,r.y);
	c+=vec3(1.)*.7*exp(-pow((r.y-.04)/.05,2.));
	c+=vec3(1.)*.25*smoothstep(.3,.8,r.x)*smoothstep(-.3,.2,r.y);
	return c;
}
void main(){
	vec2 tuv=(v_uv-u_rect.xy)/(u_rect.zw-u_rect.xy);
	if (tuv.x<-.05||tuv.x>1.05||tuv.y<-.3||tuv.y>1.05){ o=vec4(0.); return; }
	float m=texture(u_mask,tuv).r;
	// extrusion: walls behind the face
	float wall=0.; float wd=0.;
	for (int i=1;i<=64;i++){
		float s=texture(u_mask, tuv + u_ext*float(i)/64.).r;
		if (s>.02 && wall<.98){ float add=s*(1.-wall); wd+=add*float(i)/64.; wall+=add; }
	}
	wd/=max(wall,1e-4);
	wall*=(1.-m);
	// a narrow rounded bevel; inside it the face is perfectly flat
	float hx=(texture(u_h1,tuv+vec2(u_texel.x,0)).r-texture(u_h1,tuv-vec2(u_texel.x,0)).r)*.6
		+(texture(u_h2,tuv+vec2(u_texel.x,0)).r-texture(u_h2,tuv-vec2(u_texel.x,0)).r)*.4;
	float hy=(texture(u_h1,tuv+vec2(0,u_texel.y)).r-texture(u_h1,tuv-vec2(0,u_texel.y)).r)*.6
		+(texture(u_h2,tuv+vec2(0,u_texel.y)).r-texture(u_h2,tuv-vec2(0,u_texel.y)).r)*.4;
	float inner=smoothstep(.985,.999,texture(u_h2,tuv).r);
	vec2 g=vec2(hx,hy)*u_relief*(1.-inner);
	vec3 n=normalize(vec3(-g, 1.));
	vec3 r=reflect(vec3(0.,0.,-1.), n);
	float slope=clamp(length(g)*1.2, 0., 1.);
	// the flat face: black lacquer reflecting a soft gradient and one moving strip light
	float band=tuv.x*1.05 + tuv.y*.32 - u_sweep;
	vec3 face=vec3(.0025) + vec3(1.)*(.011*smoothstep(-.1,1.1,tuv.y) + .006*smoothstep(.6,1.,tuv.x));
	face+=vec3(1.)*(.8*exp(-pow(band/.014,2.)) + .07*exp(-pow(band/.07,2.)));
	// the bevel: polished, it shows the studio crisply
	float F=.12 + .88*pow(slope, 1.5);
	vec3 bevel=vec3(.01) + envB(r)*F + vec3(1.)*1.4*exp(-pow(band/.02,2.))*slope;
	face=mix(face, bevel, smoothstep(.04,.35,slope));
	// the extrusion: near black, a fine lit lip where it meets the face
	vec3 side=vec3(.002) + vec3(.36)*exp(-wd*40.) + vec3(.018)*(1.-wd);
	side+=vec3(1.)*.4*exp(-pow(band/.035,2.))*(1.-wd);
	float cover=clamp(m+wall,0.,1.);
	vec3 col=(face*m + side*wall)/max(m+wall,1e-4);
	float a=cover*u_alpha;
	o=vec4(toSRGB(aces(col))*a, a);
}`

/*
 * Chrome Arcs by Louis Studios (studios.lou15.com), ported: glossy black rings
 * about a centre far off to the lower right, each with an iridescent streak.
 * The flow and sway come from film time instead of a wall clock.
 */
const ARCS = `${HEAD}
uniform vec4 u_view;    // view centre (reference px), zoom, ring density
uniform vec3 u_motion;  // outward flow (rings, 0..1), light shift (reference px), streak intensity
uniform mat3 u_tint;
uniform float u_seed;
uniform float u_fade;
const vec2 C = vec2(3777.39, 2674.21);
const float R0 = 6657.9;
const float D1 = 2264.66;
const float LNQ = 0.0670042;
float sq(float x) { return x * x; }
const float CORE = 0.24;
const vec2 TAIL_R = vec2(0.40033, 0.33513);
const vec2 TAIL_G = vec2(0.38067, 0.32096);
const vec2 TAIL_B = vec2(0.35736, 0.32278);
const float BLOOM = 2.2;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float nudge(vec2 p) {
	vec2 q = clamp(p, vec2(0.0), vec2(1179.0, 1967.0)) / 1000.0 - vec2(0.6, 1.0);
	float X = q.x, Y = q.y;
	return -0.01066 + Y * (-0.0588 + Y * (0.02479 + Y * 0.12054))
		+ X * (0.00943 + Y * (0.08212 + Y * 0.05649)) + X * X * (0.06149 - 0.00377 * Y) - 0.01411 * X * X * X;
}
float envelope(vec2 q, float a, float bx, float by, float bxx, float byy, float bxy, float cap) {
	return exp(min(a + bx * q.x + by * q.y + bxx * q.x * q.x + byy * q.y * q.y + bxy * q.x * q.y, cap));
}
vec2 meet(float ra, float x0, float sx) {
	float A = x0 - 1000.0 * sx - C.x;
	float a = sx * sx + 1.0, b = 2.0 * (A * sx - C.y), c = A * A + C.y * C.y - ra * ra;
	float y = (-b - sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
	return vec2(atan(y - C.y, x0 + sx * (y - 1000.0) - C.x), y);
}
float radius(float k) { return R0 - D1 * exp(LNQ * (k - 1.0)); }
float lobe(float d, float outer, float inner) {
	return 1.0 * exp(-sq(d / CORE)) + 0.31106 * exp(-abs(d) / (d > 0.0 ? outer : inner));
}
vec3 sheen(float phi) {
	return vec3(
		16.614 * lobe(phi - 0.11247, TAIL_R.x, TAIL_R.y),
		16.018 * lobe(phi + 0.040111, TAIL_G.x, TAIL_G.y),
		16.169 * lobe(phi + 0.17831, TAIL_B.x, TAIL_B.y));
}
vec3 band(float kp, float t, float th, float r, float w, float aa, vec4 env) {
	float m = u_view.w, flow = u_motion.x;
	float kc = 4.5 + (kp + 0.5 - flow - 4.5) / m;
	float crest = 0.46263 + 0.070742 * (kc - 4.0) - 0.0040818 * (degrees(th) + 150.0);
	float spread = t < crest ? max(0.38553 - 0.071703 * (kc - 4.0), 0.03) : 0.12301;
	vec3 col = vec3(env.x * exp(-sq((t - crest) / spread)));
	col += env.y * exp(-sq((1.0 - t) / 0.16965)) * vec3(0.55, 0.7, 1.0);
	float t0 = 0.26151 + 0.032207 * (kc - 4.5);
	float ta = meet(radius(4.5 + (kp + t0 - flow - 4.5) / m), 536.54 + u_motion.y, 0.014062).x;
	float u = (th - ta) * r / w;
	float dt = t - t0;
	float bend = dt < 0.0 ? 8.3036 : 3.5178 - 0.021064 * (kc - 4.5);
	float phi = (-u + bend * dt * dt - 0.37954) * (1.0471 - 0.14429 * (kc - 4.5));
	col += u_tint * sheen(phi) * env.w;
	col += BLOOM * env.w * exp(-sq((phi - 0.12) / 0.42) - sq(dt / 0.2)) * vec3(1.0, 0.9, 0.78);
	float rw = sqrt(0.000144 + aa * aa * 0.35);
	float prof = 0.012 / rw * exp(-sq(t / rw));
	if (prof > 1e-4) {
		float rk = radius(4.5 + (kp - flow - 4.5) / m);
		vec2 g = meet(rk, 613.43 + u_motion.y, 0.0);
		float s = (th - g.x) * rk;
		float hl = max(137.51 + 0.37297 * (g.y - 1000.0), 10.0);
		float o1 = -s - hl, i1 = s - hl;
		vec3 glint = exp(-max(max(vec3(o1 - 20.938, o1, o1 + 31.302), vec3(i1 + 20.938, i1, i1 - 31.302)), 0.0) / 76.225);
		col += prof * (vec3(env.z) + u_tint * (25.0 * env.w * glint));
	}
	return col;
}
vec3 encode(vec3 c) {
	c = clamp(c, 0.0, 1.0);
	return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
	vec2 fc = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
	float refPx = 1179.0 * sqrt(u_res.x / u_res.y) / u_res.x / u_view.z;
	vec2 p = u_view.xy + (fc - 0.5 * u_res) * refPx;
	vec2 d = p - C;
	float r = length(d);
	float th = atan(d.y, d.x);
	float gap = max(R0 - r, 1.0);
	float m = u_view.w;
	float K = 4.5 + (1.0 + log(gap / D1) / LNQ + nudge(p) - 4.5) * m + u_motion.x;
	float w = gap * LNQ / m;
	float aa = refPx / w;
	vec2 q = clamp(p, vec2(0.0), vec2(1179.0, 1967.0)) / 1000.0 - vec2(0.6, 1.0);
	float body = envelope(q, -3.7092, 2.4996, -4.3156, -4.975, -1.6414, 0.77581, 0.5);
	vec4 env = vec4(
		body,
		min(sqrt(body) * exp(-2.9914), 1.65),
		envelope(q, -9.7404, 26.18, -13.223, -19.901, -6.2186, 16.602, 1.0),
		envelope(q, -1.8032, -1.5862, -0.34234, -12.467, -1.9718, 7.467, 1.0) * u_motion.z
	);
	float kp = floor(K);
	float t = K - kp;
	vec3 col = band(kp, t, th, r, w, aa, env);
	if (t < aa * 0.5) col = mix(band(kp - 1.0, t + 1.0, th, r, w, aa, env), col, 0.5 + t / aa);
	else if (t > 1.0 - aa * 0.5) col = mix(band(kp + 1.0, t - 1.0, th, r, w, aa, env), col, 0.5 + (1.0 - t) / aa);
	col = encode(1.0 - exp(-col * 0.69504));
	col += (hash(fc + u_seed) - 0.5) * (3.0 / 255.0);
	o = vec4(clamp(col, 0.0, 1.0) * u_fade, 1.0);
}`

const GRADIENT = `${HEAD}${NOISE}
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_int;
uniform float u_soft;
void main(){
	vec2 asp=vec2(u_res.x/u_res.y, 1.);
	vec2 p=(v_uv-.5)*asp;
	float t=u_time*.35;
	vec2 q=p + vec2(fbm(vec3(p*1.4, t)), fbm(vec3(p*1.4+3.7, t+1.)))*.18;
	vec2 a1=vec2(-.95,.52)+.08*vec2(sin(t*1.3),cos(t));
	vec2 a2=vec2(.95,-.52)+.08*vec2(cos(t*1.1),sin(t*1.4));
	vec2 a3=vec2(.92,.56)+.1*vec2(sin(t*.9+2.),cos(t*1.2));
	float s=u_soft*1.15;
	float k1=exp(-dot(q-a1,q-a1)/(s*s*.55));
	float k2=exp(-dot(q-a2,q-a2)/(s*s*.6));
	float k3=exp(-dot(q-a3,q-a3)/(s*s*.4));
	vec3 col=(u_c1*k1 + u_c2*k2 + u_c3*k3)*u_int;
	o=vec4(toSRGB(col), 1.);
}`

const GRAIN = `${HEAD}
uniform float u_frame;
uniform float u_amount;
uniform float u_px;
float hash(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
void main(){
	vec2 c=floor(gl_FragCoord.xy/u_px);
	float g=(hash(vec3(c,u_frame))+hash(vec3(c+17.,u_frame+3.)))*.5;
	o=vec4(vec3(.5+(g-.5)*u_amount),1.);
}`

const SOURCES = { wash: WASH, smoke: SMOKE, mark: MARK, chrome: CHROME, arcs: ARCS, gradient: GRADIENT, grain: GRAIN }

/* ── The context wrapper ──────────────────────────────────────────────── */

export function createGL(canvas, { names, dpr }) {
	const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false })
	if (!gl) throw new Error("WebGL2 unavailable")
	canvas.width = Math.round(1920 * dpr)
	canvas.height = Math.round(1080 * dpr)
	gl.viewport(0, 0, canvas.width, canvas.height)

	const buffer = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

	const compile = (type, src) => {
		const shader = gl.createShader(type)
		gl.shaderSource(shader, src)
		gl.compileShader(shader)
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
		return shader
	}
	const vert = compile(gl.VERTEX_SHADER, VERT)
	const programs = {}
	for (const name of names) {
		const program = gl.createProgram()
		gl.attachShader(program, vert)
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, SOURCES[name]))
		gl.bindAttribLocation(program, 0, "a_pos")
		gl.linkProgram(program)
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(program)}`)
		const uniforms = {}
		const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
		for (let i = 0; i < count; i++) {
			const info = gl.getActiveUniform(program, i)
			uniforms[info.name] = { loc: gl.getUniformLocation(program, info.name), type: info.type }
		}
		programs[name] = { program, uniforms }
	}
	gl.enableVertexAttribArray(0)
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

	/** Uploads a 2D canvas as a texture (flipped so v=0 is the bottom, like v_uv). */
	const texture = (source) => {
		const tex = gl.createTexture()
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		return { tex, width: source.width, height: source.height }
	}

	let dirty = true
	return {
		canvas,
		texture,
		/** Starts a frame: opaque black, transparent, or nothing at all (returns false if already clear). */
		begin(clear) {
			if (clear === "none" && !dirty) return false
			gl.disable(gl.BLEND)
			if (clear === "black") gl.clearColor(0, 0, 0, 1)
			else gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)
			dirty = clear !== "none"
			return true
		},
		draw(name, values, { blend = true } = {}) {
			const { program, uniforms } = programs[name]
			gl.useProgram(program)
			if (blend) {
				gl.enable(gl.BLEND)
				gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
			} else gl.disable(gl.BLEND)
			const all = { u_res: [canvas.width, canvas.height], ...values }
			let unit = 0
			for (const key in all) {
				const u = uniforms[key] ?? uniforms[`${key}[0]`]
				if (!u) continue
				const v = all[key]
				if (v && v.length > 9 && v.length % 4 === 0) gl.uniform4fv(u.loc, v)
				else if (v && v.tex) {
					gl.activeTexture(gl.TEXTURE0 + unit)
					gl.bindTexture(gl.TEXTURE_2D, v.tex)
					gl.uniform1i(u.loc, unit++)
				} else if (typeof v === "number") gl.uniform1f(u.loc, v)
				else if (v.length === 2) gl.uniform2fv(u.loc, v)
				else if (v.length === 3) gl.uniform3fv(u.loc, v)
				else if (v.length === 4) gl.uniform4fv(u.loc, v)
				else if (v.length === 9) gl.uniformMatrix3fv(u.loc, false, v)
			}
			gl.drawArrays(gl.TRIANGLES, 0, 3)
			dirty = true
		},
		finish() {
			gl.flush()
		},
	}
}

/** Rotation matrix (column-major, for uniformMatrix3fv) from Euler angles in degrees: X, then Y, then Z. */
export function rotation(xDeg, yDeg, zDeg = 0) {
	const r = Math.PI / 180
	const [cx, sx, cy, sy, cz, sz] = [Math.cos(xDeg * r), Math.sin(xDeg * r), Math.cos(yDeg * r), Math.sin(yDeg * r), Math.cos(zDeg * r), Math.sin(zDeg * r)]
	// R = Rz · Ry · Rx
	const m = [
		[cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
		[sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
		[-sy, cy * sx, cy * cx],
	]
	return [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]]
}

/**
 * Draws text into three canvases for the lettering shader: a sharp mask and two
 * blurred copies whose blend is the bevel's height profile.
 */
export function textMaps(text, { width, height, font, size, stretch = 1, tracking = 0, blur = [6, 22], fill = 0.94 }) {
	const probe = document.createElement("canvas").getContext("2d")
	probe.font = font
	if ("letterSpacing" in probe) probe.letterSpacing = `${tracking}px`
	const measured = probe.measureText(text).width
	const fit = Math.min((width * fill) / (measured * stretch), (height * 0.86) / size)
	const make = (radius) => {
		const c = document.createElement("canvas")
		c.width = width
		c.height = height
		const ctx = c.getContext("2d")
		ctx.fillStyle = "#000"
		ctx.fillRect(0, 0, width, height)
		ctx.filter = radius ? `blur(${radius}px)` : "none"
		ctx.fillStyle = "#fff"
		ctx.font = font
		ctx.textBaseline = "middle"
		ctx.textAlign = "center"
		if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`
		ctx.save()
		ctx.translate(width / 2, height / 2 + size * fit * 0.04)
		ctx.scale(stretch * fit, fit)
		ctx.fillText(text, 0, 0)
		ctx.strokeStyle = "#fff"
		ctx.lineWidth = 2.5 / fit
		ctx.lineJoin = "round"
		ctx.strokeText(text, 0, 0)
		ctx.restore()
		return c
	}
	return { mask: make(0), h1: make(blur[0]), h2: make(blur[1]) }
}
