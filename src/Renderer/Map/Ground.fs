#version 300 es
precision highp float;

in vec2 vTextureCoord;
in vec2 vLightmapCoord;
in vec2 vTileColorCoord;
in float vLightWeighting;
in vec4 vShadow;
out vec4 fragColor;

uniform sampler2D uDiffuse;
uniform sampler2D uLightmap;
uniform sampler2D uTileColor;
uniform bool uLightMapUse;
uniform bool uPosterize;
uniform bool uGammaCorrection;

uniform bool  uFogUse;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uFogColor;

uniform vec3  uLightAmbient;
uniform vec3  uLightDiffuse;
uniform float uLightOpacity;
uniform vec3  uLightDirection;
uniform vec3 uLightEnv;

// Real-time shadows (Shadows.js), off when uShadow is 0.
uniform float uShadow;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;

// 0 lit .. 1 hidden from the sun, averaged over 3x3 texels for soft edges.
float shadowed() {
    vec3 p = vShadow.xyz / vShadow.w * 0.5 + 0.5;
    if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 0.0;
    float hidden = 0.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            float closest = texture(uShadowMap, p.xy + vec2(float(x), float(y)) * uShadowTexel).r;
            hidden += p.z - 0.0015 > closest ? 1.0 : 0.0;
        }
    }
    return hidden / 9.0;
}

vec3 posterize(vec3 c) {
    c *= 255.0;
    c = floor(c / 16.0) * 16.0;
    c /= 255.0;
    return c;
}

void main(void) {
    vec4 textureSample = texture(uDiffuse, vTextureCoord.st);
    if (textureSample.a < 0.1)
        discard;

    if (vTileColorCoord.st != vec2(0.0,0.0)) {
        textureSample    *= texture( uTileColor, vTileColorCoord.st);
    }

    float sun = vLightWeighting;
    vec3 color = (sun * uLightDiffuse + uLightAmbient);
    textureSample.rgb *= clamp(color, 0.0, 1.0);
    textureSample.rgb *= clamp(uLightEnv, 0.0, 1.0);

    if (uLightMapUse) {
        vec4 lightmap = texture( uLightmap, vLightmapCoord.st);
        if(uPosterize) {
            lightmap.rgb = posterize(lightmap.rgb);
        } else if(uGammaCorrection){
            lightmap.rgb = pow(lightmap.rgb, vec3(1.1));
        }
        textureSample.rgb *= lightmap.a;
        textureSample.rgb += clamp(lightmap.rgb, 0.0, 1.0);
    }

    // Real-time shadows darken the lit result. Taken off the sun's term
    // instead, they vanished wherever sun and ambient together pass 1.0 and
    // are clamped, which is most of the ground on most maps.
    if (uShadow > 0.0) textureSample.rgb *= 1.0 - shadowed() * uShadow * 0.6;

    fragColor = textureSample;

    if (uFogUse) {
        float depth     = gl_FragCoord.z / gl_FragCoord.w;
        float fogFactor = smoothstep( uFogNear, uFogFar, depth );
        fragColor    = mix( fragColor, vec4(uFogColor, fragColor.w), fogFactor );
    }

}