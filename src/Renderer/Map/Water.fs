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
        // The mirrored scene at this pixel, rippled a little.
        vec2 ripple = vec2(sin(vWorld.x * 1.7 + uTime * 1.3), cos(vWorld.z * 1.5 + uTime * 1.1)) * 0.004;
        vec3 reflection = texture(uReflection, gl_FragCoord.xy / uScreen + ripple).rgb;
        // More mirror at a glancing angle, more water looking straight down.
        vec3 view = normalize(-vEye);
        float facing = clamp(abs(dot(view, uEyeNormal)), 0.0, 1.0);
        float fresnel = 0.15 + 0.75 * pow(1.0 - facing, 3.0);
        textureSample.rgb = mix(textureSample.rgb, reflection, fresnel * uReflect);
        // The sun on the surface.
        float sun = pow(max(dot(reflect(-normalize(uEyeSun), uEyeNormal), view), 0.0), 80.0);
        textureSample.rgb += uLightDiffuse * sun * 0.5 * uReflect;
        textureSample.a = mix(textureSample.a, 0.95, fresnel * uReflect);
    }

    fragColor   = textureSample;

    if (uFogUse) {
        float depth     = gl_FragCoord.z / gl_FragCoord.w;
        float fogFactor = smoothstep( uFogNear, uFogFar, depth );
        fragColor    = mix( fragColor, vec4( uFogColor, fragColor.w ), fogFactor );
    }
}