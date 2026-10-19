#version 300 es
precision highp float;

in vec3 aPosition;
in vec2 aTextureCoord;
in vec4 aColor;
in float aDepthOffset;

out vec2 vTextureCoord;
flat out vec4 vColor;

uniform mat4 uModelViewMat;
uniform mat4 uProjectionMat;

void main(void) {
	gl_Position = uProjectionMat * uModelViewMat * vec4(aPosition, 1.0);
	gl_Position.z -= aDepthOffset;
	vTextureCoord = aTextureCoord;
	vColor = aColor;
}
