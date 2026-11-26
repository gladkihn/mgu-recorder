#ifndef OWNER_PIXEL_OPS_H
#define OWNER_PIXEL_OPS_H
#include <emmintrin.h>
#include <smmintrin.h>
#include <cpuid.h>
#include <stdint.h>
#include <string.h>
/* SSE2 is part of x86-64. Read GPU mappings in vectors, never byte by byte. */
static void splitUV(const unsigned char*src,unsigned char*u,unsigned char*v,unsigned pairs){unsigned x=0;const __m128i mask=_mm_set1_epi16(255);for(;x+16<=pairs;x+=16){__m128i a=_mm_loadu_si128((const __m128i*)(src+x*2)),b=_mm_loadu_si128((const __m128i*)(src+x*2+16));_mm_storeu_si128((__m128i*)(u+x),_mm_packus_epi16(_mm_and_si128(a,mask),_mm_and_si128(b,mask)));_mm_storeu_si128((__m128i*)(v+x),_mm_packus_epi16(_mm_srli_epi16(a,8),_mm_srli_epi16(b,8)));}for(;x<pairs;x++){u[x]=src[x*2];v[x]=src[x*2+1];}}
static void packed422Luma(const unsigned char*src,unsigned char*dst,unsigned w,unsigned yo){unsigned x=0;const __m128i mask=_mm_set1_epi16(255);for(;x+16<=w;x+=16){__m128i a=_mm_loadu_si128((const __m128i*)(src+x*2)),b=_mm_loadu_si128((const __m128i*)(src+x*2+16));a=yo?_mm_srli_epi16(a,8):_mm_and_si128(a,mask);b=yo?_mm_srli_epi16(b,8):_mm_and_si128(b,mask);_mm_storeu_si128((__m128i*)(dst+x),_mm_packus_epi16(a,b));}for(;x<w;x++)dst[x]=src[x*2+yo];}
static void packed422Chroma(const unsigned char*a,const unsigned char*b,unsigned char*dst,unsigned w,unsigned uo){unsigned x=0;const __m128i mask=_mm_set1_epi16(255);for(;x+16<=w;x+=16){__m128i a0=_mm_loadu_si128((const __m128i*)(a+x*2)),a1=_mm_loadu_si128((const __m128i*)(a+x*2+16)),b0=_mm_loadu_si128((const __m128i*)(b+x*2)),b1=_mm_loadu_si128((const __m128i*)(b+x*2+16));a0=uo?_mm_srli_epi16(a0,8):_mm_and_si128(a0,mask);a1=uo?_mm_srli_epi16(a1,8):_mm_and_si128(a1,mask);b0=uo?_mm_srli_epi16(b0,8):_mm_and_si128(b0,mask);b1=uo?_mm_srli_epi16(b1,8):_mm_and_si128(b1,mask);_mm_storeu_si128((__m128i*)(dst+x),_mm_packus_epi16(_mm_srli_epi16(_mm_add_epi16(a0,b0),1),_mm_srli_epi16(_mm_add_epi16(a1,b1),1)));}for(;x<w;x++)dst[x]=((unsigned)a[x*2+uo]+b[x*2+uo])/2;}
/* MOVNTDQA is designed for CPU reads of uncached/write-combined GPU memory.
 * Keep SSE2 fallback for other CPUs or mappings whose row starts are unaligned. */
static int gpuStreamLoads(void){static int cached=-1;if(cached<0){unsigned a,b,c,d;cached=__get_cpuid(1,&a,&b,&c,&d)&&!!(c&bit_SSE4_1);}return cached;}
__attribute__((target("sse4.1"))) static void gpuCopyRowFast(unsigned char*dst,const unsigned char*src,unsigned n){unsigned x=0;for(;x+16<=n;x+=16)_mm_storeu_si128((__m128i*)(dst+x),_mm_stream_load_si128((__m128i*)(src+x)));if(x<n)memcpy(dst+x,src+x,n-x);}
__attribute__((target("sse4.1"))) static void gpuSplitUVFast(const unsigned char*src,unsigned char*u,unsigned char*v,unsigned pairs){unsigned x=0;const __m128i mask=_mm_set1_epi16(255);for(;x+16<=pairs;x+=16){__m128i a=_mm_stream_load_si128((__m128i*)(src+x*2)),b=_mm_stream_load_si128((__m128i*)(src+x*2+16));_mm_storeu_si128((__m128i*)(u+x),_mm_packus_epi16(_mm_and_si128(a,mask),_mm_and_si128(b,mask)));_mm_storeu_si128((__m128i*)(v+x),_mm_packus_epi16(_mm_srli_epi16(a,8),_mm_srli_epi16(b,8)));}for(;x<pairs;x++){u[x]=src[x*2];v[x]=src[x*2+1];}}
static void gpuCopyRow(unsigned char*dst,const unsigned char*src,unsigned n){if(gpuStreamLoads()&&!((uintptr_t)src&15))gpuCopyRowFast(dst,src,n);else memcpy(dst,src,n);}
static void gpuSplitUV(const unsigned char*src,unsigned char*u,unsigned char*v,unsigned pairs){if(gpuStreamLoads()&&!((uintptr_t)src&15))gpuSplitUVFast(src,u,v,pairs);else splitUV(src,u,v,pairs);}
#endif
