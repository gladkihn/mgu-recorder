#ifndef OWNER_GPU_COMMON_H
#define OWNER_GPU_COMMON_H
#define _GNU_SOURCE
#define MFX_VERSION 1024
#include "intel/mfxvideo.h"
#include "intel/va-image-abi.h"
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <dlfcn.h>
#include <signal.h>
#include <sys/prctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <stdatomic.h>
#include <errno.h>
#define MAX_AU (2*1024*1024)
#define LOAD(n) static __typeof__(&n) p##n
LOAD(MFXInit);LOAD(MFXClose);LOAD(MFXQueryIMPL);LOAD(MFXVideoCORE_SetHandle);LOAD(MFXVideoCORE_SetFrameAllocator);LOAD(MFXVideoCORE_SyncOperation);
LOAD(MFXVideoENCODE_Query);LOAD(MFXVideoENCODE_Init);LOAD(MFXVideoENCODE_Close);LOAD(MFXVideoENCODE_EncodeFrameAsync);
LOAD(MFXVideoDECODE_GetVideoParam);LOAD(MFXVideoDECODE_DecodeHeader);LOAD(MFXVideoDECODE_QueryIOSurf);LOAD(MFXVideoDECODE_Init);LOAD(MFXVideoDECODE_Close);LOAD(MFXVideoDECODE_DecodeFrameAsync);
LOAD(MFXVideoVPP_Query);LOAD(MFXVideoVPP_Init);LOAD(MFXVideoVPP_Close);LOAD(MFXVideoVPP_RunFrameVPPAsync);
#undef LOAD
static void *va;static int drm=-1;static int(*terminateDisplay)(void*);
static int(*createSurfaces)(void*,unsigned,unsigned,unsigned,unsigned*,unsigned,void*,unsigned);
static int(*destroySurfaces)(void*,unsigned*,int);
static int(*deriveImage)(void*,unsigned,VAImage*);static int(*destroyImage)(void*,unsigned);
static int(*mapBuffer)(void*,unsigned,void**);static int(*unmapBuffer)(void*,unsigned);static int(*syncSurface)(void*,unsigned);
static int exactRead(void*b,size_t n){size_t at=0;while(at<n){ssize_t x=read(0,(char*)b+at,n-at);if(x<0&&errno==EINTR)continue;if(x<=0)return at?-1:0;at+=(size_t)x;}return 1;}
static int exactWrite(const void*b,size_t n){size_t at=0;while(at<n){ssize_t x=write(1,(const char*)b+at,n-at);if(x<0&&errno==EINTR)continue;if(x<=0)return -1;at+=(size_t)x;}return 0;}
static int status(mfxStatus s,const char*w){if(s<0||s==MFX_WRN_PARTIAL_ACCELERATION){fprintf(stderr,"%s: %d\n",w,s);return -1;}return 0;}
static mfxFrameAllocResponse cache={0};static unsigned cacheW,cacheH;static int refs=0;
static mfxStatus allocVideo(mfxHDL u,mfxFrameAllocRequest*r,mfxFrameAllocResponse*out){(void)u;int reuse=(r->Type&MFX_MEMTYPE_FROM_DECODE)&&(r->Type&MFX_MEMTYPE_EXTERNAL_FRAME);if(reuse&&cache.mids){if(cacheW!=r->Info.Width||cacheH!=r->Info.Height||cache.NumFrameActual<r->NumFrameMin)return MFX_ERR_MEMORY_ALLOC;*out=cache;refs++;return 0;}unsigned n=r->NumFrameSuggested;if(!n||n>64||r->Info.Width>2048||r->Info.Height>1088||r->Info.FourCC!=MFX_FOURCC_NV12)return MFX_ERR_UNSUPPORTED;unsigned*ids=calloc(n,sizeof(*ids));mfxMemId*mids=calloc(n,sizeof(*mids));if(!ids||!mids){free(ids);free(mids);return MFX_ERR_MEMORY_ALLOC;}if(createSurfaces(va,1,r->Info.Width,r->Info.Height,ids,n,NULL,0)){free(ids);free(mids);return MFX_ERR_MEMORY_ALLOC;}memset(out,0,sizeof(*out));for(unsigned i=0;i<n;i++)mids[i]=&ids[i];out->mids=mids;out->NumFrameActual=n;if(reuse){cache=*out;cacheW=r->Info.Width;cacheH=r->Info.Height;refs=1;}return 0;}
static mfxStatus freeVideo(mfxHDL u,mfxFrameAllocResponse*r){(void)u;if(!r->mids)return 0;if(r->mids==cache.mids&&--refs>0)return 0;destroySurfaces(va,r->mids[0],r->NumFrameActual);free(r->mids[0]);free(r->mids);if(r->mids==cache.mids)cache.mids=NULL;r->mids=NULL;return 0;}
static mfxStatus lockVideo(mfxHDL u,mfxMemId m,mfxFrameData*d){(void)u;(void)m;(void)d;return MFX_ERR_UNSUPPORTED;}
static mfxStatus unlockVideo(mfxHDL u,mfxMemId m,mfxFrameData*d){(void)u;(void)m;(void)d;return 0;}
static mfxStatus handleVideo(mfxHDL u,mfxMemId m,mfxHDL*h){(void)u;*h=m;return 0;}
static int gpuInit(mfxSession *session,int videoMemory){pid_t parent=getppid();if(prctl(PR_SET_PDEATHSIG,SIGKILL)||parent==1||getppid()!=parent)return -1;signal(SIGPIPE,SIG_IGN);void*v=dlopen("libva.so.1",RTLD_NOW|RTLD_GLOBAL),*d=dlopen("libva-drm.so.1",RTLD_NOW|RTLD_GLOBAL),*m=dlopen("libmfxhw64.so",RTLD_NOW|RTLD_LOCAL);if(!v||!d||!m){fprintf(stderr,"GPU_LIBRARIES %s\n",dlerror());return -1;}
#define LOAD(n) p##n=dlsym(m,#n);if(!p##n){fprintf(stderr,"GPU_SYMBOL "#n"\n");return -1;}
LOAD(MFXInit);LOAD(MFXClose);LOAD(MFXQueryIMPL);LOAD(MFXVideoCORE_SetHandle);LOAD(MFXVideoCORE_SetFrameAllocator);LOAD(MFXVideoCORE_SyncOperation);LOAD(MFXVideoENCODE_Query);LOAD(MFXVideoENCODE_Init);LOAD(MFXVideoENCODE_Close);LOAD(MFXVideoENCODE_EncodeFrameAsync);LOAD(MFXVideoDECODE_GetVideoParam);LOAD(MFXVideoDECODE_DecodeHeader);LOAD(MFXVideoDECODE_QueryIOSurf);LOAD(MFXVideoDECODE_Init);LOAD(MFXVideoDECODE_Close);LOAD(MFXVideoDECODE_DecodeFrameAsync);LOAD(MFXVideoVPP_Query);LOAD(MFXVideoVPP_Init);LOAD(MFXVideoVPP_Close);LOAD(MFXVideoVPP_RunFrameVPPAsync);
#undef LOAD
void*(*display)(int)=dlsym(d,"vaGetDisplayDRM");int(*init)(void*,int*,int*)=dlsym(v,"vaInitialize");terminateDisplay=dlsym(v,"vaTerminate");createSurfaces=dlsym(v,"vaCreateSurfaces");destroySurfaces=dlsym(v,"vaDestroySurfaces");deriveImage=dlsym(v,"vaDeriveImage");destroyImage=dlsym(v,"vaDestroyImage");mapBuffer=dlsym(v,"vaMapBuffer");unmapBuffer=dlsym(v,"vaUnmapBuffer");syncSurface=dlsym(v,"vaSyncSurface");if(!display||!init||!terminateDisplay||!createSurfaces||!destroySurfaces||!deriveImage||!destroyImage||!mapBuffer||!unmapBuffer||!syncSurface)return -1;drm=open("/dev/dri/renderD128",O_RDWR|O_CLOEXEC);if(drm<0)return -1;va=display(drm);int major,minor;if(init(va,&major,&minor))return -1;mfxVersion ver={0};ver.Major=1;ver.Minor=24;if(status(pMFXInit(MFX_IMPL_HARDWARE|MFX_IMPL_VIA_VAAPI,&ver,session),"GPU_INIT"))return -1;mfxIMPL impl=0;if(status(pMFXQueryIMPL(*session,&impl),"GPU_IMPL")||(impl&15)==MFX_IMPL_SOFTWARE)return -1;if(status(pMFXVideoCORE_SetHandle(*session,MFX_HANDLE_VA_DISPLAY,va),"GPU_DISPLAY"))return -1;if(videoMemory){static mfxFrameAllocator allocator;allocator.Alloc=allocVideo;allocator.Free=freeVideo;allocator.Lock=lockVideo;allocator.Unlock=unlockVideo;allocator.GetHDL=handleVideo;if(status(pMFXVideoCORE_SetFrameAllocator(*session,&allocator),"GPU_ALLOCATOR"))return -1;}return 0;}
static mfxFrameInfo info(unsigned w,unsigned h){mfxFrameInfo f={0};f.FourCC=MFX_FOURCC_NV12;f.ChromaFormat=MFX_CHROMAFORMAT_YUV420;f.Width=(w+15)&~15;f.Height=(h+15)&~15;f.CropW=w;f.CropH=h;f.PicStruct=MFX_PICSTRUCT_PROGRESSIVE;f.FrameRateExtN=50;f.FrameRateExtD=1;return f;}
static void gpuClose(mfxSession session){if(session)pMFXClose(session);if(va&&terminateDisplay)terminateDisplay(va);va=NULL;if(drm>=0)close(drm);drm=-1;}
#endif
