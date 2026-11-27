#define _GNU_SOURCE
#include "nv-shm.h"
#include "nv-weave.h"
#include "nv-output.h"
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/file.h>
#include <signal.h>
#include <string.h>
#include <errno.h>
#include <time.h>
#include <linux/videodev2.h>
static int writeAll(const void*p,size_t n){size_t at=0;while(at<n){ssize_t k=write(1,(const char*)p+at,n-at);if(k<0&&errno==EINTR)continue;if(k<=0)return -1;at+=k;}return 0;}
static double nowMs(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec*1000.0+t.tv_nsec/1e6;}
static unsigned char*outputMap;static int outputFd=-1;
static int initOutput(void){outputFd=open(NV_OUT_PATH,O_RDWR|O_CREAT|O_NOFOLLOW|O_CLOEXEC,0600);struct stat st;if(outputFd<0||fstat(outputFd,&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||st.st_nlink!=1||flock(outputFd,LOCK_EX|LOCK_NB)||ftruncate(outputFd,NV_OUT_BYTES)||fchmod(outputFd,0600))return -1;outputMap=mmap(NULL,NV_OUT_BYTES,PROT_READ|PROT_WRITE,MAP_SHARED,outputFd,0);if(outputMap==MAP_FAILED){outputMap=NULL;return -1;}uint32_t*h=(uint32_t*)outputMap;if(h[0]!=NV_OUT_MAGIC||h[1]!=1||h[4]!=NV_OUT_SLOTS){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);nvOutInit(outputMap,(uint32_t)t.tv_nsec^(uint32_t)t.tv_sec^(uint32_t)getpid());}return 0;}
static int sink(void*context,const uint32_t*meta,const unsigned char*data){(void)context;if(!outputMap)return writeAll(meta,40)||writeAll(data,meta[0])?-1:0;char credit;ssize_t n;do{n=read(0,&credit,1);}while(n<0&&errno==EINTR);if(n!=1||credit!='C')return -1;uint32_t ref[6],h[10];if(nvOutPublish(outputMap,meta,data,ref))return -1;memcpy(h,meta,40);h[0]=24;h[1]=NV_REF_MAGIC;return writeAll(h,40)||writeAll(ref,24)?-1:0;}
int main(int argc,char**argv){int shared=argc==2&&!strcmp(argv[1],"--shm");if(argc!=2||(!shared&&strcmp(argv[1],"--read")))return 2;if(shared&&initOutput())return 3;pid_t parent=getppid();if(parent==1||prctl(PR_SET_PDEATHSIG,SIGKILL)||getppid()!=parent)return 2;int fd=open(NV_SHM_PATH,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);struct stat st;if(fd<0||fstat(fd,&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||st.st_nlink!=1||st.st_size!=NV_SHM_BYTES){fprintf(stderr,"NV tap source not provisioned\n");return 3;}unsigned char*map=mmap(NULL,NV_SHM_BYTES,PROT_READ,MAP_SHARED,fd,0);close(fd);if(map==MAP_FAILED)return 3;unsigned char*copy=malloc(NV_MAX+64);NVWeaver weaver={0};weaver.data[0]=malloc(NV_MAX);weaver.data[1]=malloc(NV_MAX);weaver.woven=malloc(NV_MAX);weaver.sink=sink;if(!copy||!weaver.data[0]||!weaver.data[1]||!weaver.woven)return 3;uint32_t*head=(uint32_t*)map;unsigned last=atomic_load_explicit((_Atomic unsigned*)&head[2],memory_order_acquire);for(;;){if(head[0]!=NV_MAGIC){usleep(4000);continue;}unsigned current=atomic_load_explicit((_Atomic unsigned*)&head[2],memory_order_acquire);if(current<last){last=current;nvWeaveReset(&weaver);}if(current==last||!current){if(nvWeaveIdle(&weaver,nowMs(),0))break;usleep(3000);continue;}if(current-last>NV_SLOTS){fprintf(stderr,"NV_SOURCE_GAP %u\n",current-last-NV_SLOTS);last=current-NV_SLOTS;weaver.pending[0]=weaver.pending[1]=0;}unsigned wanted=last+1,slot=NV_SLOTS;for(unsigned i=0;i<NV_SLOTS;i++){uint32_t*test=(uint32_t*)(map+64+(size_t)i*(64+NV_MAX));if(atomic_load_explicit((_Atomic unsigned*)&test[15],memory_order_acquire)==wanted*2&&test[1]==wanted){slot=i;break;}}if(slot==NV_SLOTS){usleep(500);continue;}unsigned char*frame=map+64+(size_t)slot*(64+NV_MAX);uint32_t*m=(uint32_t*)frame;unsigned before=atomic_load_explicit((_Atomic unsigned*)&m[15],memory_order_acquire);if(before&1)continue;unsigned n=m[0],seq=m[1];if(!n||n>NV_MAX)return 4;memcpy(copy,frame,64);memcpy(copy+64,frame+64,n);atomic_thread_fence(memory_order_acquire);if(before!=atomic_load_explicit((_Atomic unsigned*)&m[15],memory_order_acquire))continue;if(seq==last)continue;if(last&&seq>last+1)fprintf(stderr,"NV_SOURCE_GAP %u\n",seq-last-1);last=seq;uint32_t*meta=(uint32_t*)copy;unsigned field=meta[10];if(field==V4L2_FIELD_TOP||field==V4L2_FIELD_BOTTOM){unsigned which=field==V4L2_FIELD_TOP?0:1;if(nvWeaveField(&weaver,meta,copy+64,n,which,nowMs()))break;}else{if(writeAll(copy,40)||writeAll(copy+64,n))break;}}free(copy);free(weaver.data[0]);free(weaver.data[1]);free(weaver.woven);return 0;}
