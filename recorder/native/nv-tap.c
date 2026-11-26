/* Passive copy of nivi3sink's completed capture buffers. Camera settings/ownership stay OEM. */
#define _GNU_SOURCE
#include "nv-shm.h"
#include <sys/syscall.h>
#include <sys/mman.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <linux/videodev2.h>
#if defined(__has_include)
#if __has_include(<linux/dma-buf.h>)
#include <linux/dma-buf.h>
#endif
#else
#include <linux/dma-buf.h>
#endif
/* Stable Linux UAPI, also available when the build image has pre-4.6 headers. */
#ifndef DMA_BUF_IOCTL_SYNC
struct dma_buf_sync { __u64 flags; };
#define DMA_BUF_SYNC_READ (1ULL << 0)
#define DMA_BUF_SYNC_START (0ULL << 2)
#define DMA_BUF_SYNC_END (1ULL << 2)
#define DMA_BUF_IOCTL_SYNC _IOW('b', 0, struct dma_buf_sync)
#endif
#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#define MAX_FD 4096
#define MAP_COUNT 32
static struct {unsigned w,h,stride,fmt,field;struct {unsigned offset,length,memory;int dma;void*ptr;void*tapMap;}buffers[MAP_COUNT];} devices[MAX_FD];
static unsigned char*shared;static unsigned sequence,slot,sarN=1,sarD=1;static pthread_mutex_t gate=PTHREAD_MUTEX_INITIALIZER;
__attribute__((constructor))static void initTap(void){const char*on=getenv("OWNER_DVR_NV_TAP");if(!on||strcmp(on,"1"))return;const char*sn=getenv("OWNER_DVR_NV_SAR_NUM"),*sd=getenv("OWNER_DVR_NV_SAR_DEN");if(sn)sarN=strtoul(sn,NULL,10);if(sd)sarD=strtoul(sd,NULL,10);if(!sarN||!sarD||sarN>100||sarD>100)return;int fd=open(NV_SHM_PATH,O_RDWR|O_NOFOLLOW|O_CLOEXEC);struct stat st;if(fd<0)return;if(fstat(fd,&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||st.st_nlink!=1||st.st_size!=NV_SHM_BYTES){close(fd);return;}shared=(void*)syscall(SYS_mmap,NULL,NV_SHM_BYTES,PROT_READ|PROT_WRITE,MAP_SHARED,fd,0);close(fd);if(shared==MAP_FAILED){shared=NULL;return;}memset(shared,0,64);uint32_t*h=(uint32_t*)shared;h[0]=NV_MAGIC;h[1]=1;h[4]=NV_SLOTS;}
static void capture(int fd,struct v4l2_buffer*b){if(!shared||!atomic_load_explicit((_Atomic unsigned*)((uint32_t*)shared+5),memory_order_acquire)||fd<0||fd>=MAX_FD||b->type!=V4L2_BUF_TYPE_VIDEO_CAPTURE||b->index>=MAP_COUNT||(b->flags&V4L2_BUF_FLAG_ERROR))return;unsigned w=devices[fd].w,h=devices[fd].h,stride=devices[fd].stride,fmt=devices[fd].fmt;unsigned bytes=stride*h;if(fmt==V4L2_PIX_FMT_NV12)bytes=bytes*3/2;else if(fmt!=V4L2_PIX_FMT_GREY&&fmt!=V4L2_PIX_FMT_YUYV&&fmt!=V4L2_PIX_FMT_UYVY)return;if(w<16||w>1024||h<16||h>576||(w&1)||!bytes||bytes>NV_MAX||bytes>b->bytesused)return;void*ptr=NULL;int dma=-1;
 if(b->memory==V4L2_MEMORY_MMAP){ptr=devices[fd].buffers[b->index].ptr;if(bytes>devices[fd].buffers[b->index].length)return;}
 else if(b->memory==V4L2_MEMORY_DMABUF){dma=devices[fd].buffers[b->index].dma;if(dma<0||bytes>devices[fd].buffers[b->index].length)return;ptr=devices[fd].buffers[b->index].tapMap;if(!ptr){ptr=(void*)syscall(SYS_mmap,NULL,devices[fd].buffers[b->index].length,PROT_READ,MAP_SHARED,dma,0);if(ptr==MAP_FAILED)return;devices[fd].buffers[b->index].tapMap=ptr;}}
 else return;if(!ptr)return;struct dma_buf_sync sync={.flags=DMA_BUF_SYNC_START|DMA_BUF_SYNC_READ};if(dma>=0)syscall(SYS_ioctl,dma,DMA_BUF_IOCTL_SYNC,&sync);
 struct timespec now;clock_gettime(CLOCK_MONOTONIC,&now);uint64_t ns=(uint64_t)now.tv_sec*1000000000+now.tv_nsec;if((b->flags&V4L2_BUF_FLAG_TIMESTAMP_MASK)==V4L2_BUF_FLAG_TIMESTAMP_MONOTONIC)ns=(uint64_t)b->timestamp.tv_sec*1000000000+(uint64_t)b->timestamp.tv_usec*1000;slot=(slot+1)%NV_SLOTS;unsigned char*out=shared+64+(size_t)slot*(64+NV_MAX);uint32_t*m=(uint32_t*)out;unsigned seq=++sequence;atomic_store_explicit((_Atomic unsigned*)&m[15],seq*2-1,memory_order_seq_cst);m[0]=bytes;m[1]=seq;memcpy(out+8,&ns,8);m[4]=w;m[5]=h;m[6]=stride;m[7]=fmt;m[8]=sarN;m[9]=sarD;m[10]=b->field;m[11]=b->sequence;memcpy(out+64,ptr,bytes);atomic_store_explicit((_Atomic unsigned*)&m[15],seq*2,memory_order_release);uint32_t*head=(uint32_t*)shared;atomic_store_explicit((_Atomic unsigned*)&head[3],slot,memory_order_release);atomic_store_explicit((_Atomic unsigned*)&head[2],seq,memory_order_release);if(dma>=0){sync.flags=DMA_BUF_SYNC_END|DMA_BUF_SYNC_READ;syscall(SYS_ioctl,dma,DMA_BUF_IOCTL_SYNC,&sync);}}
static void clearBuffers(int fd){for(unsigned i=0;i<MAP_COUNT;i++){if(devices[fd].buffers[i].tapMap)syscall(SYS_munmap,devices[fd].buffers[i].tapMap,devices[fd].buffers[i].length);memset(&devices[fd].buffers[i],0,sizeof(devices[fd].buffers[i]));devices[fd].buffers[i].dma=-1;}}
int ioctl(int fd,unsigned long request,...){va_list args;va_start(args,request);void*arg=va_arg(args,void*);va_end(args);int ret=syscall(SYS_ioctl,fd,request,arg);if(ret<0||!shared||fd<0||fd>=MAX_FD||pthread_mutex_trylock(&gate))return ret;
 if((request==VIDIOC_G_FMT||request==VIDIOC_S_FMT)&&arg){struct v4l2_format*f=arg;if(f->type==V4L2_BUF_TYPE_VIDEO_CAPTURE){devices[fd].w=f->fmt.pix.width;devices[fd].h=f->fmt.pix.height;devices[fd].stride=f->fmt.pix.bytesperline;devices[fd].fmt=f->fmt.pix.pixelformat;devices[fd].field=f->fmt.pix.field;}}
 else if(request==VIDIOC_REQBUFS&&arg){struct v4l2_requestbuffers*b=arg;if(b->type==V4L2_BUF_TYPE_VIDEO_CAPTURE)clearBuffers(fd);}
 else if((request==VIDIOC_QUERYBUF||request==VIDIOC_QBUF)&&arg){struct v4l2_buffer*b=arg;if(b->type==V4L2_BUF_TYPE_VIDEO_CAPTURE&&b->index<MAP_COUNT){devices[fd].buffers[b->index].memory=b->memory;if(b->memory==V4L2_MEMORY_MMAP){devices[fd].buffers[b->index].offset=b->m.offset;devices[fd].buffers[b->index].length=b->length;}else if(b->memory==V4L2_MEMORY_DMABUF){if(devices[fd].buffers[b->index].dma!=(int)b->m.fd&&devices[fd].buffers[b->index].tapMap){syscall(SYS_munmap,devices[fd].buffers[b->index].tapMap,devices[fd].buffers[b->index].length);devices[fd].buffers[b->index].tapMap=NULL;}devices[fd].buffers[b->index].dma=b->m.fd;devices[fd].buffers[b->index].length=b->length?b->length:devices[fd].stride*devices[fd].h;}}}
 else if(request==VIDIOC_DQBUF&&arg)capture(fd,arg);pthread_mutex_unlock(&gate);return ret;}
void*mmap(void*addr,size_t length,int prot,int flags,int fd,off_t offset){void*p=(void*)syscall(SYS_mmap,addr,length,prot,flags,fd,offset);if(shared&&p!=MAP_FAILED&&fd>=0&&fd<MAX_FD&&!pthread_mutex_lock(&gate)){for(unsigned i=0;i<MAP_COUNT;i++)if(devices[fd].buffers[i].length==length&&devices[fd].buffers[i].offset==(unsigned)offset&&devices[fd].buffers[i].memory==V4L2_MEMORY_MMAP)devices[fd].buffers[i].ptr=p;pthread_mutex_unlock(&gate);}return p;}
void*mmap64(void*addr,size_t length,int prot,int flags,int fd,off64_t offset){return mmap(addr,length,prot,flags,fd,(off_t)offset);}
