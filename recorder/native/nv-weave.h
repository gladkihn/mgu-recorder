#ifndef OWNER_NV_WEAVE_H
#define OWNER_NV_WEAVE_H
#include <stdint.h>
#include <string.h>
#ifndef NV_MAX
#define NV_MAX (2*1024*1024)
#endif
typedef struct {unsigned char*data[2],*woven;uint32_t meta[2][10];unsigned have[2],pending[2];double pendingAt;int(*sink)(void*,const uint32_t*,const unsigned char*);void*context;} NVWeaver;
static void nvWeaveReset(NVWeaver*w){w->have[0]=w->have[1]=w->pending[0]=w->pending[1]=0;}
static int nvWeaveEmit(NVWeaver*w){if(!w->pending[0]&&!w->pending[1])return 0;unsigned current=w->pending[1]?1:0,other=1-current;const uint32_t*m=w->meta[current];unsigned h=m[5],stride=m[6];if(!w->have[other])other=current;uint32_t out[10];memcpy(out,m,40);uint64_t a,b;memcpy(&a,w->meta[current]+2,8);memcpy(&b,w->meta[other]+2,8);if(b>a)memcpy(out+2,&b,8);out[5]=h*2;out[0]=out[5]*stride;if(out[0]>NV_MAX)return -1;for(unsigned y=0;y<h;y++){memcpy(w->woven+(size_t)y*2*stride,w->data[w->have[0]?0:1]+(size_t)y*stride,stride);memcpy(w->woven+(size_t)(y*2+1)*stride,w->data[w->have[1]?1:0]+(size_t)y*stride,stride);}w->pending[0]=w->pending[1]=0;return w->sink(w->context,out,w->woven);}
static int nvWeaveIdle(NVWeaver*w,double now,int queued){return !queued&&(w->pending[0]||w->pending[1])&&now-w->pendingAt>20?nvWeaveEmit(w):0;}
static int nvWeaveField(NVWeaver*w,const uint32_t*m,const unsigned char*data,unsigned n,unsigned which,double now){if(which>1||m[5]*2>576||n>NV_MAX/2||n!=(uint64_t)m[5]*m[6])return -1;if(w->pending[which]&&nvWeaveEmit(w))return -1;if(w->have[1-which]&&(w->meta[1-which][4]!=m[4]||w->meta[1-which][5]!=m[5]||w->meta[1-which][6]!=m[6]||w->meta[1-which][7]!=m[7]))nvWeaveReset(w);memcpy(w->data[which],data,n);memcpy(w->meta[which],m,40);w->have[which]=w->pending[which]=1;w->pendingAt=now;return w->pending[0]&&w->pending[1]?nvWeaveEmit(w):0;}
#endif
