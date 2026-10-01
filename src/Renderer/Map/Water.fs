#version 300 es
precision highp float;

in vec2 vTextureCoord;
in vec3 vEye;
in vec3 vWorld;
out vec4 fragColor;

// Planar reflection (WaterReflection.js), off when uReflect is 0.
uniform float     uReflect;
uniform sampler2D uReflection;
uniform vec2      uScreen;
uniform float     uTime;
uniform vec3      uEyeNormal;
uniform vec3      uEyeSun;
// The scene's depth before the water (Water.js), to know how deep it is here.
uniform bool      uHasDepth;
uniform sampler2D uSceneDepth;
uniform vec2      uProj;   // projection[10], projection[14]
uniform float     uRain;   // 0 dry .. 1 pouring: rings where drops land

uniform sampler2D uDiffuse;

uniform bool  uFogUse;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uFogColor;

uniform vec3  uLightAmbient;
uniform vec3  uLightDiffuse;
uniform float uLightOpacity;

uniform float uOpacity;

void main(void) {
    
    vec4 textureSample = texture( uDiffuse,  vTextureCoord.st );
    textureSample.a = uOpacity;
    
    if (textureSample.a == 0.0) {
        discard;
    }
    
    textureSample.a *= uOpacity;

    if (uReflect > 0.0) {
        // Smooth, slow swell: a few long waves across the world, no texture.
        vec2 p = vWorld.xz;
        float t = uTime;
        vec2 swell = vec2(
            sin(p.x * 0.35 + p.y * 0.12 + t * 0.9) + 0.6 * sin(p.x * 0.9 - p.y * 0.55 + t * 1.7) + 0.3 * sin(p.y * 1.9 + t * 2.3),
            cos(p.y * 0.31 - p.x * 0.15 + t * 0.8) + 0.6 * cos(p.y * 0.85 + p.x * 0.6 + t * 1.5) + 0.3 * cos(p.x * 2.1 - t * 2.1));
        vec2 ripple = swell * 0.006;

        // Rain: expanding rings where drops land, a few per cell of a grid
        // in world space, each on its own clock.
        float rings = 0.0;
        vec2 ringSlope = vec2(0.0);
        if (uRain > 0.0) {
            for (int k = 0; k < 2; k++) {
                vec2 q = vWorld.xz * (k == 0 ? 0.3 : 0.45) + float(k) * 17.3;
                vec2 cell = floor(q);
                float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
                float life = fract(t * 0.9 + seed);
                vec2 centre = cell + 0.25 + 0.5 * vec2(fract(seed * 7.3), fract(seed * 13.1));
                vec2 d = q - centre;
                float dist = length(d);
                float radius = life * 0.5;
                float ring = exp(-pow((dist - radius) * 16.0, 2.0)) * (1.0 - life) * step(seed, uRain * 0.9);
                rings += ring;
                ringSlope += normalize(d + 1e-4) * ring;
            }
            ripple += ringSlope * 0.004;
        }

        // How much water the eye looks through here.
        float thick = 40.0;
        if (uHasDepth) {
            float zn = texture(uSceneDepth, gl_FragCoord.xy / uScreen).r * 2.0 - 1.0;
            float behind = uProj.y / (zn + uProj.x);
            thick = max(behind - (-vEye.z), 0.0);
        }
        float clear = exp(-thick * 0.9);            // 1 right at the shore .. 0 a little out

        // Mostly a mirror of what stands above it, darkened, with a deep
        // navy where nothing does; a teal see-through band at the shore.
        vec3 reflection = texture(uReflection, gl_FragCoord.xy / uScreen + ripple).rgb;
        // Water darkens and cools what it reflects; reflected sky reads as
        // deep navy, the way still water looks from above.
        float rl = dot(reflection, vec3(0.299, 0.587, 0.114));
        vec3 mirror = reflection * vec3(0.42, 0.56, 0.62);
        vec3 navy = vec3(0.03, 0.07, 0.15);
        mirror = mix(mirror, navy, smoothstep(0.6, 0.85, rl));
        mirror = mix(navy, mirror, smoothstep(0.0, 0.04, rl));  // nothing above: navy
        vec3 body = vec3(0.03, 0.16, 0.19) * clamp(uLightAmbient + uLightDiffuse, 0.4, 1.2);
        vec3 color = mix(mirror, body, 0.18);
        // Light scattered in the water near the rock: a broad teal glow
        // along the shore, the rock just visible through the narrowest band.
        float glow = exp(-thick * 0.12);
        color = mix(color, vec3(0.12, 0.42, 0.42), glow * 0.55);
        float alpha = mix(0.95, 0.55, clear);
        vec3 view = normalize(-vEye);
        vec3 n = normalize(uEyeNormal + vec3(swell.x, 0.0, swell.y) * 0.08);
        float sun = pow(max(dot(reflect(-normalize(uEyeSun), n), view), 0.0), 60.0);
        color += uLightDiffuse * sun * 0.35;
        color += vec3(0.4, 0.5, 0.55) * rings * 0.5 * uRain;
        color *= mix(1.0, 0.85, uRain);  // overcast
        // A line of light where it meets the shore.
        color += vec3(0.35, 0.45, 0.42) * smoothstep(0.8, 0.0, thick) * (0.7 + 0.3 * sin(t * 2.0 + vWorld.x + vWorld.z));
        textureSample = vec4(color, mix(textureSample.a, alpha, uReflect));
    }

    fragColor   = textureSample;

    if (uFogUse) {
        float depth     = gl_FragCoord.z / gl_FragCoord.w;
        float fogFactor = smoothstep( uFogNear, uFogFar, depth );
        fragColor    = mix( fragColor, vec4( uFogColor, fragColor.w ), fogFactor );
    }
}