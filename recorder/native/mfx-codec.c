/* Hardware-only, independent H.264 frames; no camera ownership or disk access. */
#define _GNU_SOURCE
#define MFX_VERSION 1024
#include "intel/mfxvideo.h"
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <dlfcn.h>
#include <signal.h>
#include <sys/prctl.h>
#include <errno.h>
#define MAX_AU (2*1024*1024)
#define LOAD(n) static __typeof__(&n) p##n
LOAD(MFXInit);LOAD(MFXClose);LOAD(MFXQueryIMPL);LOAD(MFXVideoCORE_SetHandle);LOAD(MFXVideoCORE_SetFrameAllocator);LOAD(MFXVideoCORE_SyncOperation);
LOAD(MFXVideoENCODE_Query);LOAD(MFXVideoENCODE_QueryIOSurf);LOAD(MFXVideoENCODE_Init);LOAD(MFXVideoENCODE_Close);LOAD(MFXVideoENCODE_EncodeFrameAsync);
LOAD(MFXVideoDECODE_DecodeHeader);LOAD(MFXVideoDECODE_QueryIOSurf);LOAD(MFXVideoDECODE_Init);LOAD(MFXVideoDECODE_Close);LOAD(MFXVideoDECODE_DecodeFrameAsync);LOAD(MFXVideoDECODE_GetVideoParam);
#undef LOAD
static void*va;
static int(*createSurfaces)(void*,unsigned,unsigned,unsigned,unsigned*,unsigned,void*,unsigned);
static int(*destroySurfaces)(void*,unsigned*,int);
static mfxFrameAllocResponse cached={0};static int references=0;
static mfxStatus allocVideo(mfxHDL u,mfxFrameAllocRequest*r,mfxFrameAllocResponse*out){
 (void)u;int reuse=(r->Type&MFX_MEMTYPE_FROM_DECODE)&&(r->Type&MFX_MEMTYPE_EXTERNAL_FRAME);
 if(reuse&&cached.mids){if(cached.NumFrameActual<r->NumFrameMin)return MFX_ERR_MEMORY_ALLOC;*out=cached;references++;return 0;}
 unsigned n=r->NumFrameSuggested;if(!n||n>64||r->Info.Width!=1280||r->Info.Height!=480||r->Info.FourCC!=MFX_FOURCC_NV12)return MFX_ERR_UNSUPPORTED;
 unsigned*ids=calloc(n,sizeof(*ids));mfxMemId*mids=calloc(n,sizeof(*mids));if(!ids||!mids){free(ids);free(mids);return MFX_ERR_MEMORY_ALLOC;}
 if(createSurfaces(va,1,1280,480,ids,n,NULL,0)){free(ids);free(mids);return MFX_ERR_MEMORY_ALLOC;}
 memset(out,0,sizeof(*out));for(unsigned i=0;i<n;i++)mids[i]=&ids[i];out->mids=mids;out->NumFrameActual=n;
 if(reuse){cached=*out;references=1;}return 0;
}
static mfxStatus freeVideo(mfxHDL u,mfxFrameAllocResponse*r){(void)u;if(!r->mids)return 0;if(r->mids==cached.mids&&--references>0)return 0;destroySurfaces(va,r->mids[0],r->NumFrameActual);free(r->mids[0]);free(r->mids);if(r->mids==cached.mids)cached.mids=NULL;r->mids=NULL;return 0;}
static mfxStatus lockVideo(mfxHDL u,mfxMemId m,mfxFrameData*d){(void)u;(void)m;(void)d;return MFX_ERR_UNSUPPORTED;}
static mfxStatus unlockVideo(mfxHDL u,mfxMemId m,mfxFrameData*d){(void)u;(void)m;(void)d;return 0;}
static mfxStatus handleVideo(mfxHDL u,mfxMemId m,mfxHDL*h){(void)u;*h=m;return 0;}
static int exactRead(void*b,size_t n){size_t at=0;while(at<n){ssize_t x=read(0,(char*)b+at,n-at);if(x<0&&errno==EINTR)continue;if(x<=0)return at?-1:0;at+=x;}return 1;}
static int exactWrite(const void*b,size_t n){size_t at=0;while(at<n){ssize_t x=write(1,(const char*)b+at,n-at);if(x<0&&errno==EINTR)continue;if(x<=0)return -1;at+=x;}return 0;}
static int status(mfxStatus s,const char*where){if(s<0||s==MFX_WRN_PARTIAL_ACCELERATION){fprintf(stderr,"%s: %d\n",where,s);return -1;}return 0;}
static int output(mfxBitstream*bs){if(!bs->DataLength||bs->DataLength>MAX_AU||bs->TimeStamp==MFX_TIMESTAMP_UNKNOWN||bs->TimeStamp%3600)return -1;uint64_t id=bs->TimeStamp/3600;if(id<1||id>0xffffffffU)return -1;uint32_t head[2]={bs->DataLength,(uint32_t)id};if(exactWrite(head,8)||exactWrite(bs->Data+bs->DataOffset,bs->DataLength))return -1;bs->DataLength=bs->DataOffset=0;return 0;}
int main(int argc,char**argv){
 if(argc!=2||strcmp(argv[1],"--6000kbps"))return 2;
 pid_t parent=getppid();if(prctl(PR_SET_PDEATHSIG,SIGKILL)||parent==1||getppid()!=parent)return 2;signal(SIGPIPE,SIG_IGN);setvbuf(stderr,NULL,_IOLBF,0);
 void*v=dlopen("libva.so.1",RTLD_NOW|RTLD_GLOBAL),*d=dlopen("libva-drm.so.1",RTLD_NOW|RTLD_GLOBAL),*m=dlopen("libmfxhw64.so",RTLD_NOW|RTLD_LOCAL);
 if(!v||!d||!m){fprintf(stderr,"hardware libraries: %s\n",dlerror());return 3;}
#define LOAD(n) p##n=dlsym(m,#n);if(!p##n){fprintf(stderr,"missing "#n"\n");return 3;}
 LOAD(MFXInit);LOAD(MFXClose);LOAD(MFXQueryIMPL);LOAD(MFXVideoCORE_SetHandle);LOAD(MFXVideoCORE_SetFrameAllocator);LOAD(MFXVideoCORE_SyncOperation);
 LOAD(MFXVideoENCODE_Query);LOAD(MFXVideoENCODE_QueryIOSurf);LOAD(MFXVideoENCODE_Init);LOAD(MFXVideoENCODE_Close);LOAD(MFXVideoENCODE_EncodeFrameAsync);
 LOAD(MFXVideoDECODE_DecodeHeader);LOAD(MFXVideoDECODE_QueryIOSurf);LOAD(MFXVideoDECODE_Init);LOAD(MFXVideoDECODE_Close);LOAD(MFXVideoDECODE_DecodeFrameAsync);LOAD(MFXVideoDECODE_GetVideoParam);
#undef LOAD
 void*(*display)(int)=dlsym(d,"vaGetDisplayDRM");int(*initialize)(void*,int*,int*)=dlsym(v,"vaInitialize");int(*terminate)(void*)=dlsym(v,"vaTerminate");
 createSurfaces=dlsym(v,"vaCreateSurfaces");destroySurfaces=dlsym(v,"vaDestroySurfaces");if(!display||!initialize||!terminate||!createSurfaces||!destroySurfaces)return 3;
 int fd=open("/dev/dri/renderD128",O_RDWR|O_CLOEXEC);if(fd<0)return 3;va=display(fd);int major,minor;if(initialize(va,&major,&minor))return 3;
 mfxSession session=NULL;mfxVersion version={0};version.Major=1;version.Minor=24;
 if(status(pMFXInit(MFX_IMPL_HARDWARE|MFX_IMPL_VIA_VAAPI,&version,&session),"MFXInit"))return 3;
 mfxIMPL impl=0;if(status(pMFXQueryIMPL(session,&impl),"QueryIMPL")||(impl&15)==MFX_IMPL_SOFTWARE)return 3;
 if(status(pMFXVideoCORE_SetHandle(session,MFX_HANDLE_VA_DISPLAY,va),"SetHandle"))return 3;
 mfxFrameAllocator allocator={0};allocator.Alloc=allocVideo;allocator.Free=freeVideo;allocator.Lock=lockVideo;allocator.Unlock=unlockVideo;allocator.GetHDL=handleVideo;
 if(status(pMFXVideoCORE_SetFrameAllocator(session,&allocator),"SetAllocator"))return 3;
 unsigned char*input=malloc(MAX_AU);mfxBitstream source={0},bs={0};source.Data=input;source.MaxLength=MAX_AU;bs.MaxLength=MAX_AU;bs.Data=malloc(MAX_AU);if(!input||!bs.Data)return 3;
 mfxVideoParam dp={0},ep={0};mfxFrameSurface1*surfaces=NULL;mfxFrameAllocResponse external={0};unsigned ns=0;int initialized=0,result=0;unsigned frames=0;
 for(;;){uint32_t header[2];int got=exactRead(header,8);if(!got)break;if(got<0||header[0]<5||header[0]>MAX_AU||!header[1]||exactRead(input,header[0])!=1){result=4;break;}
  source.DataOffset=0;source.DataLength=header[0];source.DataFlag=MFX_BITSTREAM_COMPLETE_FRAME;source.TimeStamp=(mfxU64)header[1]*3600;
  if(!initialized){
   dp.mfx.CodecId=MFX_CODEC_AVC;dp.AsyncDepth=1;dp.IOPattern=MFX_IOPATTERN_OUT_VIDEO_MEMORY;
   if(status(pMFXVideoDECODE_DecodeHeader(session,&source,&dp),"DecodeHeader")){result=5;break;}
   mfxFrameInfo*f=&dp.mfx.FrameInfo;if(f->Width!=1280||f->Height!=480||f->CropW!=1280||f->CropH!=480||f->FourCC!=MFX_FOURCC_NV12||f->PicStruct!=MFX_PICSTRUCT_PROGRESSIVE){fprintf(stderr,"unsupported camera geometry\n");result=5;break;}
   ep.AsyncDepth=1;ep.IOPattern=MFX_IOPATTERN_IN_VIDEO_MEMORY;ep.mfx.FrameInfo=*f;ep.mfx.FrameInfo.FrameRateExtN=25;ep.mfx.FrameInfo.FrameRateExtD=1;
   ep.mfx.CodecId=MFX_CODEC_AVC;ep.mfx.CodecProfile=MFX_PROFILE_AVC_MAIN;ep.mfx.TargetUsage=MFX_TARGETUSAGE_BALANCED;
   ep.mfx.RateControlMethod=MFX_RATECONTROL_CBR;ep.mfx.TargetKbps=6000;ep.mfx.BufferSizeInKB=1500;ep.mfx.GopPicSize=1;ep.mfx.GopRefDist=1;
   mfxVideoParam queried=ep;mfxFrameAllocRequest dr={0},er={0};
   if(status(pMFXVideoENCODE_Query(session,&ep,&queried),"Encode_Query")){result=5;break;}ep=queried;
   if(status(pMFXVideoENCODE_QueryIOSurf(session,&ep,&er),"Encode_IOSurf")||status(pMFXVideoDECODE_QueryIOSurf(session,&dp,&dr),"Decode_IOSurf")){result=5;break;}
   ns=dr.NumFrameSuggested+er.NumFrameSuggested+2;if(ns>64){result=5;break;}dr.NumFrameSuggested=ns;
   if(status(allocVideo(NULL,&dr,&external),"AllocateVideo")){result=5;break;}surfaces=calloc(ns,sizeof(*surfaces));if(!surfaces){result=5;break;}
   for(unsigned i=0;i<ns;i++){surfaces[i].Info=*f;surfaces[i].Data.MemId=external.mids[i];}
   if(status(pMFXVideoDECODE_Init(session,&dp),"Decode_Init")||status(pMFXVideoENCODE_Init(session,&ep),"Encode_Init")){result=5;break;}
   initialized=1;source.DataOffset=0;source.DataLength=header[0];fprintf(stderr,"HARDWARE_READY impl=%x h264=6000kbps gop=1 surfaces=%u\n",impl,ns);
  }
  /* Each ICAM AU is one I-picture. Complete-frame input prevents waiting for the next AU. */
  mfxFrameSurface1*frame=NULL;mfxSyncPoint decoded=NULL;unsigned j=0;for(;j<ns;j++)if(!surfaces[j].Data.Locked)break;if(j==ns){result=6;break;}
  mfxStatus s;int retries=0;
  do{s=pMFXVideoDECODE_DecodeFrameAsync(session,&source,&surfaces[j],&frame,&decoded);if(s==MFX_WRN_DEVICE_BUSY)usleep(1000);
   if(s==MFX_WRN_VIDEO_PARAM_CHANGED){mfxVideoParam check={0};if(status(pMFXVideoDECODE_GetVideoParam(session,&check),"DecodeParams")||check.mfx.FrameInfo.Width!=1280||check.mfx.FrameInfo.Height!=480||check.mfx.FrameInfo.CropW!=1280||check.mfx.FrameInfo.CropH!=480){result=6;break;}}
  }while((s==MFX_WRN_DEVICE_BUSY||(s==MFX_WRN_VIDEO_PARAM_CHANGED&&!frame))&&++retries<200);
  if(result)break;
  if(s==MFX_ERR_MORE_DATA||s==MFX_ERR_MORE_SURFACE){fprintf(stderr,"unexpected decode buffering %d\n",s);result=6;break;}
  if(status(s,"DecodeFrame")||!frame||!decoded||source.DataLength){fprintf(stderr,"decode id=%u status=%d frame=%p sync=%p remain=%u\n",header[1],s,(void*)frame,(void*)decoded,source.DataLength);result=6;break;}
  mfxSyncPoint encoded=NULL;retries=0;
  do{s=pMFXVideoENCODE_EncodeFrameAsync(session,NULL,frame,&bs,&encoded);if(s==MFX_WRN_DEVICE_BUSY)usleep(1000);}while(s==MFX_WRN_DEVICE_BUSY&&++retries<200);
  if(s==MFX_ERR_MORE_DATA)continue;
  if(status(s,"EncodeFrame")||!encoded||status(pMFXVideoCORE_SyncOperation(session,encoded,1000),"Sync")||output(&bs)){result=7;break;}frames++;
 }
 if(initialized){for(unsigned i=0;i<16;i++){mfxSyncPoint sync=NULL;mfxStatus s=pMFXVideoENCODE_EncodeFrameAsync(session,NULL,NULL,&bs,&sync);if(s==MFX_ERR_MORE_DATA)break;if(status(s,"Drain")||!sync||status(pMFXVideoCORE_SyncOperation(session,sync,1000),"DrainSync")||output(&bs)){result=7;break;}frames++;}pMFXVideoENCODE_Close(session);pMFXVideoDECODE_Close(session);}
 if(external.mids)freeVideo(NULL,&external);pMFXClose(session);terminate(va);close(fd);free(surfaces);free(input);free(bs.Data);fprintf(stderr,"HARDWARE_END frames=%u result=%d\n",frames,result);return result;
}
